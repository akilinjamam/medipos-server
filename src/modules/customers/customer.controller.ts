import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { customerService } from './customer.service';
import {
  createCustomerSchema,
  updateCustomerSchema,
  settleDueSchema,
  addPrescriptionSchema,
  listCustomersQuerySchema,
} from './customer.validation';

export const customerController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listCustomersQuerySchema.parse(req.query);
    const customers = await customerService.list(req.tenantId!, query);
    res.json({ data: customers });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.getById(req.tenantId!, req.params.id);
    res.json({ data: customer });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createCustomerSchema.parse(req.body);
    const customer = await customerService.create(req.tenantId!, input);
    res.status(201).json({ data: customer });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateCustomerSchema.parse(req.body);
    const customer = await customerService.update(req.tenantId!, req.params.id, input);
    res.json({ data: customer });
  }),

  settleDue: asyncHandler(async (req: Request, res: Response) => {
    const input = settleDueSchema.parse(req.body);
    const customer = await customerService.settleDue(req.tenantId!, req.params.id, input);
    res.json({ data: customer });
  }),

  addPrescription: asyncHandler(async (req: Request, res: Response) => {
    const input = addPrescriptionSchema.parse(req.body);
    const customer = await customerService.addPrescription(req.tenantId!, req.params.id, input);
    res.status(201).json({ data: customer });
  }),
};
