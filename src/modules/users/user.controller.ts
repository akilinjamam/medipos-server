import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { userService } from './user.service';
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
} from './user.validation';

export const userController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listUsersQuerySchema.parse(req.query);
    const users = await userService.list(req.tenantId!, query);
    res.json({ data: users });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.getById(req.tenantId!, req.params.id);
    res.json({ data: user });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createUserSchema.parse(req.body);
    const user = await userService.create(req.tenantId!, input);
    res.status(201).json({ data: user });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateUserSchema.parse(req.body);
    const user = await userService.update(req.tenantId!, req.params.id, input);
    res.json({ data: user });
  }),

  deactivate: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.deactivate(req.tenantId!, req.params.id);
    res.json({ data: user });
  }),
};
