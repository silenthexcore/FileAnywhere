import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AppConfig } from './config';
import { DATA_DIR, saveConfig } from './config';

const execFileAsync = promisify(execFile);
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

export interface TunnelStatus {
  supported: boolean;
  installed: boolean;
  installing: boolean;
  running: boolean;
  starting: boolean;
  url: string | null;
  error: string | null;
  autoStart: boolean;
  path: string | null;
}

export class TunnelManager {
  private config: AppConfig;
  private port: number;
  private child: ChildProcessWithoutNullStreams | null = null;
  private running = false;
  private starting = false;
  private url: string | null = null;
  private error: string | null = null;
  private installing = false;
  private installError: string | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private lastLogs: string[] = [];

  constructor(config: AppConfig, port: number) {
    this.config = config;
    this.port = port;
  }

  setPort(port: number): void {
    this.port = port;
  }

  private bundledPath(): string {
    return path.join(DATA_DIR, 'bin', process.arch === 'arm64' ? 'cloudflared-arm64.exe' : 'cloudflared.exe');
  }

  async detectPath(): Promise<string | null> {
    const candidates = [this.config.tunnel.cloudflaredPath, this.bundledPath()].filter(Boolean);
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch {
        /* ignore */
      }
    }
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execFileAsync('where.exe', ['cloudflared'], { windowsHide: true, timeout: 4000 });
        const first = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
        if (first) return first;
      } catch {
        /* not on PATH */
      }
    }
    return null;
  }

  async status(): Promise<TunnelStatus> {
    const detected = await this.detectPath();
    return {
      supported: process.platform === 'win32',
      installed: Boolean(detected),
      installing: this.installing,
      running: this.running,
      starting: this.starting,
      url: this.url,
      error: this.error || this.installError,
      autoStart: Boolean(this.config.tunnel.autoStart),
      path: detected,
    };
  }

  async start(): Promise<TunnelStatus> {
    if (this.running) return this.status();
    if (this.starting) throw new Error('The tunnel is already starting.');
    const executable = await this.detectPath();
    if (!executable) {
      throw new Error('cloudflared is not installed yet.');
    }
    this.starting = true;
    this.error = null;
    this.url = null;
    this.lastLogs = [];

    try {
      const child = spawn(
        executable,
        ['tunnel', '--url', `http://127.0.0.1:${this.port}`, '--no-autoupdate'],
        { cwd: DATA_DIR, windowsHide: true, env: { ...process.env } },
      );
      this.child = child;
      const handleChunk = (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          this.lastLogs.push(line.trim());
          if (this.lastLogs.length > 30) this.lastLogs.shift();
          const match = line.match(URL_PATTERN);
          if (match && !this.url) {
            this.url = match[0];
            this.running = true;
            this.starting = false;
            if (this.startTimer) clearTimeout(this.startTimer);
            this.startTimer = null;
          }
        }
      };
      child.stdout.on('data', handleChunk);
      child.stderr.on('data', handleChunk);
      child.on('error', (spawnError) => {
        this.error = spawnError.message;
        this.running = false;
        this.starting = false;
        this.child = null;
        if (this.startTimer) clearTimeout(this.startTimer);
      });
      child.on('close', (code) => {
        const wasStarting = this.starting;
        this.running = false;
        this.starting = false;
        this.child = null;
        this.url = null;
        if (wasStarting && !this.error) {
          const detail = this.lastLogs.slice(-3).join(' ');
          this.error = `cloudflared stopped before the tunnel was ready${code !== null ? ` (exit code ${code})` : ''}.${detail ? ` ${detail}` : ''}`;
        }
        if (this.startTimer) clearTimeout(this.startTimer);
        this.startTimer = null;
      });

      await new Promise<void>((resolve, reject) => {
        this.startTimer = setTimeout(() => {
          if (!this.url) {
            this.error = 'Timed out waiting for the tunnel URL. Check the internet connection and try again.';
            this.starting = false;
            this.killChild();
            reject(new Error(this.error));
          } else {
            resolve();
          }
        }, 45_000);
        const check = setInterval(() => {
          if (this.url) {
            clearInterval(check);
            resolve();
          } else if (!this.starting && this.error) {
            clearInterval(check);
            reject(new Error(this.error));
          }
        }, 250);
        child.once('error', () => {
          clearInterval(check);
          reject(new Error(this.error || 'Could not start cloudflared.'));
        });
      });
    } catch (error) {
      this.starting = false;
      this.error = error instanceof Error ? error.message : String(error);
      throw new Error(this.error);
    }
    return this.status();
  }

  async stop(): Promise<TunnelStatus> {
    if (!this.child) {
      this.running = false;
      this.starting = false;
      this.url = null;
      return this.status();
    }
    await this.killChildAsync();
    this.running = false;
    this.starting = false;
    this.url = null;
    return this.status();
  }

  private killChild(): void {
    const child = this.child;
    if (!child || child.killed) return;
    try {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      /* ignore */
    }
  }

  private killChildAsync(): Promise<void> {
    const child = this.child;
    if (!child || child.killed) return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 4000);
      child.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.killChild();
    });
  }

  async install(): Promise<TunnelStatus> {
    if (this.installing) throw new Error('cloudflared is already being downloaded.');
    const existing = await this.detectPath();
    if (existing) return this.status();
    this.installing = true;
    this.installError = null;
    const target = this.bundledPath();
    const temporary = `${target}.download`;
    try {
      const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
      const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${arch}.exe`;
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300_000) });
      if (!response.ok || !response.body) {
        throw new Error(`Download failed with HTTP ${response.status}.`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const handle = await fs.promises.open(temporary, 'w');
      try {
        const { Readable } = await import('node:stream');
        const { pipeline } = await import('node:stream/promises');
        await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), handle.createWriteStream());
      } finally {
        await handle.close().catch(() => undefined);
      }
      const size = fs.statSync(temporary).size;
      if (size < 1_000_000) throw new Error('The downloaded file does not look like cloudflared.');
      fs.renameSync(temporary, target);
      this.config.tunnel.cloudflaredPath = target;
      saveConfig(this.config);
      return await this.status();
    } catch (error) {
      this.installError = error instanceof Error ? error.message : String(error);
      try {
        fs.rmSync(temporary, { force: true });
      } catch {
        /* ignore */
      }
      throw new Error(this.installError);
    } finally {
      this.installing = false;
    }
  }

  async setAutoStart(enabled: boolean): Promise<TunnelStatus> {
    this.config.tunnel.autoStart = enabled;
    saveConfig(this.config);
    return this.status();
  }

  shutdown(): void {
    this.killChild();
  }
}
