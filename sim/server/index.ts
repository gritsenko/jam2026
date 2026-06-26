// Telemetry backend entry point. Run: `npm start` (or `npm run dev`) from sim/server/.
// Listens on PORT (default 8787). CORS is open for dev (the Vite game origin posts here).

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerRoutes } from './routes.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 1_000_000, // 1 MB — batches are capped at 500 events upstream
});

await app.register(cors, { origin: true });
registerRoutes(app);

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
