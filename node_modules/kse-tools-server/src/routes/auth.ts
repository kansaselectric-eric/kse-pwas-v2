import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getUserByEmail, getUserById, verifyPassword, createRefreshSession, getRefreshSession, revokeRefreshSession } from '../services/authStore.js';
import { generateAccessToken, verifyAuthToken } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10)
});

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'Invalid payload' });
  const { email, password } = parsed.data;
  const user = getUserByEmail(email);
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  const valid = await verifyPassword(user, password);
  if (!valid) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  const accessToken = generateAccessToken(user);
  const refreshSession = createRefreshSession(user.id);
  res.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens: {
      accessToken,
      refreshToken: refreshSession.token,
      expiresIn: config.auth.tokenTtlSeconds
    }
  });
});

authRouter.post('/refresh', (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'Invalid payload' });
  const session = getRefreshSession(parsed.data.refreshToken);
  if (!session) return res.status(401).json({ ok: false, error: 'Invalid refresh token' });
  const user = getUserById(session.userId);
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid refresh token' });
  const accessToken = generateAccessToken(user);
  const newSession = createRefreshSession(user.id);
  revokeRefreshSession(parsed.data.refreshToken);
  res.json({
    ok: true,
    tokens: {
      accessToken,
      refreshToken: newSession.token,
      expiresIn: config.auth.tokenTtlSeconds
    }
  });
});

authRouter.post('/logout', (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) {
    revokeRefreshSession(parsed.data.refreshToken);
  }
  res.json({ ok: true });
});

authRouter.get('/me', verifyAuthToken, (req, res) => {
  const authUser = req.authUser!;
  res.json({
    ok: true,
    user: {
      id: authUser.sub,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role
    }
  });
});

