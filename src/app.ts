import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './routes/auth';
import { protocols } from './routes/protocols';
import { invoke } from './routes/invoke';
import { balance } from './routes/balance';
import { leaderboard } from './routes/leaderboard';
import { landing } from './routes/landing';
import { tools } from './routes/tools';
import { apiRateLimit, authRateLimit, invokeRateLimit } from './middleware/rateLimit';
import { inputLimit } from './middleware/inputLimit';

export const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', inputLimit({ maxSize: 1024 * 1024 })); // 1MB max

// Rate limiting per route type
app.use('/auth/*', authRateLimit);
app.use('/invoke/*', invokeRateLimit);
app.use('/protocols/*', apiRateLimit);
app.use('/balance/*', apiRateLimit);
app.use('/leaderboard/*', apiRateLimit);

// Landing page (HTML)
app.route('/home', landing);

// API status
app.get('/api', (c) => {
  return c.json({
    name: 'The International Office for the Exchange of Intelligence',
    version: '0.1.0',
    status: 'operational',
  });
});

// Redirect root to landing
app.get('/', (c) => {
  const accept = c.req.header('Accept') || '';
  if (accept.includes('text/html')) {
    return c.redirect('/home');
  }
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
app.route('/tools', tools);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});
