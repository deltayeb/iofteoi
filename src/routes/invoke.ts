import { Hono } from 'hono';
import { z } from 'zod';
import { db, protocols, accounts, invocations, balanceTransactions, unusableReports } from '../db';
import { eq, sql } from 'drizzle-orm';
import { verifyJWT } from './auth';

export const invoke = new Hono();

const PLATFORM_FEE_PERCENT = 15;
const HANDLER_TIMEOUT_MS = 30000;

const invokeSchema = z.object({
  input: z.any(),
  debugSharing: z.boolean().optional().default(false),
});

const reportSchema = z.object({
  reason: z.string().optional(),
});

// Helper: Extract input metadata
function extractInputMetadata(input: unknown): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  if (typeof input === 'string') {
    metadata.type = 'string';
    metadata.length = input.length;
  } else if (Buffer.isBuffer(input)) {
    metadata.type = 'buffer';
    metadata.size = input.length;
  } else if (typeof input === 'object' && input !== null) {
    metadata.type = 'object';
    metadata.keys = Object.keys(input);
  } else {
    metadata.type = typeof input;
  }

  return metadata;
}

// POST /invoke/:protocolId - Invoke a protocol
invoke.post('/:protocolId', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const protocolId = c.req.param('protocolId');
  const body = await c.req.json();
  const parsed = invokeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.issues }, 400);
  }

  const { input, debugSharing } = parsed.data;

  // Get protocol
  const [protocol] = await db.select().from(protocols).where(eq(protocols.id, protocolId));
  if (!protocol) {
    return c.json({ error: 'Protocol not found' }, 404);
  }

  if (protocol.status !== 'ACTIVE') {
    return c.json({ error: `Protocol is ${protocol.status.toLowerCase()}` }, 400);
  }

  // Get caller account
  const [caller] = await db.select().from(accounts).where(eq(accounts.id, payload.sub));
  if (!caller) {
    return c.json({ error: 'Account not found' }, 404);
  }

  // Check balance
  if (caller.balanceCents < protocol.pricePerInvocationCents) {
    return c.json({
      error: 'Insufficient balance',
      required: protocol.pricePerInvocationCents,
      available: caller.balanceCents,
    }, 402);
  }

  // Calculate fees
  const platformFeeCents = Math.floor(protocol.pricePerInvocationCents * PLATFORM_FEE_PERCENT / 100);
  const publisherAmountCents = protocol.pricePerInvocationCents - platformFeeCents;

  // Create pending invocation and reserve balance (atomic)
  const [invocation] = await db.insert(invocations).values({
    callerId: payload.sub,
    protocolId: protocol.id,
    amountCents: protocol.pricePerInvocationCents,
    publisherAmountCents,
    platformFeeCents,
    status: 'PENDING',
    debugSharing,
    inputMetadata: extractInputMetadata(input),
  }).returning();

  // Debit caller balance
  await db.update(accounts)
    .set({ balanceCents: sql`${accounts.balanceCents} - ${protocol.pricePerInvocationCents}` })
    .where(eq(accounts.id, payload.sub));

  // Record balance transaction
  await db.insert(balanceTransactions).values({
    accountId: payload.sub,
    amountCents: -protocol.pricePerInvocationCents,
    type: 'INVOCATION',
    referenceId: invocation.id,
  });

  // Call the protocol handler
  let handlerResponse;
  let handlerError: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HANDLER_TIMEOUT_MS);

    const response = await fetch(protocol.handlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input,
        invocationId: invocation.id,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 422) {
      // REFUSED - protocol explicitly refused this input
      const refusalData = await response.json().catch(() => ({}));

      // Refund the caller
      await db.update(accounts)
        .set({ balanceCents: sql`${accounts.balanceCents} + ${protocol.pricePerInvocationCents}` })
        .where(eq(accounts.id, payload.sub));

      await db.insert(balanceTransactions).values({
        accountId: payload.sub,
        amountCents: protocol.pricePerInvocationCents,
        type: 'REFUND',
        referenceId: invocation.id,
      });

      await db.update(invocations)
        .set({ status: 'REFUSED', errorClass: 'REFUSED' })
        .where(eq(invocations.id, invocation.id));

      return c.json({
        invocationId: invocation.id,
        status: 'REFUSED',
        refusalCode: refusalData.code || 'REFUSED',
        refusalMessage: refusalData.message || 'Protocol refused this input',
      });
    }

    if (!response.ok) {
      handlerError = `HTTP ${response.status}`;
    } else {
      handlerResponse = await response.json();
    }
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        handlerError = 'TIMEOUT';
      } else {
        handlerError = err.message;
      }
    } else {
      handlerError = 'Unknown error';
    }
  }

  // Handle failure
  if (handlerError) {
    // Refund the caller
    await db.update(accounts)
      .set({ balanceCents: sql`${accounts.balanceCents} + ${protocol.pricePerInvocationCents}` })
      .where(eq(accounts.id, payload.sub));

    await db.insert(balanceTransactions).values({
      accountId: payload.sub,
      amountCents: protocol.pricePerInvocationCents,
      type: 'REFUND',
      referenceId: invocation.id,
    });

    // Update invocation status
    await db.update(invocations)
      .set({ status: 'FAILURE', errorClass: handlerError })
      .where(eq(invocations.id, invocation.id));

    // Update protocol stats
    await db.update(protocols)
      .set({
        invocationCount: sql`${protocols.invocationCount} + 1`,
        failureCount: sql`${protocols.failureCount} + 1`,
      })
      .where(eq(protocols.id, protocol.id));

    return c.json({
      invocationId: invocation.id,
      status: 'FAILURE',
      error: handlerError,
    }, 502);
  }

  // Success!
  await db.update(invocations)
    .set({ status: 'SUCCESS' })
    .where(eq(invocations.id, invocation.id));

  // Credit the publisher
  await db.update(accounts)
    .set({ publisherBalanceCents: sql`${accounts.publisherBalanceCents} + ${publisherAmountCents}` })
    .where(eq(accounts.id, protocol.publisherId));

  await db.insert(balanceTransactions).values({
    accountId: protocol.publisherId,
    amountCents: publisherAmountCents,
    type: 'EARNING',
    referenceId: invocation.id,
  });

  // Update protocol stats
  await db.update(protocols)
    .set({
      invocationCount: sql`${protocols.invocationCount} + 1`,
      successCount: sql`${protocols.successCount} + 1`,
    })
    .where(eq(protocols.id, protocol.id));

  // Update caller trust score (+1, capped at 200)
  await db.update(accounts)
    .set({ trustScore: sql`LEAST(${accounts.trustScore} + 1, 200)` })
    .where(eq(accounts.id, payload.sub));

  return c.json({
    invocationId: invocation.id,
    status: 'SUCCESS',
    output: handlerResponse,
  });
});

// POST /invocations/:id/report - Report unusable output
invoke.post('/invocations/:id/report', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const invocationId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = reportSchema.safeParse(body);
  const reason = parsed.success ? parsed.data.reason : undefined;

  // Get the invocation
  const [invocation] = await db.select().from(invocations).where(eq(invocations.id, invocationId));
  if (!invocation) {
    return c.json({ error: 'Invocation not found' }, 404);
  }

  // Verify the caller owns this invocation
  if (invocation.callerId !== payload.sub) {
    return c.json({ error: 'Not authorized to report this invocation' }, 403);
  }

  // Can only report successful invocations
  if (invocation.status !== 'SUCCESS') {
    return c.json({ error: 'Can only report successful invocations' }, 400);
  }

  // Check if already reported
  const existingReport = await db.select().from(unusableReports).where(eq(unusableReports.invocationId, invocationId));
  if (existingReport.length > 0) {
    return c.json({ error: 'Already reported' }, 409);
  }

  // Get caller trust score
  const [caller] = await db.select().from(accounts).where(eq(accounts.id, payload.sub));

  // Get protocol for refund rate calculation
  const [protocol] = await db.select().from(protocols).where(eq(protocols.id, invocation.protocolId));

  // Calculate if this report should be flagged (caller reports > 3x protocol baseline)
  // For now, flag if trust score is low
  const shouldFlag = caller.trustScore < 50;
  const autoRefund = caller.trustScore >= 50;

  // Create the report
  await db.insert(unusableReports).values({
    invocationId,
    callerId: payload.sub,
    protocolId: invocation.protocolId,
    reason,
    flagged: shouldFlag,
  });

  if (autoRefund) {
    // Refund the caller
    await db.update(accounts)
      .set({ balanceCents: sql`${accounts.balanceCents} + ${invocation.amountCents}` })
      .where(eq(accounts.id, payload.sub));

    await db.insert(balanceTransactions).values({
      accountId: payload.sub,
      amountCents: invocation.amountCents,
      type: 'REFUND',
      referenceId: invocation.id,
    });

    // Deduct from publisher
    await db.update(accounts)
      .set({ publisherBalanceCents: sql`${accounts.publisherBalanceCents} - ${invocation.publisherAmountCents}` })
      .where(eq(accounts.id, protocol.publisherId));

    // Update invocation status
    await db.update(invocations)
      .set({ status: 'REFUNDED' })
      .where(eq(invocations.id, invocationId));

    // Update protocol stats
    await db.update(protocols)
      .set({ refundCount: sql`${protocols.refundCount} + 1` })
      .where(eq(protocols.id, protocol.id));

    // Decrease caller trust score
    await db.update(accounts)
      .set({ trustScore: sql`GREATEST(${accounts.trustScore} - 10, 0)` })
      .where(eq(accounts.id, payload.sub));
  }

  return c.json({
    reported: true,
    refunded: autoRefund,
    flagged: shouldFlag,
    message: autoRefund
      ? 'Report accepted, refund processed'
      : 'Report flagged for manual review',
  });
});
