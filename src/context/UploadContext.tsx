import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../i18n';
import { useToast } from '../components/Toast';
import { useProtection } from './ProtectionContext';
import { translateError } from '../lib/preferences';
import { UploadTray } from '../components/UploadTray';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';

export interface UploadTask {
  id: number;
  name: string;
  size: number;
  loaded: number;
  status: UploadStatus;
  destination: string;
  path?: string;
  error?: string;
  renamed?: boolean;
}

interface UploadContextValue {
  tasks: UploadTask[];
  add: (destination: string, files: File[]) => void;
  cancel: (id: number) => void;
  clearFinished: () => void;
  lastUpload: { destination: string; nonce: number } | null;
}

const UploadContext = createContext<UploadContextValue | null>(null);
let nextTaskId = 1;

export function UploadProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { askProtection } = useProtection();
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [lastUpload, setLastUpload] = useState<{ destination: string; nonce: number } | null>(null);
  const controllers = useRef(new Map<number, AbortController>());

  const patch = useCallback((id: number, changes: Partial<UploadTask>) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...changes } : task)));
  }, []);

  const add = useCallback(
    (destination: string, input: File[]) => {
      if (!input.length) return;
      let files = input;
      if (files.length > 50) {
        files = files.slice(0, 50);
        toast({ type: 'warning', title: t('toast.warning'), message: t('upload.tooMany') });
      }
      const batch = files.map((file) => ({
        id: nextTaskId++,
        name: file.name,
        size: file.size,
        loaded: 0,
        status: 'queued' as UploadStatus,
        destination,
      }));
      setTasks((current) => [...current, ...batch].slice(-80));

      void (async () => {
        let uploaded = 0;
        let renamed = false;
        let failed = 0;
        let firstError: unknown = null;
        let declined = 0;

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          const task = batch[index];
          const controller = new AbortController();
          controllers.current.set(task.id, controller);
          patch(task.id, { status: 'uploading', loaded: 0 });
          const onProgress = (loaded: number) => patch(task.id, { loaded });
          try {
            let response;
            try {
              response = await api.upload(destination, file, false, onProgress, controller.signal);
            } catch (error) {
              if (error instanceof ApiError && error.code === 'PROTECTED_PATH') {
                const allowed = await askProtection({ operation: 'upload', paths: [destination] });
                if (!allowed) {
                  declined += 1;
                  patch(task.id, { status: 'cancelled' });
                  continue;
                }
                response = await api.upload(destination, file, true, onProgress, controller.signal);
              } else {
                throw error;
              }
            }
            const item = response.items[0];
            uploaded += 1;
            if (response.renamedCount > 0) renamed = true;
            patch(task.id, {
              status: 'done',
              loaded: file.size,
              path: item?.path,
              renamed: item?.renamed,
            });
            setLastUpload({ destination, nonce: Date.now() + Math.random() });
          } catch (error) {
            const code = error instanceof ApiError ? error.code : '';
            if (code === 'UPLOAD_ABORTED') {
              patch(task.id, { status: 'cancelled' });
            } else {
              failed += 1;
              if (!firstError) firstError = error;
              patch(task.id, {
                status: 'failed',
                error: translateError(t, error as ApiError),
              });
            }
          } finally {
            controllers.current.delete(task.id);
          }
        }

        if (uploaded > 0) {
          const message = t('upload.completeBody', {
            count: uploaded,
            folder: destination.split(/[\\/]/).filter(Boolean).pop() || destination,
          });
          toast({
            type: 'success',
            title: t('upload.complete'),
            message: renamed ? `${message} ${t('upload.renamed')}` : message,
          });
        }
        if (failed > 0) {
          toast({
            type: 'error',
            title: t('upload.failedTitle'),
            message: initialUploadError(t, firstError, failed),
          });
        }
        if (declined > 0) {
          toast({ type: 'info', title: t('protection.cancelled') });
        }
      })();
    },
    [askProtection, patch, t, toast],
  );

  const cancel = useCallback((id: number) => {
    controllers.current.get(id)?.abort();
  }, []);

  const clearFinished = useCallback(() => {
    setTasks((current) => current.filter((task) => task.status === 'queued' || task.status === 'uploading'));
  }, []);

  const value = useMemo(
    () => ({ tasks, add, cancel, clearFinished, lastUpload }),
    [tasks, add, cancel, clearFinished, lastUpload],
  );

  return (
    <UploadContext.Provider value={value}>
      {children}
      <UploadTray />
    </UploadContext.Provider>
  );
}

function initialUploadError(
  t: (key: import('../i18n').TranslationKey, vars?: Record<string, string | number>) => string,
  error: unknown,
  failed: number,
): string {
  if (!error) return t('toast.operationFailed');
  if (failed === 1 && error instanceof ApiError) return translateError(t, error);
  return t('toast.operationFailed');
}

export function useUploads(): UploadContextValue {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUploads must be used inside UploadProvider');
  return context;
}
