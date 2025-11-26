import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthUser } from '../services/authStore.js';

export type AuthClaims = {
  sub: string;
  email: string;
  role: string;
  name: string;
  iat: number;
  exp: number;
};

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthClaims;
  }
}

export function generateAccessToken(user: AuthUser) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    config.auth.jwtSecret,
    { expiresIn: config.auth.tokenTtlSeconds }
  );
}

export function verifyAuthToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Missing bearer token' });
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret) as AuthClaims;
    req.authUser = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}

