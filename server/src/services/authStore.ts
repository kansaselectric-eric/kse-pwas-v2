import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { config } from '../config.js';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'standard';
  passwordHash: string;
};

type RefreshSession = {
  token: string;
  userId: string;
  expiresAt: number;
};

const refreshSessions = new Map<string, RefreshSession>();

function parseEnvUsers(): AuthUser[] {
  if (!config.auth.usersJson) return [];
  try {
    const parsed = JSON.parse(config.auth.usersJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((u) => ({
        id: u.id || randomUUID(),
        email: u.email?.toLowerCase(),
        name: u.name || 'User',
        role: u.role === 'admin' ? 'admin' : 'standard',
        passwordHash: u.passwordHash || ''
      }))
      .filter((u) => u.email && u.passwordHash);
  } catch {
    return [];
  }
}

const defaultUsers: AuthUser[] = [
  {
    id: 'demo-admin',
    email: 'bdlead@example.com',
    name: 'BD Lead',
    role: 'admin',
    passwordHash: '$2a$10$XoCg4nzbIRbkIuAeGHWxZ.MeWs6tCYsCSgauQjWONtDzX2UZR3qPwEeLas1MtOO2lmuJCOC' // "secret123"
  },
  {
    id: 'demo-user',
    email: 'bdrep@example.com',
    name: 'BD Rep',
    role: 'standard',
    passwordHash: '$2a$10$TnQ71R/bSSWcovPTiCQnINA.cOZKX52v8ueai74TcXJOltR4yfuazy7Lm' // "rep12345"
  }
];

const authUsers: AuthUser[] = [...parseEnvUsers(), ...defaultUsers];
const usersById = new Map(authUsers.map((u) => [u.id, u]));

export function getUserByEmail(email: string): AuthUser | undefined {
  return authUsers.find((u) => u.email === email.toLowerCase());
}

export function getUserById(id: string): AuthUser | undefined {
  return usersById.get(id);
}

export async function verifyPassword(user: AuthUser, password: string) {
  return bcrypt.compare(password, user.passwordHash);
}

export function createRefreshSession(userId: string) {
  const token = randomUUID();
  const expiresAt = Date.now() + config.auth.refreshTtlSeconds * 1000;
  const session: RefreshSession = { token, userId, expiresAt };
  refreshSessions.set(token, session);
  return session;
}

export function getRefreshSession(token: string): RefreshSession | null {
  const session = refreshSessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    refreshSessions.delete(token);
    return null;
  }
  return session;
}

export function revokeRefreshSession(token: string) {
  refreshSessions.delete(token);
}


