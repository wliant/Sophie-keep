import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPool } from '../db/postgres.js';
import {
  deletePhoto,
  getPhoto,
  photoKeys,
  uploadPhoto,
} from '../services/photo-service.js';
import { getObject } from '../storage/s3.js';
import { unsupportedMediaType, validation } from '../errors.js';
import { config } from '../config.js';
import { parseId } from '../util/params.js';
import { parseMultipartForm } from '../util/multipart.js';

export async function photosRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/photos', async (req, reply) => {
    const form = await parseMultipartForm(req, {
      maxFileBytes: config.maxPhotoBytes,
      maxFiles: config.maxPhotosPerItem,
    });
    const ownerKind = form.fields.owner_kind as 'item' | 'floor_plan' | undefined;
    const ownerId = form.fields.owner_id;
    if (!ownerKind || !ownerId) {
      throw validation('owner_kind and owner_id are required');
    }
    if (form.files.length === 0) {
      throw validation('at least one file required');
    }
    const uploaded = [];
    for (const file of form.files) {
      if (!file.mimetype) throw unsupportedMediaType('missing mime type');
      const result = await uploadPhoto(
        getPool(),
        ownerKind,
        ownerId,
        file.mimetype,
        file.buffer,
      );
      uploaded.push(result.photo);
    }
    reply.status(201);
    return { items: uploaded };
  });

  app.get('/api/v1/photos/:id', async (req, reply) => {
    const id = parseId(req.params);
    const q = z.object({ variant: z.enum(['thumb', 'original']).optional() }).parse(req.query);
    const p = await getPhoto(getPool(), id);
    const keys = photoKeys(p.file_path, p.mime_type);
    const key = q.variant === 'thumb' ? keys.thumb : keys.original;
    let buf: Buffer;
    try {
      buf = await getObject(key);
    } catch {
      throw validation('photo file not available');
    }
    reply.header('content-type', q.variant === 'thumb' ? 'image/webp' : p.mime_type);
    reply.header('cache-control', 'private, max-age=86400');
    return reply.send(buf);
  });

  app.delete('/api/v1/photos/:id', async (req, reply) => {
    const id = parseId(req.params);
    await deletePhoto(getPool(), id);
    reply.status(204);
    return null;
  });
}
