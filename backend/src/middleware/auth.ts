/**
 * JWT 鉴权中间件
 * 从 Authorization header 解析 Bearer token，注入 req.user
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'neonex-dev-secret';

export interface AuthUser {
  id: string;
  walletAddress: string;
  displayName: string | null;
  avatar: string | null;
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * 强制鉴权：没有有效 token 返回 401
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const user = db.prepare('SELECT id, walletAddress, displayName, avatar FROM users WHERE id = ?').get(payload.sub) as any;
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * 可选鉴权：有 token 就解析，没有也放行
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const user = db.prepare('SELECT id, walletAddress, displayName, avatar FROM users WHERE id = ?').get(payload.sub) as any;
    if (user) {
      req.user = user;
    }
  } catch {
    // Token 无效也放行，只是 req.user 为空
  }
  next();
}

/**
 * 生成 JWT token
 */
export function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

export { JWT_SECRET };
