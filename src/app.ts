import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './routes/auth';
import { protocols } from './routes/protocols';
import { invoke } from './routes/invoke';
import { balance } from './routes/balance';
import { leaderboard } from './routes/leaderboard';

export const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'The International Office for the Exchange of Intelligence',
    version: '0.1.0',
    status: 'operational',
  });
});

// Routes
app.route('/auth', auth);
app.route('/protocols', protocols);
app.route('/invoke', invoke);
app.route('/balance', balance);
app.route('/leaderboard', leaderboard);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});
