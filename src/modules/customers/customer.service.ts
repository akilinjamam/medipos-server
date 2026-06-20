import { FilterQuery } from 'mongoose';
import { Customer, CustomerDoc } from './customer.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { ApiError } from '../../utils/ApiError';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  SettleDueInput,
  AddPrescriptionInput,
  ListCustomersQuery,
} from './customer.validation';

/**
 * Customer directory, due ledger and prescription history (design doc §5, §6).
 * Prescription history is a Platinum feature on the dashboard, but the store is
 * here so it can be populated from earlier tiers.
 */
export const customerService = {
  async list(tenantId: string, query: ListCustomersQuery): Promise<CustomerDoc[]> {
    const filter: FilterQuery<CustomerDoc> = {};
    if (query.search) {
      const rx = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = [{ name: rx }, { phone: rx }];
    }
    if (query.hasDue === true) filter.dueBalance = { $gt: 0 };

    return withTenant(Customer.find(filter), tenantId).sort({ name: 1 });
  },

  async getById(tenantId: string, id: string): Promise<CustomerDoc> {
    const customer = await withTenant(Customer.findById(id), tenantId);
    if (!customer) throw ApiError.notFound('Customer not found');
    return customer;
  },

  async create(tenantId: string, input: CreateCustomerInput): Promise<CustomerDoc> {
    return Customer.create({ tenantId, ...input });
  },

  async update(tenantId: string, id: string, input: UpdateCustomerInput): Promise<CustomerDoc> {
    const customer = await withTenant(
      Customer.findByIdAndUpdate(id, input, { new: true, runValidators: true }),
      tenantId,
    );
    if (!customer) throw ApiError.notFound('Customer not found');
    return customer;
  },

  /** Record a customer payment, reducing their outstanding due. */
  async settleDue(tenantId: string, id: string, input: SettleDueInput): Promise<CustomerDoc> {
    const customer = await withTenant(
      Customer.findByIdAndUpdate(id, { $inc: { dueBalance: -input.amount } }, { new: true }),
      tenantId,
    );
    if (!customer) throw ApiError.notFound('Customer not found');
    return customer;
  },

  async addPrescription(
    tenantId: string,
    id: string,
    input: AddPrescriptionInput,
  ): Promise<CustomerDoc> {
    const entry = { ...input, date: input.date ?? new Date() };
    const customer = await withTenant(
      Customer.findByIdAndUpdate(id, { $push: { prescriptionHistory: entry } }, { new: true }),
      tenantId,
    );
    if (!customer) throw ApiError.notFound('Customer not found');
    return customer;
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
