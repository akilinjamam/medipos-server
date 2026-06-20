import { Plan } from '../config/planFeatures';

export interface AuthPayload {
  userId: string;
  tenantId: string;
  role: 'owner' | 'manager' | 'cashier';
  branchId?: string;
}

export interface TenantContext {
  id: string;
  plan: Plan;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Decoded JWT access-token payload, set by `authenticate`. */
      auth?: AuthPayload;
      /** Tenant id resolved from the authenticated user (design doc §3, §6). */
      tenantId?: string;
      /** Resolved tenant context (plan, etc.) for feature gating. */
      tenant?: TenantContext;
    }
  }
}

export {};
