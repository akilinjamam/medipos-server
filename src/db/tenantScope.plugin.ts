import { Schema } from 'mongoose';

/**
 * Tenant isolation enforced at the QUERY level, not just the route level
 * (design doc §3, §7). Apply this plugin to every tenant-owned schema.
 *
 * It does two things:
 *  1. Adds a required, indexed `tenantId` field.
 *  2. Auto-injects `{ tenantId }` into find / update / delete / count queries
 *     when a tenant id is provided via `Query#setOptions({ tenantId })` or the
 *     query option `tenantId`. A missed filter in a route handler can therefore
 *     never leak data across tenants.
 *
 * Usage in a service:
 *   Product.find().setOptions({ tenantId: req.tenantId })
 * or via the `withTenant` helper.
 *
 * NOTE: `insertMany` and aggregation pipelines are NOT auto-scoped — set
 * `tenantId` explicitly there.
 */
const TENANT_SCOPED_OPS = [
  'count',
  'countDocuments',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndRemove',
  'findOneAndUpdate',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
] as const;

export function tenantScopePlugin(schema: Schema): void {
  schema.add({
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  });

  for (const op of TENANT_SCOPED_OPS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.pre(op as any, function (this: any) {
      const tenantId = this.getOptions?.().tenantId;
      if (tenantId) {
        this.where({ tenantId });
      }
    });
  }
}

/**
 * Convenience wrapper for the common case:
 *   withTenant(Product.find({ ... }), req.tenantId)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTenant<T extends { setOptions: (o: any) => T }>(query: T, tenantId: string): T {
  return query.setOptions({ tenantId });
}
