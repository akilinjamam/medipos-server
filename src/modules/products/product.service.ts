import { FilterQuery } from 'mongoose';
import { Product, ProductDoc } from './product.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { ApiError } from '../../utils/ApiError';
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

/**
 * Medicine catalog (design doc §6). Tenant-scoped; supports paginated search
 * and a dedicated barcode lookup used by the POS terminal.
 */
export const productService = {
  async list(tenantId: string, query: ListProductsQuery): Promise<PaginatedProducts> {
    const filter: FilterQuery<ProductDoc> = {};
    if (query.category) filter.category = query.category;
    if (query.search) {
      const rx = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = [{ name: rx }, { genericName: rx }, { brand: rx }, { barcode: rx }];
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      withTenant(Product.find(filter), tenantId).sort({ name: 1 }).skip(skip).limit(query.limit),
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
    const product = await withTenant(Product.findOne({ barcode }), tenantId);
    if (!product) throw ApiError.notFound('No product matches this barcode');
    return product;
  },

  async create(tenantId: string, input: CreateProductInput): Promise<ProductDoc> {
    try {
      return await Product.create({ tenantId, ...input });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw ApiError.conflict('A product with this barcode already exists');
      }
      throw err;
    }
  },

  async update(tenantId: string, id: string, input: UpdateProductInput): Promise<ProductDoc> {
    const product = await withTenant(
      Product.findByIdAndUpdate(id, input, { new: true, runValidators: true }),
      tenantId,
    );
    if (!product) throw ApiError.notFound('Product not found');
    return product;
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
