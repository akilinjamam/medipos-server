import mongoose, { Schema } from 'mongoose';

/**
 * Global JSON serialization for every Mongoose model.
 *
 * API responses use a clean `id` (string) instead of Mongo's `_id`, and omit the
 * internal `__v` version key. This keeps the wire shape consistent across all
 * collections so clients (the dashboard/POS) can rely on `id` everywhere —
 * matching the manual `id` mapping already done in the auth/tenant services.
 *
 * Registered via `mongoose.plugin(...)`, which only applies to schemas compiled
 * *after* registration — so this module must be imported before any model (see
 * the first import in `server.ts`). It self-registers on import; the exported
 * function is also callable (e.g. from tests) and is idempotent.
 *
 * Embedded subdocuments declared with `{ _id: false }` (e.g. tenant branding)
 * have no `_id`, so they're left untouched.
 */
let registered = false;

export function registerSerializationPlugin(): void {
  if (registered) return;
  registered = true;

  mongoose.plugin((schema: Schema) => {
    schema.set('toJSON', {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        if (ret._id !== undefined) {
          ret.id = String(ret._id);
          delete ret._id;
        }
        // Defensive: never let a password hash escape via JSON, even if selected.
        delete ret.passwordHash;
        return ret;
      },
    });
  });
}

registerSerializationPlugin();
