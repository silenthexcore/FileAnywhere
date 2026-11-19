import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP_NAME = 'FileAnywhere';
export const APP_VERSION = '1.0.0';
export const DEFAULT_PORT = 8666;

export interface StoredPassword {
  salt: string;
  hash: string;
}

export interface AppConfig {
  version: number;
  port: number;
  sessionSecret: string;
  password: StoredPassword | null;
  createdAt: string | null;
  tunnel: {
    cloudflaredPath: string;
    autoStart: boolean;
  };
}

const dataDirOverride = process.env.FILEANYWHERE_DATA_DIR;
export const DATA_DIR = path.resolve(
  dataDirOverride && dataDirOverride.trim()
    ? dataDirOverride
    : path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'FileAnywhere'),
);
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const CONFIG_TMP = path.join(DATA_DIR, 'config.json.tmp');

function freshConfig(): AppConfig {
  return {
    version: 1,
    port: Number(process.env.PORT) || DEFAULT_PORT,
    sessionSecret: crypto.randomBytes(48).toString('hex'),
    password: null,
    createdAt: null,
    tunnel: { cloudflaredPath: '', autoStart: false },
  };
}

export function ensureDataDir(): void {
  fs.mkdirSync(path.join(DATA_DIR, 'bin'), { recursive: true });
}

export function loadConfig(): AppConfig {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    const config = freshConfig();
    saveConfig(config);
    return config;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<AppConfig>;
    const config: AppConfig = {
      ...freshConfig(),
      ...raw,
      tunnel: { ...freshConfig().tunnel, ...(raw.tunnel || {}) },
    };
    if (!config.sessionSecret || config.sessionSecret.length < 32) {
      config.sessionSecret = crypto.randomBytes(48).toString('hex');
      saveConfig(config);
    }
    return config;
  } catch (error) {
    const backup = `${CONFIG_PATH}.broken-${Date.now()}`;
    try {
      fs.copyFileSync(CONFIG_PATH, backup);
    } catch {
      /* ignore */
    }
    const config = freshConfig();
    saveConfig(config);
    console.error(`[config] Could not read config.json; a fresh configuration was created (${String(error)}).`);
    return config;
  }
}

export function saveConfig(config: AppConfig): void {
  ensureDataDir();
  fs.writeFileSync(CONFIG_TMP, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(CONFIG_TMP, CONFIG_PATH);
}

export function getPort(config: AppConfig): number {
  const envPort = Number(process.env.PORT);
  if (Number.isInteger(envPort) && envPort > 0 && envPort < 65536) return envPort;
  return config.port || DEFAULT_PORT;
}
