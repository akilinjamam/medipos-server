import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { supplierService } from './supplier.service';
import {
  createSupplierSchema,
  updateSupplierSchema,
  settleDueSchema,
} from './supplier.validation';

export const supplierController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const suppliers = await supplierService.list(req.tenantId!);
    res.json({ data: suppliers });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const supplier = await supplierService.getById(req.tenantId!, req.params.id);
    res.json({ data: supplier });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createSupplierSchema.parse(req.body);
    const supplier = await supplierService.create(req.tenantId!, input);
    res.status(201).json({ data: supplier });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateSupplierSchema.parse(req.body);
    const supplier = await supplierService.update(req.tenantId!, req.params.id, input);
    res.json({ data: supplier });
  }),

  settleDue: asyncHandler(async (req: Request, res: Response) => {
    const input = settleDueSchema.parse(req.body);
    const supplier = await supplierService.settleDue(req.tenantId!, req.params.id, input);
    res.json({ data: supplier });
  }),
};
