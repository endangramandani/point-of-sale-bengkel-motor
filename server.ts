import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { loadDb } from './server/db.js';
import { registerApiRoutes } from './server/routes.js';

async function startServer() {
  loadDb();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  registerApiRoutes(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BENGKEL MOTOR server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
