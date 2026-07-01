import { FilterQuery } from 'mongoose';
import { Product, ProductDoc } from './product.model';
import { Tenant } from '../tenants/tenant.model';
import { Batch } from '../batches/batch.model';
import { Sale } from '../sales/sale.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { ApiError } from '../../utils/ApiError';
import { buildSort } from '../../utils/validators';
import { generateInternalBarcode } from '../../utils/barcode';
import { generateTablePdf } from '../../utils/pdf';
import { GeneratedPdf } from '../../utils/pdfDelivery';
import { cached, cacheDelByPrefix, tenantCacheKey } from '../../utils/cache';
import { CreateProductInput, UpdateProductInput, ListProductsQuery } from './product.validation';

export interface PaginatedProducts {
  data: ProductDoc[];
  page: number;
  limit: number;
  total: number;
}

/** Outcome of a bulk delete: which ids were removed and which were kept (and why). */
export interface BulkDeleteResult {
  deletedIds: string[];
  blocked: { id: string; name: string; reason: string }[];
}

/**
 * Which of `ids` are still referenced elsewhere, so a hard delete would orphan
 * history. Returns two sets keyed by product id: batch-referenced and
 * sale-referenced. Uses tenant-scoped `find` (the tenant plugin does not scope
 * `distinct`), which is fine for the capped id list (≤ 200).
 */
async function getReferencedIds(
  tenantId: string,
  ids: string[],
): Promise<{ batched: Set<string>; sold: Set<string> }> {
  const candidates = new Set(ids.map(String));

  const [batches, sales] = await Promise.all([
    withTenant(Batch.find({ productId: { $in: ids } }).select('productId'), tenantId),
    withTenant(Sale.find({ 'items.productId': { $in: ids } }).select('items.productId'), tenantId),
  ]);

  const batched = new Set(batches.map((b) => String(b.productId)));
  const sold = new Set<string>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const pid = String(item.productId);
      if (candidates.has(pid)) sold.add(pid);
    }
  }

  return { batched, sold };
}

/** Prefix covering every cached product read for a tenant (for invalidation). */
function productCachePrefix(tenantId: string): string {
  return `${tenantCacheKey(tenantId, 'product')}:`;
}

/**
 * Medicine catalog (design doc §6). Tenant-scoped; supports paginated search
 * and a dedicated barcode lookup used by the POS terminal.
 */
export const productService = {
  // Catalog reads are cached per tenant (read-heavy at the counter) and the
  // whole product cache is dropped on any catalog mutation.
  async list(tenantId: string, query: ListProductsQuery): Promise<PaginatedProducts> {
    const key = tenantCacheKey(
      tenantId,
      'product',
      'list',
      query.category ?? 'all',
      query.search ?? '',
      query.sortBy ?? 'name',
      query.sortDir ?? 'asc',
      query.page,
      query.limit,
    );
    return cached(key, () => this.computeList(tenantId, query));
  },

  async computeList(tenantId: string, query: ListProductsQuery): Promise<PaginatedProducts> {
    const filter = buildProductFilter(query);

    const skip = (query.page - 1) * query.limit;
    const sort = buildSort(query.sortBy, query.sortDir, { name: -1 });
    const [data, total] = await Promise.all([
      withTenant(Product.find(filter), tenantId).sort(sort).skip(skip).limit(query.limit),
      withTenant(Product.countDocuments(filter), tenantId),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  },

  async getById(tenantId: string, id: string): Promise<ProductDoc> {
    const product = await withTenant(Product.findById(id), tenantId);
    if (!product) throw ApiError.notFound('Product not found');
    return product;
  },

  async getByBarcode(tenantId: string, barcode: string): Promise<ProductDoc> {
    const key = tenantCacheKey(tenantId, 'product', 'barcode', barcode);
    return cached(key, async () => {
      const product = await withTenant(Product.findOne({ barcode }), tenantId);
      if (!product) throw ApiError.notFound('No product matches this barcode');
      return product;
    });
  },

  async create(tenantId: string, input: CreateProductInput): Promise<ProductDoc> {
    // Barcode is auto-assigned (internal EAN-13) when the caller doesn't supply
    // one, so every product is scannable. A supplied barcode is used as-is and a
    // clash is a real error; an auto-generated clash is just retried.
    const userSupplied = Boolean(input.barcode);

    for (let attempt = 0; attempt < 5; attempt++) {
      const barcode = input.barcode ?? generateInternalBarcode();
      try {
        const product = await Product.create({ tenantId, ...input, barcode });
        await cacheDelByPrefix(productCachePrefix(tenantId));
        return product;
      } catch (err) {
        if ((err as { code?: number }).code === 11000) {
          if (userSupplied) throw ApiError.conflict('A product with this barcode already exists');
          continue; // generated code collided — try another
        }
        throw err;
      }
    }
    throw new ApiError(500, 'Could not generate a unique barcode, please try again');
  },

  async update(tenantId: string, id: string, input: UpdateProductInput): Promise<ProductDoc> {
    const product = await withTenant(
      Product.findByIdAndUpdate(id, input, { new: true, runValidators: true }),
      tenantId,
    );
    if (!product) throw ApiError.notFound('Product not found');
    await cacheDelByPrefix(productCachePrefix(tenantId));
    return product;
  },

  /**
   * Hard delete — guarded to owner/manager at the route (design doc §7) and
   * blocked here when the product is referenced by any batch or sale, since
   * removing it would orphan stock/invoice history.
   */
  async remove(tenantId: string, id: string): Promise<void> {
    const product = await withTenant(Product.findById(id), tenantId);
    if (!product) throw ApiError.notFound('Product not found');

    const { batched, sold } = await getReferencedIds(tenantId, [id]);
    if (batched.has(id) || sold.has(id)) {
      throw ApiError.conflict(
        'Cannot delete a product that has stock/batches or appears in sales',
      );
    }

    await withTenant(Product.deleteOne({ _id: id }), tenantId);
    await cacheDelByPrefix(productCachePrefix(tenantId));
  },

  /**
   * Bulk hard delete with the same reference guard as `remove`. Partial success
   * is intentional: safe products are deleted and referenced ones are returned
   * in `blocked` with a reason, so the caller can report exactly what was kept.
   */
  async bulkRemove(tenantId: string, ids: string[]): Promise<BulkDeleteResult> {
    // De-dupe so a repeated id can't be both deleted and reported.
    const unique = [...new Set(ids.map(String))];

    const products = await withTenant(
      Product.find({ _id: { $in: unique } }).select('name'),
      tenantId,
    );
    const { batched, sold } = await getReferencedIds(tenantId, unique);

    const deletedIds: string[] = [];
    const blocked: BulkDeleteResult['blocked'] = [];
    for (const product of products) {
      const id = String(product._id);
      if (sold.has(id)) {
        blocked.push({ id, name: product.name, reason: 'appears in sales history' });
      } else if (batched.has(id)) {
        blocked.push({ id, name: product.name, reason: 'has batch/stock records' });
      } else {
        deletedIds.push(id);
      }
    }

    if (deletedIds.length > 0) {
      await withTenant(Product.deleteMany({ _id: { $in: deletedIds } }), tenantId);
      await cacheDelByPrefix(productCachePrefix(tenantId));
    }

    return { deletedIds, blocked };
  },

  /**
   * The full (unpaginated) catalog matching the same search/category filters as
   * `list` — used for the PDF export so the file reflects the on-screen filters
   * but isn't clipped to one page. Not cached: exports are infrequent and this
   * keeps the paginated read cache clean.
   */
  async listAll(tenantId: string, query: ListProductsQuery): Promise<ProductDoc[]> {
    const filter = buildProductFilter(query);
    const sort = buildSort(query.sortBy, query.sortDir, { name: -1 });
    return withTenant(Product.find(filter), tenantId).sort(sort);
  },

  /**
   * Render the filtered catalog as a PDF. Returns the raw buffer + storage
   * metadata; the controller (via `deliverPdf`) decides whether to archive it to
   * S3 or stream it to the browser.
   */
  async exportPdf(tenantId: string, query: ListProductsQuery): Promise<GeneratedPdf> {
    const [products, tenant] = await Promise.all([
      this.listAll(tenantId, query),
      Tenant.findById(tenantId).select('name branding').lean(),
    ]);

    const pdf = await generateTablePdf({
      title: 'Product Catalog',
      subtitle: `${products.length} product(s)`,
      tenantName: tenant?.name ?? 'MediPOS',
      branding: tenant?.branding,
      columns: [
        { header: 'Name', x: 50, width: 140 },
        { header: 'Generic', x: 195, width: 110 },
        { header: 'Brand', x: 310, width: 70 },
        { header: 'Category', x: 385, width: 55 },
        { header: 'Strength', x: 445, width: 45 },
        { header: 'Reorder', x: 495, width: 50, align: 'right' },
      ],
      rows: products.map((p) => [
        p.name,
        p.genericName ?? '—',
        p.brand ?? '—',
        p.category,
        p.strength ?? '—',
        p.reorderLevel != null ? String(p.reorderLevel) : '—',
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return {
      buffer: pdf,
      key: `products/${tenantId}/products-${Date.now()}.pdf`,
      filename: `products-${stamp}.pdf`,
    };
  },
};

function buildProductFilter(query: ListProductsQuery): FilterQuery<ProductDoc> {
  const filter: FilterQuery<ProductDoc> = {};
  if (query.category) filter.category = query.category;
  if (query.search) {
    const rx = new RegExp(escapeRegExp(query.search), 'i');
    filter.$or = [{ name: rx }, { genericName: rx }, { brand: rx }, { barcode: rx }];
  }
  return filter;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
