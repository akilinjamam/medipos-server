import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { transferService } from './transfer.service';
import { createTransferSchema, listTransfersSchema } from './transfer.validation';

export const transferController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listTransfersSchema.parse(req.query);
    const transfers = await transferService.list(req.tenantId!, query);
    res.json({ data: transfers });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createTransferSchema.parse(req.body);
    const transfer = await transferService.create(req.tenantId!, req.auth!.userId, input);
    res.status(201).json({ data: transfer });
  }),
};
