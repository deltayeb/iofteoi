import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import { db, accounts, agentTokens } from '../db';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export const auth = new Hono();

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');
const SALT_ROUNDS = 10;

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const createAgentSchema = z.object({
  name: z.string().optional(),
});

// Helper: Create JWT
async function createJWT(accountId: string): Promise<string> {
  return new SignJWT({ sub: accountId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

// Helper: Verify JWT
export async function verifyJWT(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { sub: string };
  } catch {
    return null;
  }
}

// POST /auth/register
auth.post('/register', async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.issues }, 400);
  }

  const { email, password } = parsed.data;

  // Check if email already exists
  const existing = await db.select().from(accounts).where(eq(accounts.email, email));
  if (existing.length > 0) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  // Hash password and create account
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const [account] = await db.insert(accounts).values({
    email,
    passwordHash,
  }).returning();

  const token = await createJWT(account.id);

  return c.json({
    account: {
      id: account.id,
      email: account.email,
      balanceCents: account.balanceCents,
      createdAt: account.createdAt,
    },
    token,
  }, 201);
});

// POST /auth/login
auth.post('/login', async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.issues }, 400);
  }

  const { email, password } = parsed.data;

  // Find account
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email));
  if (!account) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Verify password
  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = await createJWT(account.id);

  return c.json({
    account: {
      id: account.id,
      email: account.email,
      balanceCents: account.balanceCents,
      createdAt: account.createdAt,
    },
    token,
  });
});

// POST /auth/agents - Create agent token
auth.post('/agents', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = createAgentSchema.safeParse(body);
  const name = parsed.success ? parsed.data.name : undefined;

  // Generate a random token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(rawToken, SALT_ROUNDS);

  const [agentToken] = await db.insert(agentTokens).values({
    accountId: payload.sub,
    tokenHash,
    name,
  }).returning();

  return c.json({
    id: agentToken.id,
    name: agentToken.name,
    token: rawToken, // Only returned once!
    createdAt: agentToken.createdAt,
  }, 201);
});

// DELETE /auth/agents/:id - Revoke agent token
auth.delete('/agents/:id', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const tokenId = c.req.param('id');

  // Find the token and verify ownership
  const [token] = await db.select().from(agentTokens).where(eq(agentTokens.id, tokenId));
  if (!token || token.accountId !== payload.sub) {
    return c.json({ error: 'Token not found' }, 404);
  }

  // Revoke by setting revokedAt
  await db.update(agentTokens)
    .set({ revokedAt: new Date() })
    .where(eq(agentTokens.id, tokenId));

  return c.json({ success: true });
});

// GET /auth/agents - List agent tokens
auth.get('/agents', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(authHeader.slice(7));
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const tokens = await db.select({
    id: agentTokens.id,
    name: agentTokens.name,
    createdAt: agentTokens.createdAt,
    revokedAt: agentTokens.revokedAt,
  }).from(agentTokens).where(eq(agentTokens.accountId, payload.sub));

  return c.json({ tokens });
});
