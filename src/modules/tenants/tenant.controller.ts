import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { tenantService } from './tenant.service';
import { createTenantSchema, updateTenantSchema } from './tenant.validation';

export const tenantController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createTenantSchema.parse(req.body);
    const tenant = await tenantService.create(input);
    res.status(201).json({ data: tenant });
  }),

  list: asyncHandler(async (_req: Request, res: Response) => {
    const tenants = await tenantService.list();
    res.json({ data: tenants });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const tenant = await tenantService.getById(req.params.id);
    res.json({ data: tenant });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateTenantSchema.parse(req.body);
    const tenant = await tenantService.update(req.params.id, input);
    res.json({ data: tenant });
  }),
};
