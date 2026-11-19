import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileQuestion,
  Loader2,
  Pencil,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { FileIcon } from '../../components/FileIcon';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import { api, downloadUrl, rawUrl } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import {
  fileKind,
  formatBytes,
  formatDate,
  parentPath,
  previewKind,
  shortenMiddle,
  typeLabelKey,
} from '../../lib/files';
import { translateError } from '../../lib/preferences';
import type { FsItem } from '../../types';
import type { TranslationKey } from '../../i18n';

interface PreviewDialogProps {
  item: FsItem;
  items: FsItem[];
  onClose: () => void;
  onEdit: (item: FsItem) => void;
}

export function PreviewDialog({ item, items, onClose, onEdit }: PreviewDialogProps) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const list = useMemo(() => {
    const visible = items.filter((entry) => !entry.isDir);
    if (!visible.some((entry) => entry.path === item.path)) return [item, ...visible];
    return visible;
  }, [items, item]);
  const [currentPath, setCurrentPath] = useState(item.path);
  const [text, setText] = useState('');
  const [textError, setTextError] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setCurrentPath(item.path);
  }, [item.path]);

  const current = list.find((entry) => entry.path === currentPath) || item;
  const index = list.findIndex((entry) => entry.path === current.path);
  const kind = previewKind(current);
  const typeKey = typeLabelKey(fileKind(current)) as TranslationKey;

  useEffect(() => {
    setImageFailed(false);
    setText('');
    setTextError('');
    if (previewKind(current) !== 'text') return;
    const controller = new AbortController();
    setTextLoading(true);
    api
      .getContent(current.path, 'auto', controller.signal)
      .then((data) => setText(data.content))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setTextError(translateError(t, error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTextLoading(false);
      });
    return () => controller.abort();
  }, [current.path, t]);

  const go = (delta: number) => {
    if (list.length < 2) return;
    const next = (index + delta + list.length) % list.length;
    setCurrentPath(list[next].path);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      } else if (event.key === 'e' || event.key === 'E') {
        if (kind === 'text') {
          event.preventDefault();
          onEdit(current);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const copyPath = async () => {
    const ok = await copyText(current.path);
    toast({ type: ok ? 'success' : 'error', title: ok ? t('toast.copiedPath') : t('common.copyFailed') });
  };

  const shownText = text.length > 240_000 ? text.slice(0, 240_000) : text;

  return (
    <Dialog open onClose={onClose} className="dialog-preview">
      <div className="preview-layout">
        <section className="preview-stage">
          <header className="preview-stage-head">
            <div className="preview-stage-name" title={current.name}>
              <FileIcon item={current} size={28} />
              <span>{current.name}</span>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
              <X size={19} />
            </button>
          </header>

          <div className="preview-media">
            {kind === 'image' && (
              <>
                {imageFailed ? (
                  <div className="preview-media-error">
                    <AlertTriangle size={26} />
                    <p>{t('preview.failed')}</p>
                  </div>
                ) : (
                  <img
                    src={rawUrl(current.path, true, current.mtimeMs)}
                    alt={current.name}
                    onError={() => setImageFailed(true)}
                  />
                )}
              </>
            )}

            {kind === 'video' && (
              <video src={rawUrl(current.path, true, current.mtimeMs)} controls playsInline preload="metadata">
                {t('preview.unsupportedBody')}
              </video>
            )}

            {kind === 'audio' && (
              <div className="preview-audio">
                <div className="preview-audio-art">
                  <FileIcon item={current} size={92} />
                </div>
                <div className="preview-audio-name">{current.name}</div>
                <audio src={rawUrl(current.path, true, current.mtimeMs)} controls preload="metadata">
                  {t('preview.unsupportedBody')}
                </audio>
              </div>
            )}

            {kind === 'pdf' && (
              <iframe className="preview-pdf" src={rawUrl(current.path, true)} title={current.name} />
            )}

            {kind === 'text' && (
              <div className="preview-text">
                {textLoading && (
                  <div className="preview-media-error">
                    <Loader2 size={24} className="spinner" />
                    <p>{t('preview.loadingText')}</p>
                  </div>
                )}
                {!textLoading && textError && (
                  <div className="preview-media-error">
                    <AlertTriangle size={24} />
                    <p>{textError}</p>
                  </div>
                )}
                {!textLoading && !textError && (
                  <>
                    {text.length > 240_000 && (
                      <div className="preview-text-note">
                        {t('preview.textTooBig', { count: formatBytes(text.length, locale) })}
                      </div>
                    )}
                    <pre>{shownText}</pre>
                  </>
                )}
              </div>
            )}

            {kind === 'none' && (
              <div className="preview-fallback">
                <div className="preview-fallback-icon">
                  <FileQuestion size={38} />
                </div>
                <h3>{t('preview.noPreview')}</h3>
                <p>{t('preview.noPreviewBody')}</p>
                <a className="btn btn-primary" href={downloadUrl(current.path)} download>
                  <Download size={16} />
                  {t('common.download')}
                </a>
              </div>
            )}
          </div>

          <footer className="preview-stage-foot">
            <button
              type="button"
              className="icon-btn"
              onClick={() => go(-1)}
              disabled={list.length < 2}
              aria-label={t('preview.prev')}
              title={t('preview.prev')}
            >
              <ChevronLeft size={20} />
            </button>
            <span className="preview-counter">{t('preview.count', { index: index + 1, count: list.length })}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => go(1)}
              disabled={list.length < 2}
              aria-label={t('preview.next')}
              title={t('preview.next')}
            >
              <ChevronRight size={20} />
            </button>
            <span className="preview-foot-spacer" />
            {kind === 'text' && (
              <span className="preview-edit-hint">
                <kbd>E</kbd>
                {t('preview.editHint')}
              </span>
            )}
            {kind === 'image' && (
              <a className="preview-open-original" href={rawUrl(current.path, true)} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                {t('preview.openOriginal')}
              </a>
            )}
          </footer>
        </section>

        <aside className="preview-sidebar">
          <div className="preview-file-head">
            <FileIcon item={current} size={54} />
            <div className="preview-file-copy">
              <h2 title={current.name}>{current.name}</h2>
              <span>{t(typeKey)}</span>
            </div>
          </div>

          {current.protected && (
            <div className="protected-chip">
              <ShieldAlert size={14} />
              {t('preview.protected')}
            </div>
          )}

          <dl className="preview-details">
            <div>
              <dt>{t('preview.size')}</dt>
              <dd>{formatBytes(current.size, locale)}</dd>
            </div>
            <div>
              <dt>{t('preview.modified')}</dt>
              <dd>{formatDate(current.mtimeMs, locale)}</dd>
            </div>
            <div>
              <dt>{t('preview.type')}</dt>
              <dd>{t(typeKey)}</dd>
            </div>
            <div>
              <dt>{t('preview.location')}</dt>
              <dd className="preview-location" title={parentPath(current.path) || current.path}>
                {shortenMiddle(parentPath(current.path) || current.path, 46)}
              </dd>
            </div>
          </dl>

          <div className="preview-actions">
            <a className="btn btn-primary btn-block" href={downloadUrl(current.path)} download>
              <Download size={16} />
              {t('common.download')}
            </a>
            {kind === 'text' && (
              <button type="button" className="btn btn-secondary btn-block" onClick={() => onEdit(current)}>
                <Pencil size={16} />
                {t('common.edit')}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-block" onClick={() => void copyPath()}>
              <Copy size={16} />
              {t('actions.copyPath')}
            </button>
          </div>

          <button type="button" className="preview-close-full" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </aside>
      </div>
    </Dialog>
  );
}
