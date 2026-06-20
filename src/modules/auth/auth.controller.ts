import { CookieOptions, Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { isProd } from '../../config/env';
import { authService } from './auth.service';
import { registerSchema, loginSchema } from './auth.validation';

const REFRESH_COOKIE = 'refreshToken';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const input = registerSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.register(input);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    res.status(201).json({ data: { user, accessToken } });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(input);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    res.json({ data: { user, accessToken } });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw ApiError.unauthorized('Missing refresh token');
    const { accessToken } = await authService.refresh(token);
    res.json({ data: { accessToken } });
  }),

  logout: asyncHandler(async (_req: Request, res: Response) => {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
    res.status(204).send();
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    // `authenticate` guarantees req.auth is set.
    const { userId, tenantId } = req.auth!;
    const user = await authService.me(userId, tenantId);
    res.json({ data: user });
  }),
};
