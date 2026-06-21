import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiTokenService } from './apiToken.service';
import { createApiTokenSchema } from './apiToken.validation';

export const apiTokenController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const tokens = await apiTokenService.list(req.tenantId!);
    res.json({ data: tokens });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createApiTokenSchema.parse(req.body);
    const { token, record } = await apiTokenService.issue(req.tenantId!, req.auth!.userId, input);
    // `token` is shown exactly once — clients must store it now.
    res.status(201).json({ data: { token, id: record._id, prefix: record.prefix } });
  }),

  revoke: asyncHandler(async (req: Request, res: Response) => {
    await apiTokenService.revoke(req.tenantId!, req.params.id);
    res.status(204).send();
  }),
};
