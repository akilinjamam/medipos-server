import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { batchService } from './batch.service';
import {
  createBatchSchema,
  updateBatchSchema,
  listBatchesQuerySchema,
  fefoQuerySchema,
  nearExpiryQuerySchema,
  lowStockQuerySchema,
} from './batch.validation';

export const batchController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listBatchesQuerySchema.parse(req.query);
    const batches = await batchService.list(req.tenantId!, query);
    res.json({ data: batches });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const batch = await batchService.getById(req.tenantId!, req.params.id);
    res.json({ data: batch });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createBatchSchema.parse(req.body);
    const batch = await batchService.create(req.tenantId!, input);
    res.status(201).json({ data: batch });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateBatchSchema.parse(req.body);
    const batch = await batchService.update(req.tenantId!, req.params.id, input);
    res.json({ data: batch });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await batchService.remove(req.tenantId!, req.params.id);
    res.status(204).send();
  }),

  fefo: asyncHandler(async (req: Request, res: Response) => {
    const query = fefoQuerySchema.parse(req.query);
    const allocation = await batchService.planFefo(req.tenantId!, query);
    res.json({ data: allocation });
  }),

  nearExpiry: asyncHandler(async (req: Request, res: Response) => {
    const query = nearExpiryQuerySchema.parse(req.query);
    const batches = await batchService.nearExpiry(req.tenantId!, query);
    res.json({ data: batches });
  }),

  lowStock: asyncHandler(async (req: Request, res: Response) => {
    const query = lowStockQuerySchema.parse(req.query);
    const rows = await batchService.lowStock(req.tenantId!, query);
    res.json({ data: rows });
  }),
};
