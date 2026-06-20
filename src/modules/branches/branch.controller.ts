import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { branchService } from './branch.service';
import { createBranchSchema, updateBranchSchema } from './branch.validation';

export const branchController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const branches = await branchService.list(req.tenantId!);
    res.json({ data: branches });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const branch = await branchService.getById(req.tenantId!, req.params.id);
    res.json({ data: branch });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createBranchSchema.parse(req.body);
    const branch = await branchService.create(req.tenantId!, input);
    res.status(201).json({ data: branch });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateBranchSchema.parse(req.body);
    const branch = await branchService.update(req.tenantId!, req.params.id, input);
    res.json({ data: branch });
  }),
};
