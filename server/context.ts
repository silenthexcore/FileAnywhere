import { getPort, loadConfig } from './config';
import { TunnelManager } from './tunnel';

/** Single shared runtime state for the server. */
export const appConfig = loadConfig();
export const appPort = getPort(appConfig);
export const tunnel = new TunnelManager(appConfig, appPort);
