import type {
  Health,
  Listing,
  SearchResponse,
  StatResponse,
  SystemInfo,
  TextContent,
  TunnelStatus,
  UploadResponse,
} from '../types';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 0, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const UNAUTHORIZED_EVENT = 'fileanywhere:unauthorized';

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-FileAnywhere': '1',
    ...(options.headers || {}),
  };
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      body = options.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body,
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError('NETWORK', 'Could not reach the server.', 0);
  }
  const contentType = response.headers.get('content-type') || '';
  let payload: unknown = null;
  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  } else {
    payload = await response.text().catch(() => '');
  }
  if (!response.ok) {
    const data = payload as { error?: { code?: string; message?: string; details?: unknown } } | null;
    const code = data?.error?.code || (response.status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR');
    const message = data?.error?.message || response.statusText || 'Request failed.';
    if (response.status === 401 && code === 'UNAUTHORIZED' && !path.startsWith('/api/auth/login') && path !== '/api/auth/me') {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(code, message, response.status, data?.error?.details);
  }
  return payload as T;
}

export const api = {
  health: () => request<Health>('/api/health'),
  setup: (password: string, setupCode?: string) =>
    request<{ ok: true }>('/api/setup', { method: 'POST', body: { password, setupCode } }),
  login: (password: string, remember: boolean) =>
    request<{ ok: true }>('/api/auth/login', { method: 'POST', body: { password, remember } }),
  me: () => request<{ authenticated: boolean; version: string }>('/api/auth/me'),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
  logoutAll: () => request<{ ok: true }>('/api/auth/logout-all', { method: 'POST' }),

  systemInfo: (refresh = false) =>
    request<SystemInfo>(`/api/system/info${refresh ? '?refresh=1' : ''}`),
  tunnelStatus: () => request<TunnelStatus>('/api/system/tunnel'),
  startTunnel: () => request<TunnelStatus>('/api/system/tunnel/start', { method: 'POST' }),
  stopTunnel: () => request<TunnelStatus>('/api/system/tunnel/stop', { method: 'POST' }),
  installTunnel: () => request<TunnelStatus>('/api/system/tunnel/install', { method: 'POST' }),
  setTunnelAutoStart: (autoStart: boolean) =>
    request<TunnelStatus>('/api/system/tunnel/settings', { method: 'POST', body: { autoStart } }),

  list: (path: string, dirsOnly = false, signal?: AbortSignal) =>
    request<Listing>(`/api/fs/list${buildQuery({ path, dirsOnly: dirsOnly ? 1 : undefined })}`, { signal }),
  stat: (path: string) => request<StatResponse>(`/api/fs/stat${buildQuery({ path })}`),
  getContent: (path: string, encoding = 'auto', signal?: AbortSignal) =>
    request<TextContent>(`/api/fs/content${buildQuery({ path, encoding })}`, { signal }),
  saveContent: (
    path: string,
    content: string,
    encoding: string,
    bom: boolean,
    expectedMtimeMs: number | null,
    allowProtected = false,
    signal?: AbortSignal,
  ) =>
    request<{ path: string; mtimeMs: number; size: number }>('/api/fs/content', {
      method: 'PUT',
      body: { path, content, encoding, bom, expectedMtimeMs, allowProtected },
      signal,
    }),
  createFolder: (parent: string, name: string, allowProtected = false) =>
    request<{ path: string }>('/api/fs/folder', { method: 'POST', body: { parent, name, allowProtected } }),
  createFile: (parent: string, name: string, allowProtected = false) =>
    request<{ path: string }>('/api/fs/file', { method: 'POST', body: { parent, name, allowProtected } }),
  rename: (path: string, newName: string, allowProtected = false) =>
    request<{ path: string }>('/api/fs/rename', { method: 'POST', body: { path, newName, allowProtected } }),
  move: (paths: string[], destination: string, allowProtected = false) =>
    request<{ results: import('../types').OperationResult[]; destination: string }>('/api/fs/move', {
      method: 'POST',
      body: { paths, destination, allowProtected },
    }),
  copy: (paths: string[], destination: string, allowProtected = false) =>
    request<{ results: import('../types').OperationResult[]; destination: string }>('/api/fs/copy', {
      method: 'POST',
      body: { paths, destination, allowProtected },
    }),
  remove: (paths: string[], allowProtected = false) =>
    request<{ results: import('../types').OperationResult[] }>('/api/fs/delete', {
      method: 'POST',
      body: { paths, allowProtected },
    }),
  search: (
    path: string,
    query: string,
    recursive: boolean,
    includeHidden: boolean,
    signal?: AbortSignal,
  ) =>
    request<SearchResponse>(
      `/api/fs/search${buildQuery({ path, q: query, recursive: recursive ? 1 : 0, hidden: includeHidden ? 1 : 0 })}`,
      { signal },
    ),
  createArchiveTicket: (paths: string[]) =>
    request<{ ticket: string }>('/api/fs/archive', { method: 'POST', body: { paths } }),
  upload: (destination: string, file: File, allowProtected: boolean, onProgress: (loaded: number) => void, signal: AbortSignal) =>
    uploadWithProgress(destination, file, allowProtected, onProgress, signal),
};

export function rawUrl(path: string, inline = true, cacheKey?: number | null): string {
  return `/api/fs/raw${buildQuery({ path, inline: inline ? 1 : undefined, v: cacheKey || undefined })}`;
}

export function downloadUrl(path: string): string {
  return `/api/fs/download${buildQuery({ path })}`;
}

export function archiveUrl(ticket: string): string {
  return `/api/fs/archive/${encodeURIComponent(ticket)}`;
}

function uploadWithProgress(
  destination: string,
  file: File,
  allowProtected: boolean,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/fs/upload${buildQuery({ dest: destination, allowProtected: allowProtected ? 1 : undefined })}`);
    xhr.setRequestHeader('X-FileAnywhere', '1');
    xhr.responseType = 'text';
    const abortHandler = () => xhr.abort();
    signal.addEventListener('abort', abortHandler, { once: true });
    const cleanup = () => signal.removeEventListener('abort', abortHandler);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      cleanup();
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as UploadResponse);
        return;
      }
      const payload = data as { error?: { code?: string; message?: string; details?: unknown } } | null;
      if (xhr.status === 401 && payload?.error?.code === 'UNAUTHORIZED') {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
      reject(
        new ApiError(
          payload?.error?.code || 'UPLOAD_FAILED',
          payload?.error?.message || 'Upload failed.',
          xhr.status,
          payload?.error?.details,
        ),
      );
    };
    xhr.onerror = () => {
      cleanup();
      reject(new ApiError('NETWORK', 'Could not reach the server.', 0));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new ApiError('UPLOAD_ABORTED', 'Upload cancelled.', 0));
    };
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}

export { buildQuery };
