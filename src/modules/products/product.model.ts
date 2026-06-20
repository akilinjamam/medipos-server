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

// Barcode lookup at the counter — unique per tenant when present (sparse).
productSchema.index({ tenantId: 1, barcode: 1 }, { unique: true, sparse: true });
// Catalog search by name / generic name.
productSchema.index({ tenantId: 1, name: 1 });
productSchema.index({ tenantId: 1, genericName: 1 });

export const Product = model<ProductDoc>('Product', productSchema);
