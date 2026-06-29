import { describe, it, expect } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { registerSerializationPlugin } from '../src/db/serialization.plugin';

/**
 * Verifies the global toJSON transform without needing a DB connection — model
 * definition + `toJSON()` work offline. The plugin only applies to schemas
 * compiled after registration, so we register first, then define the throwaway
 * model (importing the plugin module also self-registers; this is idempotent).
 */
registerSerializationPlugin();

const widgetSchema = new Schema({
  name: String,
  passwordHash: String,
  meta: new Schema({ label: String }, { _id: false }),
});

const Widget = mongoose.model('SerWidget', widgetSchema);

describe('global serialization plugin', () => {
  it('maps _id to a string id and drops __v', () => {
    const doc = new Widget({ name: 'a' });
    const json = doc.toJSON() as Record<string, unknown>;

    expect(typeof json.id).toBe('string');
    expect(json.id).toBe(String(doc._id));
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
  });

  it('strips passwordHash even if present', () => {
    const doc = new Widget({ name: 'a', passwordHash: 'secret' });
    const json = doc.toJSON() as Record<string, unknown>;
    expect(json.passwordHash).toBeUndefined();
  });

  it('leaves _id-less subdocuments untouched (no "undefined" id)', () => {
    const doc = new Widget({ name: 'a', meta: { label: 'x' } });
    const json = doc.toJSON() as Record<string, unknown>;
    const meta = json.meta as Record<string, unknown>;
    expect(meta.id).toBeUndefined();
    expect(meta).toEqual({ label: 'x' });
  });
});
