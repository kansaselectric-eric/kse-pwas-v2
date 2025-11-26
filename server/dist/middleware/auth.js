import jwt from 'jsonwebtoken';
import { config } from '../config.js';
export function generateAccessToken(user) {
    return jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name
    }, config.auth.jwtSecret, { expiresIn: config.auth.tokenTtlSeconds });
}
export function verifyAuthToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: 'Missing bearer token' });
    }
    const token = authHeader.slice('Bearer '.length);
    try {
        const decoded = jwt.verify(token, config.auth.jwtSecret);
        req.authUser = decoded;
        return next();
    }
    catch (error) {
        return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }
}
