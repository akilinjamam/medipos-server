import { randomInt } from 'crypto';

/**
 * Human-friendly tenant login codes (e.g. "MP-4K7TQ2") — what pharmacy staff
 * type at sign-in instead of a raw 24-char ObjectId. The code is only a lookup
 * alias: auth resolves it to `Tenant._id` and everything downstream keeps using
 * the indexed ObjectId.
 */

// No 0/O/1/I/L — codes get read aloud over the counter and written on paper.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_PREFIX = 'MP-';

/** Accepts generated codes and reasonable custom ones ("LAZZ-01", "MEDI2"). */
export const TENANT_CODE_REGEX = /^[A-Z0-9][A-Z0-9-]{2,14}$/;

export function generateTenantCode(): string {
  let body = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${CODE_PREFIX}${body}`;
}
