import { CookieOptions, Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { isProd } from '../../config/env';
import { authService } from './auth.service';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
} from './auth.validation';

const REFRESH_COOKIE = 'refreshToken';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  // Must match where the auth router is actually mounted (app.ts → "/api/v1",
  // routes.ts → "/auth"), otherwise the browser won't send the cookie to the
  // refresh endpoint and rotation never fires end-to-end.
  path: '/api/v1/auth',
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
    const { accessToken, refreshToken } = await authService.refresh(token);
    // Rotation: replace the cookie with the freshly issued refresh token.
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    res.json({ data: { accessToken } });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
    res.status(204).send();
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    // `authenticate` guarantees req.auth is set.
    const { userId, tenantId } = req.auth!;
    const user = await authService.me(userId, tenantId);
    res.json({ data: user });
  }),

  updateMe: asyncHandler(async (req: Request, res: Response) => {
    const { userId, tenantId } = req.auth!;
    const input = updateProfileSchema.parse(req.body);
    const user = await authService.updateProfile(userId, tenantId, input);
    res.json({ data: user });
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const { userId, tenantId } = req.auth!;
    const input = changePasswordSchema.parse(req.body);
    await authService.changePassword(userId, tenantId, input.currentPassword, input.newPassword);
    res.status(204).send();
  }),
};
