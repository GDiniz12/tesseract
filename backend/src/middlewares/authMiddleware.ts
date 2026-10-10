import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { allowedOrigins } from '../config/security';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

export interface AuthRequest extends Request {
  userId?: string;
  authVersion?: number;
}

const SESSION_COOKIE = 'tesseract_session';

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const value = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value ? value.slice(name.length + 1) : null;
}

function getRequestToken(req: Request) {
  const cookieToken = getCookie(req, SESSION_COOKIE);
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] || null;
  return { token: cookieToken || bearerToken, usedCookie: Boolean(cookieToken) };
}

function csrfOriginIsValid(req: Request) {
  const origin = req.headers.origin;
  if (origin) return allowedOrigins.includes(origin);
  return req.get('x-session-mode') === 'cookie';
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const { token, usedCookie } = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Token is missing' });
  }

  if (usedCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !csrfOriginIsValid(req)) {
    return res.status(403).json({ error: 'Request origin is not allowed' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; authVersion?: number };
    
    // Check if user actually exists
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    if ((decoded.authVersion ?? 0) !== user.authVersion) {
      return res.status(401).json({ error: 'Session expired or revoked' });
    }

    req.userId = decoded.userId;
    req.authVersion = user.authVersion;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token is invalid' });
  }
}

export async function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const { token } = getRequestToken(req);
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; authVersion?: number };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (user && (decoded.authVersion ?? 0) === user.authVersion) {
      req.userId = decoded.userId;
      req.authVersion = user.authVersion;
    }
  } catch (error) {
    // Silently continue for optional auth
  }

  return next();
}
