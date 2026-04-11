/**
 * 钱包登录路由
 * POST /api/auth/challenge — 生成 SIWE nonce + message
 * POST /api/auth/verify    — 验签 + 创建/查找用户 + 返回 JWT
 * GET  /api/auth/me         — 获取当前用户信息
 * PUT  /api/auth/profile    — 更新显示名称/头像
 */
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { SiweMessage, generateNonce } from 'siwe';
import { ethers } from 'ethers';
import db from '../db';
import { requireAuth, generateToken } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/challenge
 * body: { walletAddress, chainId?, domain?, uri? }
 * → { nonce, message }
 */
router.post('/challenge', (req: Request, res: Response) => {
  try {
    const { walletAddress, chainId, domain, uri } = req.body;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Valid walletAddress is required (0x...)' });
    }

    // 转换为 EIP-55 checksum 地址
    let checksumAddress: string;
    try {
      checksumAddress = ethers.utils.getAddress(walletAddress);
    } catch {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const nonce = generateNonce();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 分钟过期

    const siweMessage = new SiweMessage({
      domain: domain || 'layer1.blacksquirrel.xyz',
      address: checksumAddress,
      statement: 'Sign in to Black Squirrel Strategy Market',
      uri: uri || 'https://layer1.blacksquirrel.xyz',
      version: '1',
      chainId: chainId || 196, // XLayer mainnet
      nonce,
      issuedAt: now.toISOString(),
      expirationTime: expiresAt.toISOString(),
    });

    const message = siweMessage.prepareMessage();

    // 存储 nonce
    db.prepare(`
      INSERT INTO auth_nonces (nonce, walletAddress, message, expiresAt)
      VALUES (?, ?, ?, ?)
    `).run(nonce, checksumAddress.toLowerCase(), message, expiresAt.toISOString());

    res.json({ nonce, message });
  } catch (err: any) {
    console.error('POST /api/auth/challenge error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/verify
 * body: { message, signature }
 * → { token, user }
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { message, signature } = req.body;

    if (!message || !signature) {
      return res.status(400).json({ error: 'message and signature are required' });
    }

    // 解析并验证 SIWE message
    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({ signature });

    if (!result.success) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    const walletAddress = result.data.address.toLowerCase();
    const nonce = result.data.nonce;

    // 检查 nonce 存在且未过期
    const nonceRow = db.prepare(
      "SELECT * FROM auth_nonces WHERE nonce = ? AND walletAddress = ? AND expiresAt > datetime('now')"
    ).get(nonce, walletAddress) as any;

    if (!nonceRow) {
      return res.status(401).json({ error: 'Invalid or expired nonce' });
    }

    // 删除已使用的 nonce（防重放）
    db.prepare('DELETE FROM auth_nonces WHERE nonce = ?').run(nonce);

    // 查找或创建用户
    let user = db.prepare('SELECT * FROM users WHERE walletAddress = ?').get(walletAddress) as any;

    if (!user) {
      const userId = uuidv4();
      const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
      db.prepare(`
        INSERT INTO users (id, walletAddress, displayName)
        VALUES (?, ?, ?)
      `).run(userId, walletAddress, shortAddr);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    }

    // 生成 JWT
    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (err: any) {
    console.error('POST /api/auth/verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 * → { user }
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

/**
 * PUT /api/auth/profile
 * Header: Authorization: Bearer <token>
 * body: { displayName?, avatar? }
 * → { user }
 */
router.put('/profile', requireAuth, (req: Request, res: Response) => {
  try {
    const { displayName, avatar } = req.body;
    const userId = req.user!.id;

    const updates: string[] = [];
    const params: any[] = [];

    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.length > 50) {
        return res.status(400).json({ error: 'displayName must be a string (max 50 chars)' });
      }
      updates.push('displayName = ?');
      params.push(displayName);
    }

    if (avatar !== undefined) {
      updates.push('avatar = ?');
      params.push(avatar);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    params.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare('SELECT id, walletAddress, displayName, avatar, createdAt FROM users WHERE id = ?').get(userId);
    res.json({ user });
  } catch (err: any) {
    console.error('PUT /api/auth/profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
