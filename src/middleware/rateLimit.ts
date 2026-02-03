import { Context, Next } from 'hono';

// Simple in-memory rate limiter
// In production with multiple instances, use Redis instead

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function rateLimit(options: {
  windowMs?: number;
  max?: number;
  keyGenerator?: (c: Context) => string;
} = {}) {
  const windowMs = options.windowMs || 60 * 1000; // 1 minute default
  const max = options.max || 100; // 100 requests per window default
  const keyGenerator = options.keyGenerator || ((c: Context) => {
    // Use auth token if present, otherwise IP
    const auth = c.req.header('Authorization');
    if (auth) {
      return `auth:${auth.slice(0, 50)}`;
    }
    return `ip:${c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'}`;
  });

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, max - entry.count).toString());
    c.header('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());

    if (entry.count > max) {
      return c.json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      }, 429);
    }

    await next();
  };
}

// Stricter rate limit for auth endpoints (prevent brute force)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  keyGenerator: (c) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    return `auth:${ip}`;
  },
});

// Standard API rate limit
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
});

// Invocation rate limit (more generous for paying users)
export const invokeRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 invocations per minute
});
