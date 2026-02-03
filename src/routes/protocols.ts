import { Hono } from 'hono';
import { z } from 'zod';
import { db, protocols, accounts } from '../db';
import { eq, ilike, or, desc, and } from 'drizzle-orm';
import { verifyJWT } from './auth';

export const protocols_route = new Hono();

// 7-word description validator
function countWords(str: string): number {
  // Hyphenated compounds count as one word
  return str.trim().split(/\s+/).length;
}

const createProtocolSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(20),
  description: z.string().refine((d) => countWords(d) === 7, {
    message: 'Description must be exactly 7 words',
  }),
  longDescription: z.string().optional(),
  declaredKeywords: z.array(z.string()).max(10).optional(),
  handlerUrl: z.string().url(),
  pricePerInvocationCents: z.number().int().min(1), // Minimum $0.01
});

const searchSchema = z.object({
  q: z.string().optional(),
  keyword: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// GET /protocols - Search/list protocols
protocols_route.get('/', async (c) => {
  const query = c.req.query();
  const parsed = searchSchema.safeParse(query);

  if (!parsed.success) {
    return c.json({ error: 'Invalid query', details: parsed.error.issues }, 400);
  }

  const { q, keyword, limit, offset } = parsed.data;

  let results;
  if (q) {
    // Search by name or description
    results = await db.select({
      id: protocols.id,
      name: protocols.name,
      version: protocols.version,
      description: protocols.description,
      declaredKeywords: protocols.declaredKeywords,
      earnedKeywords: protocols.earnedKeywords,
      pricePerInvocationCents: protocols.pricePerInvocationCents,
      invocationCount: protocols.invocationCount,
      successCount: protocols.successCount,
      status: protocols.status,
      createdAt: protocols.createdAt,
    })
      .from(protocols)
      .where(and(
        eq(protocols.status, 'ACTIVE'),
        or(
          ilike(protocols.name, `%${q}%`),
          ilike(protocols.description, `%${q}%`)
        )
      ))
      .orderBy(desc(protocols.invocationCount))
      .limit(limit)
      .offset(offset);
  } else {
    // List all active protocols
    results = await db.select({
      id: protocols.id,
      name: protocols.name,
      version: protocols.version,
      description: protocols.description,
      declaredKeywords: protocols.declaredKeywords,
      earnedKeywords: protocols.earnedKeywords,
      pricePerInvocationCents: protocols.pricePerInvocationCents,
      invocationCount: protocols.invocationCount,
      successCount: protocols.successCount,
      status: protocols.status,
      createdAt: protocols.createdAt,
    })
      .from(protocols)
      .where(eq(protocols.status, 'ACTIVE'))
      .orderBy(desc(protocols.invocationCount))
      .limit(limit)
      .offset(offset);
  }

  return c.json({ protocols: results });
});

// GET /protocols/:id - Get protocol details
protocols_route.get('/:id', async (c) => {
  const id = c.req.param('id');

  const [protocol] = await db.select({
    id: protocols.id,
    publisherId: protocols.publisherId,
    name: protocols.name,
    version: protocols.version,
    description: protocols.description,
    longDescription: protocols.longDescription,
    declaredKeywords: protocols.declaredKeywords,
    earnedKeywords: protocols.earnedKeywords,
    handlerUrl: protocols.handlerUrl,
    pricePerInvocationCents: protocols.pricePerInvocationCents,
    status: protocols.status,
    invocationCount: protocols.invocationCount,
    successCount: protocols.successCount,
    failureCount: protocols.failureCount,
    refundCount: protocols.refundCount,
    createdAt: protocols.createdAt,
    updatedAt: protocols.updatedAt,
  }).from(protocols).where(eq(protocols.id, id));

  if (!protocol) {
    return c.json({ error: 'Protocol not found' }, 404);
  }

  // Calculate success rate
  const totalCompleted = protocol.successCount + protocol.failureCount;
  const successRate = totalCompleted > 0
    ? (protocol.successCount / totalCompleted * 100).toFixed(1)
    : null;

  return c.json({
    ...protocol,
    successRate: successRate ? `${successRate}%` : 'N/A',
  });
});

// POST /protocols - Publish a new protocol
protocols_route.post('/', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const body = await c.req.json();
  const parsed = createProtocolSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.issues }, 400);
  }

  const data = parsed.data;

  // Check for existing protocol with same name+version
  const existing = await db.select()
    .from(protocols)
    .where(and(
      eq(protocols.publisherId, payload.sub),
      eq(protocols.name, data.name),
      eq(protocols.version, data.version)
    ));

  if (existing.length > 0) {
    return c.json({ error: 'Protocol with this name and version already exists' }, 409);
  }

  const [protocol] = await db.insert(protocols).values({
    publisherId: payload.sub,
    name: data.name,
    version: data.version,
    description: data.description,
    longDescription: data.longDescription,
    declaredKeywords: data.declaredKeywords || [],
    handlerUrl: data.handlerUrl,
    pricePerInvocationCents: data.pricePerInvocationCents,
  }).returning();

  return c.json({ protocol }, 201);
});

// PATCH /protocols/:id - Deprecate a protocol
protocols_route.patch('/:id', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const id = c.req.param('id');
  const body = await c.req.json();

  // Find the protocol
  const [protocol] = await db.select().from(protocols).where(eq(protocols.id, id));
  if (!protocol) {
    return c.json({ error: 'Protocol not found' }, 404);
  }

  // Verify ownership
  if (protocol.publisherId !== payload.sub) {
    return c.json({ error: 'Not authorized to modify this protocol' }, 403);
  }

  // Only allow deprecation
  if (body.status === 'DEPRECATED') {
    const sunsetDate = new Date();
    sunsetDate.setDate(sunsetDate.getDate() + 30); // 30-day grace period

    await db.update(protocols)
      .set({
        status: 'DEPRECATED',
        deprecatedAt: new Date(),
        deprecationReason: body.reason || 'Deprecated by publisher',
        sunsetDate,
        updatedAt: new Date(),
      })
      .where(eq(protocols.id, id));

    return c.json({ success: true, sunsetDate });
  }

  return c.json({ error: 'Invalid status update' }, 400);
});

// GET /protocols/:id/stats - Get protocol stats (publisher only)
protocols_route.get('/:id/stats', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const id = c.req.param('id');

  const [protocol] = await db.select().from(protocols).where(eq(protocols.id, id));
  if (!protocol) {
    return c.json({ error: 'Protocol not found' }, 404);
  }

  // Verify ownership
  if (protocol.publisherId !== payload.sub) {
    return c.json({ error: 'Not authorized to view stats' }, 403);
  }

  const totalCompleted = protocol.successCount + protocol.failureCount;
  const successRate = totalCompleted > 0
    ? (protocol.successCount / totalCompleted * 100).toFixed(1)
    : null;
  const refundRate = protocol.invocationCount > 0
    ? (protocol.refundCount / protocol.invocationCount * 100).toFixed(1)
    : null;

  return c.json({
    protocolId: protocol.id,
    invocationCount: protocol.invocationCount,
    successCount: protocol.successCount,
    failureCount: protocol.failureCount,
    refundCount: protocol.refundCount,
    successRate: successRate ? `${successRate}%` : 'N/A',
    refundRate: refundRate ? `${refundRate}%` : 'N/A',
    status: protocol.status,
  });
});

export { protocols_route as protocols };
