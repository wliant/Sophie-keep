import { createHash } from 'node:crypto';
import fs from 'node:fs';

export function sha256File(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filepath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function sha256Buffer(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}
