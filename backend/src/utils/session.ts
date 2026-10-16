import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

export const SESSION_COOKIE = 'tesseract_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isSecureRequest(req: Request) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function sessionCookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || isSecureRequest(req),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

export function createSessionToken(userId: string, authVersion: number) {
  return jwt.sign({ userId, authVersion }, JWT_SECRET, { expiresIn: '7d' });
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(req));
}
