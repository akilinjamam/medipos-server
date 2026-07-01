import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { deliverPdf } from '../../utils/pdfDelivery';
import { productService } from './product.service';
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  bulkDeleteProductsSchema,
} from './product.validation';

export const productController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listProductsQuerySchema.parse(req.query);
    const result = await productService.list(req.tenantId!, query);
    res.json(result);
  }),

  exportPdf: asyncHandler(async (req: Request, res: Response) => {
    const query = listProductsQuerySchema.parse(req.query);
    const pdf = await productService.exportPdf(req.tenantId!, query);
    await deliverPdf(res, pdf);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getById(req.tenantId!, req.params.id);
    res.json({ data: product });
  }),

  getByBarcode: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getByBarcode(req.tenantId!, req.params.barcode);
    res.json({ data: product });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createProductSchema.parse(req.body);
    const product = await productService.create(req.tenantId!, input);
    res.status(201).json({ data: product });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateProductSchema.parse(req.body);
    const product = await productService.update(req.tenantId!, req.params.id, input);
    res.json({ data: product });
  }),

  bulkRemove: asyncHandler(async (req: Request, res: Response) => {
    const { ids } = bulkDeleteProductsSchema.parse(req.body);
    const result = await productService.bulkRemove(req.tenantId!, ids);
    res.json({ data: result });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await productService.remove(req.tenantId!, req.params.id);
    res.status(204).send();
  }),
};
