import { FilterQuery } from 'mongoose';
import { Product, ProductDoc } from './product.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { ApiError } from '../../utils/ApiError';
import { buildSort } from '../../utils/validators';
import { generateInternalBarcode } from '../../utils/barcode';
import { cached, cacheDelByPrefix, tenantCacheKey } from '../../utils/cache';
import {
  CreateProductInput,
  UpdateProductInput,
  ListProductsQuery,
} from './product.validation';

export interface PaginatedProducts {
  data: ProductDoc[];
  page: number;
  limit: number;
  total: number;
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
    const filter: FilterQuery<ProductDoc> = {};
    if (query.category) filter.category = query.category;
    if (query.search) {
      const rx = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = [{ name: rx }, { genericName: rx }, { brand: rx }, { barcode: rx }];
    }

    const skip = (query.page - 1) * query.limit;
    const sort = buildSort(query.sortBy, query.sortDir, { name: 1 });
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
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
