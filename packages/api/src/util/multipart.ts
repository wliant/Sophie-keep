import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { payloadTooLarge, validation } from '../errors.js';

export interface MultipartForm {
  fields: Record<string, string>;
  files: Array<{
    fieldname: string;
    filename: string;
    mimetype: string;
    buffer: Buffer;
  }>;
}

export interface MultipartOptions {
  maxFileBytes: number;
  maxFiles?: number;
  // If true, a file whose size exceeds maxFileBytes is rejected immediately
  // instead of being buffered in full. Default true.
  rejectOversizeEarly?: boolean;
}

/**
 * Parse a multipart/form-data request into plain field+file objects.
 *
 * Enforces the maximum file size while streaming (so a client that sends a
 * 100 MB blob cannot exhaust server memory before the size check runs). Also
 * consumes any remaining part streams so the connection doesn't stall.
 */
export async function parseMultipartForm(
  req: FastifyRequest,
  opts: MultipartOptions,
): Promise<MultipartForm> {
  if (!req.isMultipart()) throw validation('multipart/form-data required');
  const { maxFileBytes, maxFiles = 20, rejectOversizeEarly = true } = opts;
  const fields: Record<string, string> = {};
  const files: MultipartForm['files'] = [];

  for await (const part of req.parts()) {
    if (part.type === 'field') {
      fields[part.fieldname] = String(part.value);
      continue;
    }
    // file part
    const filePart = part as MultipartFile;
    if (files.length >= maxFiles) {
      await drainPart(filePart);
      throw validation(`too many files (max ${maxFiles})`);
    }
    const buffer = await readBoundedBuffer(filePart, maxFileBytes, rejectOversizeEarly);
    files.push({
      fieldname: filePart.fieldname,
      filename: filePart.filename,
      mimetype: filePart.mimetype,
      buffer,
    });
  }

  return { fields, files };
}

async function readBoundedBuffer(
  part: MultipartFile,
  max: number,
  rejectEarly: boolean,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of part.file) {
    size += (chunk as Buffer).length;
    if (size > max) {
      // Stop buffering immediately; drain the rest so the socket is clean.
      if (rejectEarly) {
        await drainStream(part.file);
        throw payloadTooLarge(`file "${part.filename}" exceeds ${max} bytes`);
      }
    } else {
      chunks.push(chunk as Buffer);
    }
  }
  // Fastify's own limit may have truncated the stream; verify.
  if (part.file.truncated) {
    throw payloadTooLarge(`file "${part.filename}" exceeds ${max} bytes`);
  }
  return Buffer.concat(chunks);
}

async function drainPart(part: MultipartFile): Promise<void> {
  await drainStream(part.file);
}

async function drainStream(stream: AsyncIterable<unknown>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of stream) {
    // discard
  }
}
