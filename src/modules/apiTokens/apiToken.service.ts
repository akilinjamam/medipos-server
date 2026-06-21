import { randomBytes, createHash } from 'crypto';
import { ApiToken, ApiTokenDoc } from './apiToken.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { ApiError } from '../../utils/ApiError';
import { AuthPayload } from '../../types/express';
import { CreateApiTokenInput } from './apiToken.validation';

const TOKEN_PREFIX = 'mpk_';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface IssuedApiToken {
  /** The raw secret — returned ONCE; never retrievable again. */
  token: string;
  record: ApiTokenDoc;
}

export const apiTokenService = {
  /** Mint a new token. Returns the raw secret plus the stored (hashed) record. */
  async issue(
    tenantId: string,
    userId: string,
    input: CreateApiTokenInput,
  ): Promise<IssuedApiToken> {
    const raw = TOKEN_PREFIX + randomBytes(24).toString('hex');
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const record = await ApiToken.create({
      tenantId,
      name: input.name,
      tokenHash: hashToken(raw),
      prefix: raw.slice(0, TOKEN_PREFIX.length + 6),
      role: input.role ?? 'manager',
      createdBy: userId,
      expiresAt,
    });

    return { token: raw, record };
  },

  /** List a tenant's tokens (metadata only — never the secret). */
  async list(tenantId: string): Promise<ApiTokenDoc[]> {
    return withTenant(ApiToken.find(), tenantId).sort({ createdAt: -1 });
  },

  /** Revoke a token so it can no longer authenticate. */
  async revoke(tenantId: string, id: string): Promise<void> {
    const token = await withTenant(
      ApiToken.findByIdAndUpdate(id, { isActive: false, revokedAt: new Date() }, { new: true }),
      tenantId,
    );
    if (!token) throw ApiError.notFound('API token not found');
  },

  /**
   * Authenticate a raw token. Returns the auth payload it stands for, or null if
   * the token is unknown/revoked/expired. Side-effect: stamps `lastUsedAt`.
   * Lookup is intentionally NOT tenant-scoped — the tenant is derived here.
   */
  async authenticate(raw: string): Promise<AuthPayload | null> {
    if (!raw.startsWith(TOKEN_PREFIX)) return null;

    const token = await ApiToken.findOne({ tokenHash: hashToken(raw) });
    if (!token || !token.isActive || token.revokedAt) return null;
    if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return null;

    // Best-effort usage stamp; don't block the request on it.
    void ApiToken.updateOne({ _id: token._id }, { $set: { lastUsedAt: new Date() } }).catch(
      () => undefined,
    );

    return {
      userId: String(token.createdBy),
      tenantId: String(token.tenantId),
      role: token.role,
    };
  },
};
