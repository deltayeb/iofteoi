import { Hono } from 'hono';
import { db, accounts, balanceTransactions } from '../db';
import { eq, desc } from 'drizzle-orm';
import { verifyJWT } from './auth';

export const balance = new Hono();

// GET /balance - Get current balance
balance.get('/', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const [account] = await db.select({
    balanceCents: accounts.balanceCents,
    publisherBalanceCents: accounts.publisherBalanceCents,
  }).from(accounts).where(eq(accounts.id, payload.sub));

  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }

  return c.json({
    balance: {
      cents: account.balanceCents,
      dollars: (account.balanceCents / 100).toFixed(2),
    },
    publisherBalance: {
      cents: account.publisherBalanceCents,
      dollars: (account.publisherBalanceCents / 100).toFixed(2),
    },
  });
});

// GET /balance/transactions - Get transaction history
balance.get('/transactions', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const transactions = await db.select()
    .from(balanceTransactions)
    .where(eq(balanceTransactions.accountId, payload.sub))
    .orderBy(desc(balanceTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    transactions: transactions.map((t) => ({
      id: t.id,
      amountCents: t.amountCents,
      amountDollars: (t.amountCents / 100).toFixed(2),
      type: t.type,
      referenceId: t.referenceId,
      createdAt: t.createdAt,
    })),
  });
});

// POST /balance/deposit - Initiate a deposit (placeholder for Stripe)
balance.post('/deposit', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const body = await c.req.json();
  const amountCents = body.amountCents;

  if (!amountCents || amountCents < 500) {
    return c.json({ error: 'Minimum deposit is $5.00 (500 cents)' }, 400);
  }

  // TODO: Integrate with Stripe Checkout
  // For now, return a placeholder response
  return c.json({
    message: 'Stripe integration pending',
    amountCents,
    // In production, this would return a Stripe checkout URL
    // checkoutUrl: 'https://checkout.stripe.com/...'
  });
});

// POST /balance/withdraw - Request a withdrawal (publisher only)
balance.post('/withdraw', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.id, payload.sub));
  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const body = await c.req.json();
  const amountCents = body.amountCents || account.publisherBalanceCents;

  if (amountCents < 1000) {
    return c.json({ error: 'Minimum withdrawal is $10.00 (1000 cents)' }, 400);
  }

  if (amountCents > account.publisherBalanceCents) {
    return c.json({
      error: 'Insufficient publisher balance',
      requested: amountCents,
      available: account.publisherBalanceCents,
    }, 400);
  }

  // TODO: Integrate with Stripe Connect for payouts
  // For now, return a placeholder response
  return c.json({
    message: 'Stripe Connect integration pending',
    amountCents,
    amountDollars: (amountCents / 100).toFixed(2),
    // In production, this would initiate a payout
  });
});
