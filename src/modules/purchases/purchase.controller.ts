import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { purchaseService } from './purchase.service';
import { createPurchaseSchema, listPurchasesQuerySchema } from './purchase.validation';

export const purchaseController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listPurchasesQuerySchema.parse(req.query);
    const purchases = await purchaseService.list(req.tenantId!, query);
    res.json({ data: purchases });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const purchase = await purchaseService.getById(req.tenantId!, req.params.id);
    res.json({ data: purchase });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createPurchaseSchema.parse(req.body);
    const purchase = await purchaseService.create(req.tenantId!, input);
    res.status(201).json({ data: purchase });
  }),

  receive: asyncHandler(async (req: Request, res: Response) => {
    const purchase = await purchaseService.receive(req.tenantId!, req.params.id);
    res.json({ data: purchase });
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const purchase = await purchaseService.cancel(req.tenantId!, req.params.id);
    res.json({ data: purchase });
  }),
};
