import http from 'node:http';
import os from 'node:os';
import { APP_NAME, APP_VERSION, DATA_DIR } from './config';
import { appConfig, appPort, tunnel } from './context';
import { getSetupCode } from './auth';
import { createApp } from './app';
import { getHostnameUrl, getLanAddresses } from './system';

const useColor = Boolean(process.stdout.isTTY);
const color = (code: string, text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = (text: string) => color('1', text);
const dim = (text: string) => color('2', text);
const cyan = (text: string) => color('36', text);

async function main(): Promise<void> {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    console.error('FileAnywhere requires Node.js 20 or newer.');
    process.exit(1);
  }

  const app = createApp();
  const server = http.createServer({ requestTimeout: 60 * 60 * 1000 }, app);
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 65_000;

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `\n${color('31', 'Port is already in use')} (${appPort}).\n` +
          `Another copy of FileAnywhere may already be running, or choose another port with "set PORT=8677" before starting.\n`,
      );
    } else {
      console.error('[server] Failed to start:', error);
    }
    process.exit(1);
  });

  server.listen(appPort, '0.0.0.0', () => {
    const lan = getLanAddresses(appPort);
    const setupRequired = !appConfig.password;
    console.log('');
    console.log(bold(`  ${APP_NAME} ${APP_VERSION}`) + dim('  ·  随档'));
    console.log(dim('  Your files, anywhere.'));
    console.log('');
    console.log(`  Local      ${cyan(`http://localhost:${appPort}`)}`);
    for (const address of lan) {
      console.log(`  Network    ${cyan(address.url)}  ${dim(`(${address.name})`)}`);
    }
    const hostnameUrl = getHostnameUrl(appPort);
    if (hostnameUrl) console.log(`  Hostname   ${cyan(hostnameUrl)}`);
    console.log(`  Data       ${dim(DATA_DIR)}`);
    console.log('');
    if (setupRequired) {
      console.log(color('33', '  First run: open the local address on this PC and create a password.'));
      console.log(`  Remote setup code: ${bold(getSetupCode())}`);
      console.log(dim('  (The code is only required if you finish setup from another device.)'));
      console.log('');
    } else {
      console.log(dim(`  Signed in devices stay connected for up to 30 days. Port: ${appPort}.`));
      console.log('');
    }
    console.log(dim('  Press Ctrl+C to stop.'));

    if (appConfig.tunnel.autoStart) {
      tunnel
        .start()
        .then((status) => {
          if (status.url) console.log(`\n  ${bold('Tunnel')}     ${cyan(status.url)}`);
        })
        .catch((error) => console.error(`[tunnel] Auto-start failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`\n  ${dim(`Stopping (${signal})…`)}`);
    try {
      await tunnel.stop();
    } catch {
      /* ignore */
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    console.error('[server] Uncaught exception:', error);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });
}

void main();
