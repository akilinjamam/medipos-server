import { Supplier, SupplierDoc } from './supplier.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { ApiError } from '../../utils/ApiError';
import {
  CreateSupplierInput,
  UpdateSupplierInput,
  SettleDueInput,
} from './supplier.validation';

export const supplierService = {
  async list(tenantId: string): Promise<SupplierDoc[]> {
    return withTenant(Supplier.find(), tenantId).sort({ name: 1 });
  },

  async getById(tenantId: string, id: string): Promise<SupplierDoc> {
    const supplier = await withTenant(Supplier.findById(id), tenantId);
    if (!supplier) throw ApiError.notFound('Supplier not found');
    return supplier;
  },

  async create(tenantId: string, input: CreateSupplierInput): Promise<SupplierDoc> {
    return Supplier.create({ tenantId, ...input });
  },

  async update(tenantId: string, id: string, input: UpdateSupplierInput): Promise<SupplierDoc> {
    const supplier = await withTenant(
      Supplier.findByIdAndUpdate(id, input, { new: true, runValidators: true }),
      tenantId,
    );
    if (!supplier) throw ApiError.notFound('Supplier not found');
    return supplier;
  },

  /** Record a payment to the supplier, decrementing the outstanding due. */
  async settleDue(tenantId: string, id: string, input: SettleDueInput): Promise<SupplierDoc> {
    const supplier = await withTenant(
      Supplier.findByIdAndUpdate(id, { $inc: { dueBalance: -input.amount } }, { new: true }),
      tenantId,
    );
    if (!supplier) throw ApiError.notFound('Supplier not found');
    return supplier;
  },
};
