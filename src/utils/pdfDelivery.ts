import { Response } from 'express';
import { isS3Configured, uploadBuffer } from '../config/storage';

/** A rendered PDF ready to be either archived (S3) or streamed to the client. */
export interface GeneratedPdf {
  buffer: Buffer;
  /** Storage key used when S3 is configured (e.g. `products/<tenantId>/...pdf`). */
  key: string;
  /** Friendly name for the browser download when streaming. */
  filename: string;
}

/**
 * Deliver a generated PDF. With S3 configured the file is uploaded and a
 * `StoredObject` (retrievable URL) is returned as JSON — unchanged behaviour.
 * Without S3 the bytes are streamed straight to the browser as an attachment so
 * the user gets a direct download instead of a `file://` path they can't open.
 */
export async function deliverPdf(res: Response, gen: GeneratedPdf): Promise<void> {
  if (isS3Configured()) {
    const stored = await uploadBuffer(gen.key, gen.buffer, 'application/pdf');
    res.json({ data: stored });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${gen.filename}"`);
  res.send(gen.buffer);
}
