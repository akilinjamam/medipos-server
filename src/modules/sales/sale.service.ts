import { ClientSession, FilterQuery } from 'mongoose';
import { Sale, SaleDoc } from './sale.model';
import { Batch } from '../batches/batch.model';
import { Branch } from '../branches/branch.model';
import { Customer } from '../customers/customer.model';
import { Product } from '../products/product.model';
import { Tenant } from '../tenants/tenant.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { withTransaction } from '../../db/withTransaction';
import { ApiError } from '../../utils/ApiError';
import { buildSort } from '../../utils/validators';
import { generateInvoicePdf, generateTablePdf } from '../../utils/pdf';
import { GeneratedPdf } from '../../utils/pdfDelivery';
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
    const filter = buildSaleFilter(query);
    const skip = (query.page - 1) * query.limit;
    const sort = buildSort(query.sortBy, query.sortDir, { createdAt: -1 });
    return withTenant(Sale.find(filter), tenantId).sort(sort).skip(skip).limit(query.limit);
  },

  /**
   * The full (unpaginated) sales history matching the same filters as `list` —
   * used for the PDF export so the file isn't clipped to one page.
   */
  async listAll(tenantId: string, query: ListSalesQuery): Promise<SaleDoc[]> {
    const filter = buildSaleFilter(query);
    const sort = buildSort(query.sortBy, query.sortDir, { createdAt: -1 });
    return withTenant(Sale.find(filter), tenantId).sort(sort);
  },

  /** Render the filtered sales history as a PDF (buffer + storage metadata). */
  async exportPdf(tenantId: string, query: ListSalesQuery): Promise<GeneratedPdf> {
    const [sales, branches, tenant] = await Promise.all([
      this.listAll(tenantId, query),
      withTenant(Branch.find({}).select('name'), tenantId),
      Tenant.findById(tenantId).select('name branding').lean(),
    ]);

    const branchName = new Map(branches.map((b) => [String(b._id), b.name]));

    const pdf = await generateTablePdf({
      title: 'Sales History',
      subtitle: `${sales.length} sale(s)`,
      tenantName: tenant?.name ?? 'MediPOS',
      branding: tenant?.branding,
      columns: [
        { header: 'Invoice', x: 50, width: 75 },
        { header: 'Date', x: 130, width: 65 },
        { header: 'Branch', x: 200, width: 105 },
        { header: 'Payment', x: 310, width: 55 },
        { header: 'Status', x: 370, width: 55 },
        { header: 'Items', x: 425, width: 35, align: 'right' },
        { header: 'Total', x: 465, width: 45, align: 'right' },
        { header: 'Due', x: 515, width: 30, align: 'right' },
      ],
      rows: sales.map((s) => [
        String(s._id).slice(-6).toUpperCase(),
        s.createdAt.toISOString().slice(0, 10),
        branchName.get(String(s.branchId)) ?? String(s.branchId),
        s.paymentMethod,
        s.returnStatus === 'none' ? '—' : s.returnStatus,
        String(s.items.length),
        s.totalAmount.toFixed(2),
        s.dueAmount > 0 ? s.dueAmount.toFixed(2) : '—',
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return {
      buffer: pdf,
      key: `sales/${tenantId}/sales-${Date.now()}.pdf`,
      filename: `sales-${stamp}.pdf`,
    };
  },

  async getById(tenantId: string, id: string): Promise<SaleDoc> {
    const sale = await withTenant(Sale.findById(id), tenantId);
    if (!sale) throw ApiError.notFound('Sale not found');
    return sale;
  },

  /**
   * Generate the sale's invoice PDF (design doc §4). Returns the buffer +
   * storage metadata; the controller (via `deliverPdf`) archives it to S3 when
   * configured, otherwise streams it to the browser. White-label branding is
   * applied from the tenant when present.
   */
  async generateInvoice(tenantId: string, id: string): Promise<GeneratedPdf> {
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

    return {
      buffer: pdf,
      key: `invoices/${tenantId}/${sale._id}.pdf`,
      filename: `invoice-${String(sale._id).slice(-6).toUpperCase()}.pdf`,
    };
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

function buildSaleFilter(query: ListSalesQuery): FilterQuery<SaleDoc> {
  const filter: FilterQuery<SaleDoc> = {};
  if (query.branchId) filter.branchId = query.branchId;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = query.from;
    if (query.to) filter.createdAt.$lte = query.to;
  }
  return filter;
}

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
