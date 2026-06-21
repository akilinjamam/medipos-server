import path from 'path';
import { promises as fs } from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Object storage for generated artefacts — invoice/report PDFs (design doc §2,
 * §4). Uses AWS S3 when configured; otherwise falls back to the local disk so
 * the feature works in dev/VPS setups without S3 (same optional-integration
 * pattern as Redis and the SMS gateway).
 */
let client: S3Client | null = null;

export function isS3Configured(): boolean {
  return Boolean(env.AWS_S3_BUCKET && env.AWS_REGION);
}

function getS3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.AWS_REGION,
      // Fall back to the default credential chain (IAM role, shared config) when
      // explicit keys aren't supplied.
      ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return client;
}

export interface StoredObject {
  key: string;
  url: string;
  /** Where the object actually went, for callers/logs. */
  storage: 's3' | 'local';
}

/**
 * Store `body` under `key` and return a retrievable URL. With S3 configured the
 * object is uploaded and an https URL returned; otherwise it's written under
 * `LOCAL_STORAGE_DIR` and a `file://` URL returned.
 */
export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<StoredObject> {
  if (isS3Configured()) {
    await getS3().send(
      new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    const base =
      env.S3_PUBLIC_BASE_URL ??
      `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com`;
    return { key, url: `${base.replace(/\/$/, '')}/${key}`, storage: 's3' };
  }

  // Local fallback: mirror the key as a path under the storage dir.
  const dest = path.resolve(env.LOCAL_STORAGE_DIR, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, body);
  logger.info(`S3 not configured — stored ${key} on local disk (${dest})`);
  return { key, url: `file://${dest}`, storage: 'local' };
}
