import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { parseId } from '../util/params.js';
import {
  deletePhoto,
  getPhoto,
  photoFiles,
  uploadPhoto,
} from '../services/photo-service.js';
import {
  magicBytesMismatch,
  payloadTooLarge,
  unsupportedMediaType,
  validation,
} from '../errors.js';
import { config } from '../config.js';

export async function photosRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/photos', async (req, reply) => {
    if (!req.isMultipart()) throw validation('multipart required');
    let ownerKind: 'item' | 'floor_plan' | undefined;
    let ownerId: string | undefined;
    const uploaded: Array<unknown> = [];

    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'owner_kind') ownerKind = String(part.value) as 'item' | 'floor_plan';
        if (part.fieldname === 'owner_id') ownerId = String(part.value);
      } else if (part.type === 'file') {
        if (!ownerKind || !ownerId) {
          // Discard remaining data so the stream is consumed
          await part.toBuffer();
          throw validation('owner_kind and owner_id must precede files');
        }
        let buffer: Buffer;
        try {
          buffer = await part.toBuffer();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('file too large') || msg.includes('LIMIT_FILE_SIZE')) {
            throw payloadTooLarge('file too large');
          }
          throw e;
        }
        if (buffer.length > config.maxPhotoBytes) {
          throw payloadTooLarge('file too large');
        }
        const mime = part.mimetype;
        if (!mime) throw unsupportedMediaType('missing mime type');
        const result = await uploadPhoto(getDb(), ownerKind, ownerId, mime, buffer);
        uploaded.push(result.photo);
      }
    }
    void magicBytesMismatch;
    reply.status(201);
    return { items: uploaded };
  });

  app.get('/api/v1/photos/:id', async (req, reply) => {
    const id = parseId(req.params);
    const q = z.object({ variant: z.enum(['thumb', 'original']).optional() }).parse(req.query);
    const p = getPhoto(getDb(), id);
    const files = photoFiles(p);
    const target = q.variant === 'thumb' ? files.thumb : files.original;
    if (!target) throw validation('photo file not available');
    reply.header('content-type', q.variant === 'thumb' ? 'image/webp' : p.mime_type);
    reply.header('cache-control', 'private, max-age=86400');
    return reply.send(fs.createReadStream(target));
  });

  app.delete('/api/v1/photos/:id', async (req, reply) => {
    const id = parseId(req.params);
    deletePhoto(getDb(), id);
    reply.status(204);
    return null;
  });
}
