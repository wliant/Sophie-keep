import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

let client: S3Client | null = null;
let bucketName: string = '';

export function initS3(
  endpoint: string,
  accessKey: string,
  secretKey: string,
  bucket: string,
): void {
  client = new S3Client({
    endpoint,
    region: 'us-east-1', // required by SDK even for MinIO
    forcePathStyle: true, // required for MinIO
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  bucketName = bucket;
}

export function getS3(): S3Client {
  if (!client) throw new Error('S3 client not initialized');
  return client;
}

export function getBucket(): string {
  return bucketName;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getS3().send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

export async function getObject(key: string): Promise<Buffer> {
  const res = await getS3().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  if (!res.Body) throw new Error(`No body for S3 key: ${key}`);
  return streamToBuffer(res.Body as Readable);
}

export async function deleteObject(key: string): Promise<void> {
  await getS3().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

export async function listPrefix(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await getS3().send(
      new ListObjectsV2Command({
        Bucket: getBucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

export async function deletePrefix(prefix: string): Promise<void> {
  const keys = await listPrefix(prefix);
  if (keys.length === 0) return;
  // DeleteObjects supports up to 1000 keys per call
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await getS3().send(
      new DeleteObjectsCommand({
        Bucket: getBucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      }),
    );
  }
}

export async function ensureBucket(): Promise<void> {
  try {
    await getS3().send(new HeadBucketCommand({ Bucket: getBucket() }));
  } catch {
    await getS3().send(new CreateBucketCommand({ Bucket: getBucket() }));
  }
}
