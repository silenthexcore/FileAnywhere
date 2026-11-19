import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import { DATA_DIR } from './config';
import { clientIp } from './auth';

const LOG_PATH = path.join(DATA_DIR, 'audit.log');
const MAX_LOG_SIZE = 2 * 1024 * 1024;

export function audit(req: Request, action: string, details: Record<string, unknown> = {}): void {
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX_LOG_SIZE) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.1`);
    }
    const record = {
      at: new Date().toISOString(),
      action,
      ip: clientIp(req),
      ...details,
    };
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    /* auditing must never break an operation */
  }
}
