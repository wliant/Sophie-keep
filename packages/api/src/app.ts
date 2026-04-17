import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { registerRequestContext } from './middleware/request-context.js';
import { healthRoutes } from './routes/health.js';
import { itemsRoutes } from './routes/items.js';
import { itemTypesRoutes } from './routes/item-types.js';
import { roomsRoutes } from './routes/rooms.js';
import { locationsRoutes } from './routes/storage-locations.js';
import { floorPlanRoutes } from './routes/floor-plan.js';
import { photosRoutes } from './routes/photos.js';
import { shoppingRoutes } from './routes/shopping-list.js';
import { settingsRoutes } from './routes/settings.js';
import { backupsRoutes } from './routes/backups.js';
import { quickAddRoutes } from './routes/quick-add.js';

export async function buildApp(): Promise<FastifyInstance> {
  const isDev = config.nodeEnv !== 'production';
  const app = Fastify({
    logger: isDev
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
      : true,
    bodyLimit: 12 * 1024 * 1024,
    trustProxy: false,
  });

  await app.register(multipart, {
    limits: { fileSize: config.maxPhotoBytes, files: config.maxPhotosPerItem + 2 },
  });

  registerRequestContext(app);
  app.setErrorHandler(errorHandler);

  // Register routes
  await app.register(healthRoutes);
  await app.register(itemsRoutes);
  await app.register(itemTypesRoutes);
  await app.register(roomsRoutes);
  await app.register(locationsRoutes);
  await app.register(floorPlanRoutes);
  await app.register(photosRoutes);
  await app.register(shoppingRoutes);
  await app.register(settingsRoutes);
  await app.register(backupsRoutes);
  await app.register(quickAddRoutes);

  // Serve frontend in production if built
  if (fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, {
      root: path.resolve(config.webDistDir),
      prefix: '/',
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        notFoundHandler(req, reply);
        return;
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler(notFoundHandler);
  }

  return app;
}
