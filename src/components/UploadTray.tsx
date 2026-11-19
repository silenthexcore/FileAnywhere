import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { useUploads, type UploadTask } from '../context/UploadContext';
import { FileIcon } from './FileIcon';
import { formatBytes } from '../lib/files';

export function UploadTray() {
  const { t, locale } = useI18n();
  const { tasks, cancel, clearFinished } = useUploads();
  const [minimized, setMinimized] = useState(false);
  const [countSeen, setCountSeen] = useState(0);

  useEffect(() => {
    if (tasks.length > countSeen) setMinimized(false);
    setCountSeen(tasks.length);
  }, [tasks.length, countSeen]);

  const summary = useMemo(() => {
    const total = tasks.reduce((sum, task) => sum + task.size, 0);
    const loaded = tasks.reduce((sum, task) => sum + Math.min(task.loaded, task.size), 0);
    const active = tasks.filter((task) => task.status === 'queued' || task.status === 'uploading');
    const finished = tasks.filter((task) => task.status !== 'queued' && task.status !== 'uploading');
    return {
      total,
      loaded,
      active,
      finished,
      percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : active.length ? 0 : 100,
    };
  }, [tasks]);

  if (tasks.length === 0) return null;

  return (
    <section className={`upload-tray${minimized ? ' is-minimized' : ''}`} aria-label={t('upload.trayTitle')}>
      <header className="upload-tray-head">
        <div className="upload-tray-icon">
          {summary.active.length > 0 ? <UploadCloud size={17} /> : <Check size={17} />}
        </div>
        <div className="upload-tray-heading">
          <span className="upload-tray-title">{t('upload.trayTitle')}</span>
          <span className="upload-tray-sub">
            {summary.active.length > 0
              ? t('upload.progress', {
                  done: tasks.filter((task) => task.status === 'done').length,
                  total: tasks.length,
                })
              : t('upload.complete')}
          </span>
        </div>
        {summary.active.length > 0 && <span className="upload-tray-percent">{summary.percent}%</span>}
        {summary.finished.length > 0 && summary.active.length === 0 && (
          <button type="button" className="upload-head-btn" onClick={clearFinished}>
            {t('upload.clear')}
          </button>
        )}
        <button
          type="button"
          className="upload-head-btn icon-only"
          onClick={() => setMinimized((value) => !value)}
          aria-label={minimized ? t('upload.expand') : t('upload.minimize')}
        >
          {minimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </header>
      <div className="upload-tray-progress" aria-hidden="true">
        <span style={{ width: `${summary.percent}%` }} />
      </div>
      {!minimized && (
        <div className="upload-tray-list">
          {tasks.slice(-8).map((task) => (
            <UploadRow key={task.id} task={task} locale={locale} onCancel={() => cancel(task.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function UploadRow({
  task,
  locale,
  onCancel,
}: {
  task: UploadTask;
  locale: string;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ext = task.name.includes('.') ? task.name.split('.').pop() || '' : '';
  const percent = task.size > 0 ? Math.min(100, Math.round((task.loaded / task.size) * 100)) : 0;
  const statusText =
    task.status === 'queued'
      ? t('upload.queued')
      : task.status === 'uploading'
        ? `${formatBytes(task.loaded, locale)} / ${formatBytes(task.size, locale)}`
        : task.status === 'done'
          ? task.renamed
            ? t('upload.done')
            : t('upload.done')
          : task.status === 'cancelled'
            ? t('upload.cancelled')
            : task.error || t('upload.failed');

  return (
    <div className={`upload-task is-${task.status}`} title={task.error}>
      <div className="upload-task-icon">
        <FileIcon item={{ isDir: false, ext, name: task.name }} size={30} />
      </div>
      <div className="upload-task-main">
        <div className="upload-task-row">
          <span className="upload-task-name">{task.name}</span>
          <span className="upload-task-status">
            {task.status === 'uploading' && <Loader2 size={12} className="spinner" />}
            {task.status === 'done' && <Check size={12} />}
            {task.status === 'failed' && <AlertCircle size={12} />}
            {task.status === 'cancelled' && <Ban size={12} />}
            {task.status === 'uploading' ? `${percent}%` : statusText}
          </span>
        </div>
        <div className="upload-task-bar" aria-hidden="true">
          <span style={{ width: `${task.status === 'done' ? 100 : percent}%` }} />
        </div>
      </div>
      {(task.status === 'uploading' || task.status === 'queued') && (
        <button
          type="button"
          className="upload-task-cancel"
          onClick={onCancel}
          aria-label={t('upload.cancel')}
          title={t('upload.cancel')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
