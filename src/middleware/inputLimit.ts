import { Context, Next } from 'hono';

const MAX_BODY_SIZE = 1024 * 1024; // 1MB default
const MAX_JSON_DEPTH = 10;

export function inputLimit(options: {
  maxSize?: number;
} = {}) {
  const maxSize = options.maxSize || MAX_BODY_SIZE;

  return async (c: Context, next: Next) => {
    const contentLength = c.req.header('content-length');

    if (contentLength && parseInt(contentLength) > maxSize) {
      return c.json({
        error: 'Payload too large',
        maxSize: maxSize,
        maxSizeMB: (maxSize / 1024 / 1024).toFixed(1),
      }, 413);
    }

    await next();
  };
}

// Check JSON depth to prevent deeply nested objects
function getJsonDepth(obj: unknown, currentDepth = 0): number {
  if (currentDepth > MAX_JSON_DEPTH) return currentDepth;

  if (typeof obj !== 'object' || obj === null) {
    return currentDepth;
  }

  let maxDepth = currentDepth;

  for (const value of Object.values(obj)) {
    const depth = getJsonDepth(value, currentDepth + 1);
    if (depth > maxDepth) maxDepth = depth;
  }

  return maxDepth;
}

export function jsonDepthLimit(maxDepth = MAX_JSON_DEPTH) {
  return async (c: Context, next: Next) => {
    if (c.req.header('content-type')?.includes('application/json')) {
      try {
        const body = await c.req.json();
        const depth = getJsonDepth(body);

        if (depth > maxDepth) {
          return c.json({
            error: 'JSON nesting too deep',
            maxDepth: maxDepth,
          }, 400);
        }

        // Store parsed body for later use
        c.set('parsedBody', body);
      } catch {
        // Let the route handler deal with invalid JSON
      }
    }

    await next();
  };
}
