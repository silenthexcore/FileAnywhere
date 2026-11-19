import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { promisify } from 'node:util';
import type { AppConfig, StoredPassword } from './config';

const scryptAsync = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = 'fa_session';
const SESSION_DAYS = 30;
const SESSION_HOURS = 12;

export interface SessionInfo {
  authenticated: boolean;
  expiresAt: number;
}

export function hashPassword(password: string): Promise<StoredPassword> {
  const salt = crypto.randomBytes(16).toString('hex');
  return scryptAsync(password, salt, 64).then((hash) => ({
    salt,
    hash: hash.toString('hex'),
  }));
}

export async function verifyPassword(password: string, stored: StoredPassword | null): Promise<boolean> {
  if (!stored) return false;
  try {
    const expected = Buffer.from(stored.hash, 'hex');
    const actual = await scryptAsync(password, stored.salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(secret: string, remember: boolean): string {
  const now = Date.now();
  const lifetime = remember ? SESSION_DAYS * 86_400_000 : SESSION_HOURS * 3_600_000;
  const payload = Buffer.from(
    JSON.stringify({
      iat: now,
      exp: now + lifetime,
      n: crypto.randomBytes(9).toString('base64url'),
    }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string): SessionInfo {
  if (!token) return { authenticated: false, expiresAt: 0 };
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return { authenticated: false, expiresAt: 0 };
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { authenticated: false, expiresAt: 0 };
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      iat: number;
      exp: number;
    };
    if (!data.exp || data.exp <= Date.now()) return { authenticated: false, expiresAt: 0 };
    return { authenticated: true, expiresAt: data.exp };
  } catch {
    return { authenticated: false, expiresAt: 0 };
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function getSession(req: Request, config: AppConfig): SessionInfo {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return verifySessionToken(token, config.sessionSecret);
}

export function requireAuth(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = getSession(req, config);
    if (!session.authenticated) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Please sign in to continue.' } });
      return;
    }
    (req as Request & { session: SessionInfo }).session = session;
    next();
  };
}

export function setSessionCookie(res: Response, token: string, remember: boolean): void {
  const maxAge = (remember ? SESSION_DAYS * 86_400 : SESSION_HOURS * 3_600);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`);
}

/** Simple in-memory login throttle. */
interface AttemptRecord {
  failures: number;
  windowStarted: number;
  blockedUntil: number;
}

const attempts = new Map<string, AttemptRecord>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;
const BLOCK_MS = 5 * 60 * 1000;

export function checkLoginThrottle(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record) return { allowed: true, retryAfter: 0 };
  if (record.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((record.blockedUntil - now) / 1000) };
  }
  if (now - record.windowStarted > WINDOW_MS) {
    attempts.delete(key);
    return { allowed: true, retryAfter: 0 };
  }
  return { allowed: true, retryAfter: 0 };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const record = attempts.get(key) || { failures: 0, windowStarted: now, blockedUntil: 0 };
  if (now - record.windowStarted > WINDOW_MS) {
    record.failures = 0;
    record.windowStarted = now;
  }
  record.failures += 1;
  if (record.failures >= MAX_FAILURES) record.blockedUntil = now + BLOCK_MS;
  attempts.set(key, record);
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function isLoopback(req: Request): boolean {
  const address = (req.socket.remoteAddress || '').toLowerCase();
  return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
}

const setupCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

export function getSetupCode(): string {
  return setupCode;
}

/** Remote first-run setup requires the short code printed in the server console. */
export function verifySetupCode(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  const a = Buffer.from(input.trim());
  const b = Buffer.from(setupCode);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function rotateSecret(config: AppConfig): void {
  config.sessionSecret = crypto.randomBytes(48).toString('hex');
}
