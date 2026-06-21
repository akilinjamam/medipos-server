import { ClientSession, FilterQuery } from 'mongoose';
import { Sale, SaleDoc } from './sale.model';
import { Batch } from '../batches/batch.model';
import { Customer } from '../customers/customer.model';
import { Product } from '../products/product.model';
import { Tenant } from '../tenants/tenant.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { withTransaction } from '../../db/withTransaction';
import { ApiError } from '../../utils/ApiError';
import { generateInvoicePdf } from '../../utils/pdf';
import { uploadBuffer, StoredObject } from '../../config/storage';
import {
  CreateSaleInput,
  OfflineSaleInput,
  BulkSyncInput,
  ListSalesQuery,
} from './sale.validation';

/** Raised when a batch can't satisfy a requested quantity — never oversell. */
export class InsufficientStockError extends ApiError {
  constructor(public readonly batchId: string) {
    super(409, 'Insufficient batch stock to complete the sale');
  }
}

interface FinalizeMeta {
  clientUuid?: string;
  syncedFromOffline?: boolean;
  createdAt?: Date;
}

function computeTotal(items: CreateSaleInput['items']): number {
  return items.reduce((sum, it) => {
    const net = it.qty * it.unitPrice - it.discount;
    if (net < 0) throw ApiError.badRequest('Line discount exceeds line total');
    return sum + net;
  }, 0);
}

/**
 * Core sale finalization (design doc rule #5). Runs inside the given session:
 * each batch is decremented with an atomic stock guard so concurrent checkouts
 * can never oversell. Throws `InsufficientStockError` (aborting the txn) if any
 * batch lacks stock.
 */
async function finalizeInSession(
  session: ClientSession,
  tenantId: string,
  cashierId: string,
  input: CreateSaleInput,
  meta: FinalizeMeta = {},
): Promise<SaleDoc> {
  const totalAmount = computeTotal(input.items);
  const paidAmount = input.paidAmount ?? (input.paymentMethod === 'due' ? 0 : totalAmount);
  if (paidAmount > totalAmount) throw ApiError.badRequest('paidAmount exceeds total');

  const dueAmount = totalAmount - paidAmount;
  if (dueAmount > 0 && !input.customerId) {
    throw ApiError.badRequest('A customer is required for a sale with a due amount');
  }

  const items = [];
  for (const line of input.items) {
    // Atomic guard: only decrements if enough stock remains in THIS batch.
    const batch = await Batch.findOneAndUpdate(
      { _id: line.batchId, tenantId, quantityInStock: { $gte: line.qty } },
      { $inc: { quantityInStock: -line.qty } },
      { new: true, session },
    );
    if (!batch) throw new InsufficientStockError(String(line.batchId));

    items.push({
      productId: line.productId,
      batchId: line.batchId,
      batchNo: batch.batchNo,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discount: line.discount,
      costPrice: batch.costPrice,
    });
  }

  if (dueAmount > 0 && input.customerId) {
    await Customer.updateOne(
      { _id: input.customerId, tenantId },
      { $inc: { dueBalance: dueAmount } },
      { session },
    );
  }

  const [sale] = await Sale.create(
    [
      {
        tenantId,
        branchId: input.branchId,
        cashierId,
        customerId: input.customerId,
        items,
        totalAmount,
        paidAmount,
        dueAmount,
        paymentMethod: input.paymentMethod,
        syncedFromOffline: meta.syncedFromOffline ?? false,
        clientUuid: meta.clientUuid,
        ...(meta.createdAt ? { createdAt: meta.createdAt } : {}),
      },
    ],
    { session },
  );

  return sale;
}

export interface SyncResult {
  clientUuid: string;
  status: 'synced' | 'duplicate' | 'conflict';
  saleId?: string;
  reason?: string;
}

export const saleService = {
  async list(tenantId: string, query: ListSalesQuery): Promise<SaleDoc[]> {
    const filter: FilterQuery<SaleDoc> = {};
    if (query.branchId) filter.branchId = query.branchId;
    if (query.customerId) filter.customerId = query.customerId;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = query.from;
      if (query.to) filter.createdAt.$lte = query.to;
    }

    const skip = (query.page - 1) * query.limit;
    return withTenant(Sale.find(filter), tenantId)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit);
  },

  async getById(tenantId: string, id: string): Promise<SaleDoc> {
    const sale = await withTenant(Sale.findById(id), tenantId);
    if (!sale) throw ApiError.notFound('Sale not found');
    return sale;
  },

  /**
   * Generate the sale's invoice PDF and store it (design doc §4). Uploads to S3
   * when configured, else to local disk — returning a retrievable URL. White-
   * label branding is applied from the tenant when present.
   */
  async generateInvoice(tenantId: string, id: string): Promise<StoredObject> {
    const sale = await this.getById(tenantId, id);
    const tenant = await Tenant.findById(tenantId).select('name branding').lean();

    const products = await withTenant(
      Product.find({ _id: { $in: sale.items.map((i) => i.productId) } }).select('name'),
      tenantId,
    );
    const nameById = new Map(products.map((p) => [String(p._id), p.name]));

    let customerName: string | undefined;
    if (sale.customerId) {
      const customer = await withTenant(
        Customer.findById(sale.customerId).select('name'),
        tenantId,
      );
      customerName = customer?.name;
    }

    const pdf = await generateInvoicePdf({
      invoiceNo: String(sale._id),
      date: sale.createdAt,
      tenantName: tenant?.name ?? 'MediPOS',
      branding: tenant?.branding,
      customerName,
      lines: sale.items.map((i) => ({
        name: nameById.get(String(i.productId)) ?? 'Item',
        batchNo: i.batchNo,
        qty: i.qty,
        unitPrice: i.unitPrice,
        discount: i.discount,
      })),
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      dueAmount: sale.dueAmount,
      paymentMethod: sale.paymentMethod,
    });

    return uploadBuffer(`invoices/${tenantId}/${sale._id}.pdf`, pdf, 'application/pdf');
  },

  /** Online checkout at the counter. */
  async create(tenantId: string, cashierId: string, input: CreateSaleInput): Promise<SaleDoc> {
    return withTransaction((session) => finalizeInSession(session, tenantId, cashierId, input));
  },

  /**
   * Offline queue sync (design doc §9). Each sale is processed in its own
   * transaction so one conflict doesn't roll back the rest. Idempotent via
   * `clientUuid`; a depleted batch is reported as a conflict for manual review,
   * never silently oversold.
   */
  async bulkSync(
    tenantId: string,
    cashierId: string,
    input: BulkSyncInput,
  ): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const sale of input.sales) {
      results.push(await syncOne(tenantId, cashierId, sale));
    }
    return results;
  },
};

async function syncOne(
  tenantId: string,
  cashierId: string,
  sale: OfflineSaleInput,
): Promise<SyncResult> {
  // Idempotency: a re-sent queue shouldn't double-record a sale.
  const existing = await Sale.findOne({ tenantId, clientUuid: sale.clientUuid }).select('_id');
  if (existing) {
    return { clientUuid: sale.clientUuid, status: 'duplicate', saleId: String(existing._id) };
  }

  try {
    const created = await withTransaction((session) =>
      finalizeInSession(session, tenantId, cashierId, sale, {
        clientUuid: sale.clientUuid,
        syncedFromOffline: true,
        createdAt: sale.createdAt,
      }),
    );
    return { clientUuid: sale.clientUuid, status: 'synced', saleId: String(created._id) };
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return {
        clientUuid: sale.clientUuid,
        status: 'conflict',
        reason: `Batch ${err.batchId} was depleted before sync — flagged for manual review`,
      };
    }
    // Duplicate-key race (same UUID synced concurrently) — treat as duplicate.
    if ((err as { code?: number }).code === 11000) {
      return { clientUuid: sale.clientUuid, status: 'duplicate' };
    }
    throw err;
  }
}
