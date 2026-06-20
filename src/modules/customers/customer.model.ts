import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

export interface PrescriptionEntry {
  date: Date;
  doctorName?: string;
  notes?: string;
  /** S3 key for a scanned prescription image, if uploaded. */
  fileKey?: string;
}

export interface CustomerDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  phone?: string;
  /** Outstanding receivable owed by this customer (credit sales). */
  dueBalance: number;
  prescriptionHistory: PrescriptionEntry[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const prescriptionSchema = new Schema<PrescriptionEntry>(
  {
    date: { type: Date, default: Date.now },
    doctorName: { type: String, trim: true },
    notes: { type: String, trim: true },
    fileKey: { type: String, trim: true },
  },
  { _id: false },
);

const customerSchema = new Schema<CustomerDoc>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    dueBalance: { type: Number, default: 0 },
    prescriptionHistory: { type: [prescriptionSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

customerSchema.plugin(tenantScopePlugin);

// Customer lookup by phone at the counter.
customerSchema.index({ tenantId: 1, phone: 1 });

export const Customer = model<CustomerDoc>('Customer', customerSchema);
