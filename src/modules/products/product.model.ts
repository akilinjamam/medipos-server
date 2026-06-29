import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

export type ProductCategory = 'OTC' | 'Rx' | 'Controlled';

export interface ProductDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  genericName?: string;
  brand?: string;
  manufacturer?: string;
  dosageForm?: string;
  strength?: string;
  category: ProductCategory;
  unit?: string;
  unitsPerBox?: number;
  barcode?: string;
  reorderLevel: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<ProductDoc>(
  {
    name: { type: String, required: true, trim: true },
    genericName: { type: String, trim: true },
    brand: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    dosageForm: { type: String, trim: true },
    strength: { type: String, trim: true },
    category: { type: String, enum: ['OTC', 'Rx', 'Controlled'], default: 'OTC' },
    unit: { type: String, trim: true },
    unitsPerBox: { type: Number, min: 1 },
    barcode: { type: String, trim: true },
    reorderLevel: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.plugin(tenantScopePlugin);

// Barcode lookup at the counter — unique per tenant *when a barcode is present*.
// PARTIAL (not sparse): a sparse *compound* index isn't skipped for barcode-less
// products because `tenantId` is always present, so every product without a
// barcode would index as { tenant, null } and the 2nd such product collides.
// Restrict uniqueness to docs whose barcode is actually a string (same fix as
// the Sale `clientUuid` index).
productSchema.index(
  { tenantId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
);
// Catalog search by name / generic name.
productSchema.index({ tenantId: 1, name: 1 });
productSchema.index({ tenantId: 1, genericName: 1 });

export const Product = model<ProductDoc>('Product', productSchema);
