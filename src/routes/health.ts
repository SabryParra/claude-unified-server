import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) =>
  c.json({
    status: 'ok',
    version: '0.1.0-alpha.0',
    uptime_sec: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }),
);

healthRoutes.get('/ready', (c) => c.text('ready', 200));
