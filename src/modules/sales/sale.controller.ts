import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { saleService } from './sale.service';
import { createSaleSchema, bulkSyncSchema, listSalesQuerySchema } from './sale.validation';

export const saleController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listSalesQuerySchema.parse(req.query);
    const sales = await saleService.list(req.tenantId!, query);
    res.json({ data: sales });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.getById(req.tenantId!, req.params.id);
    res.json({ data: sale });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createSaleSchema.parse(req.body);
    const sale = await saleService.create(req.tenantId!, req.auth!.userId, input);
    res.status(201).json({ data: sale });
  }),

  bulkSync: asyncHandler(async (req: Request, res: Response) => {
    const input = bulkSyncSchema.parse(req.body);
    const results = await saleService.bulkSync(req.tenantId!, req.auth!.userId, input);
    res.json({ data: results });
  }),
};
