import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
const refreshSessions = new Map();
function parseEnvUsers() {
    if (!config.auth.usersJson)
        return [];
    try {
        const parsed = JSON.parse(config.auth.usersJson);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .map((raw) => {
            const email = typeof raw.email === 'string' ? raw.email.toLowerCase() : undefined;
            const name = typeof raw.name === 'string' ? raw.name : 'User';
            const role = typeof raw.role === 'string' && raw.role.toLowerCase() === 'admin'
                ? 'admin'
                : 'standard';
            const passwordHash = typeof raw.passwordHash === 'string' ? raw.passwordHash : undefined;
            const id = typeof raw.id === 'string' && raw.id ? raw.id : randomUUID();
            return { id, email, name, role, passwordHash };
        })
            .filter((u) => Boolean(u.email && u.passwordHash));
    }
    catch {
        return [];
    }
}
const defaultUsers = [
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
const authUsers = [...parseEnvUsers(), ...defaultUsers];
const usersById = new Map(authUsers.map((u) => [u.id, u]));
export function getUserByEmail(email) {
    return authUsers.find((u) => u.email === email.toLowerCase());
}
export function getUserById(id) {
    return usersById.get(id);
}
export async function verifyPassword(user, password) {
    return bcrypt.compare(password, user.passwordHash);
}
export function createRefreshSession(userId) {
    const token = randomUUID();
    const expiresAt = Date.now() + config.auth.refreshTtlSeconds * 1000;
    const session = { token, userId, expiresAt };
    refreshSessions.set(token, session);
    return session;
}
export function getRefreshSession(token) {
    const session = refreshSessions.get(token);
    if (!session)
        return null;
    if (session.expiresAt < Date.now()) {
        refreshSessions.delete(token);
        return null;
    }
    return session;
}
export function revokeRefreshSession(token) {
    refreshSessions.delete(token);
}
