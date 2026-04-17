import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import type { ErrorEnvelope } from '@sophie/shared';

export function errorHandler(
  err: Error | FastifyError,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  const request_id = (reply.getHeader('x-request-id') as string) || undefined;

  if (err instanceof AppError) {
    const envelope: ErrorEnvelope = {
      error: { code: err.code, message: err.message, fields: err.fields, request_id },
    };
    reply.status(err.status).send(envelope);
    return;
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.length === 0 ? '_' : issue.path.join('.');
      if (!fields[key]) fields[key] = [];
      fields[key]!.push(issue.message);
    }
    const envelope: ErrorEnvelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fields,
        request_id,
      },
    };
    reply.status(400).send(envelope);
    return;
  }

  const msg = (err as { message?: string })?.message || '';
  const code = (err as { code?: string })?.code || '';

  if (code === 'FST_REQ_FILE_TOO_LARGE' || msg.includes('file too large')) {
    const envelope: ErrorEnvelope = {
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'File exceeds maximum size', request_id },
    };
    reply.status(413).send(envelope);
    return;
  }

  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || msg.includes('UNIQUE constraint')) {
    const envelope: ErrorEnvelope = {
      error: { code: 'CONFLICT_UNIQUE', message: 'Uniqueness constraint violated', request_id },
    };
    reply.status(409).send(envelope);
    return;
  }

  if (
    code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    msg.includes('FOREIGN KEY constraint')
  ) {
    const envelope: ErrorEnvelope = {
      error: {
        code: 'CONFLICT_REFERENCED',
        message: 'Referenced or referencing record prevents this operation',
        request_id,
      },
    };
    reply.status(409).send(envelope);
    return;
  }

  req.log.error({ err }, 'unhandled error');
  const envelope: ErrorEnvelope = {
    error: { code: 'INTERNAL_ERROR', message: 'Internal error', request_id },
  };
  reply.status(500).send(envelope);
}

export function notFoundHandler(req: FastifyRequest, reply: FastifyReply): void {
  const request_id = (reply.getHeader('x-request-id') as string) || undefined;
  const envelope: ErrorEnvelope = {
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found`, request_id },
  };
  reply.status(404).send(envelope);
}
