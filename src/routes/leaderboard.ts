import { Hono } from 'hono';
import { db, protocols } from '../db';
import { eq, desc, gte, sql } from 'drizzle-orm';

export const leaderboard = new Hono();

const MIN_INVOCATIONS_FOR_LEADERBOARD = 50;

// GET /leaderboard - Public leaderboard
leaderboard.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const results = await db.select({
    id: protocols.id,
    name: protocols.name,
    version: protocols.version,
    description: protocols.description,
    pricePerInvocationCents: protocols.pricePerInvocationCents,
    invocationCount: protocols.invocationCount,
    successCount: protocols.successCount,
    failureCount: protocols.failureCount,
    refundCount: protocols.refundCount,
    declaredKeywords: protocols.declaredKeywords,
    earnedKeywords: protocols.earnedKeywords,
  })
    .from(protocols)
    .where(
      sql`${protocols.status} = 'ACTIVE' AND ${protocols.invocationCount} >= ${MIN_INVOCATIONS_FOR_LEADERBOARD}`
    )
    .orderBy(
      // Primary: success rate (descending)
      desc(sql`CASE WHEN ${protocols.successCount} + ${protocols.failureCount} > 0
        THEN ${protocols.successCount}::float / (${protocols.successCount} + ${protocols.failureCount})
        ELSE 0 END`),
      // Secondary: invocation volume (descending)
      desc(protocols.invocationCount),
      // Tertiary: price (ascending - cheaper is better for ties)
      protocols.pricePerInvocationCents
    )
    .limit(limit)
    .offset(offset);

  // Format the results
  const leaderboard = results.map((p, index) => {
    const totalCompleted = p.successCount + p.failureCount;
    const successRate = totalCompleted > 0
      ? (p.successCount / totalCompleted * 100).toFixed(1)
      : '0.0';
    const refundRate = p.invocationCount > 0
      ? (p.refundCount / p.invocationCount * 100).toFixed(1)
      : '0.0';

    return {
      rank: offset + index + 1,
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      pricePerInvocationCents: p.pricePerInvocationCents,
      pricePerInvocationDollars: (p.pricePerInvocationCents / 100).toFixed(2),
      invocationCount: p.invocationCount,
      successRate: `${successRate}%`,
      refundRate: `${refundRate}%`,
      keywords: [...(p.earnedKeywords || []), ...(p.declaredKeywords || [])],
    };
  });

  return c.json({
    leaderboard,
    meta: {
      minInvocationsRequired: MIN_INVOCATIONS_FOR_LEADERBOARD,
      limit,
      offset,
    },
  });
});
