import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, FolderOpen, FolderSearch, Loader2, Search, SearchX, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { usePreferences } from '../../lib/PreferencesContext';
import { formatBytes, formatDuration, formatNumber, highlightParts, shortenMiddle } from '../../lib/files';
import { FileIcon } from '../../components/FileIcon';
import { translateError } from '../../lib/preferences';
import type { FsItem, SearchResponse } from '../../types';

interface SearchPanelProps {
  open: boolean;
  basePath: string;
  onClose: () => void;
  onOpen: (item: FsItem) => void;
  onReveal: (item: FsItem) => void;
}

export function SearchPanel({ open, basePath, onClose, onOpen, onReveal }: SearchPanelProps) {
  const { t, locale } = useI18n();
  const { prefs } = usePreferences();
  const [query, setQuery] = useState('');
  const [recursive, setRecursive] = useState(true);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResult(null);
    setError('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    abortRef.current?.abort();
    if (trimmed.length < 2) {
      setResult(null);
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      api
        .search(basePath, trimmed, recursive, prefs.showHidden, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setResult(next);
          setActive(0);
        })
        .catch((caught) => {
          if (controller.signal.aborted || (caught as Error)?.name === 'AbortError') return;
          setError(translateError(t, caught as ApiError));
          setResult(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, basePath, recursive, prefs.showHidden, t]);

  const results = result?.results || [];
  const scopeLabel = recursive ? t('search.includeSubfolders') : t('search.thisFolderOnly');

  const previewPath = useMemo(() => shortenMiddle(basePath, 64), [basePath]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter') {
      const item = results[active];
      if (item) {
        event.preventDefault();
        onOpen(item);
      }
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="search-layer" role="dialog" aria-modal="true" aria-label={t('common.search')}>
      <button type="button" className="search-backdrop" onClick={onClose} aria-label={t('search.close')} />
      <section className="search-panel">
        <header className="search-head">
          <Search size={20} className="search-head-icon" />
          <input
            ref={inputRef}
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t('search.placeholder')}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <Loader2 size={18} className="spinner search-spinner" />}
          <button type="button" className="icon-btn search-close" onClick={onClose} aria-label={t('search.close')}>
            <X size={19} />
          </button>
        </header>

        <div className="search-scope">
          <span className="search-scope-path" title={basePath}>
            {t('search.inFolder', { folder: previewPath })}
          </span>
          <div className="segmented segmented-sm" role="group">
            <button
              type="button"
              className={recursive ? 'is-active' : ''}
              onClick={() => setRecursive(true)}
            >
              {t('search.includeSubfolders')}
            </button>
            <button
              type="button"
              className={!recursive ? 'is-active' : ''}
              onClick={() => setRecursive(false)}
            >
              {t('search.thisFolderOnly')}
            </button>
          </div>
        </div>

        <div className="search-results" role="listbox">
          {query.trim().length < 2 && (
            <div className="search-empty">
              <div className="search-empty-icon">
                <Search size={24} />
              </div>
              <p>{t('search.hint', { scope: scopeLabel })}</p>
            </div>
          )}

          {query.trim().length >= 2 && loading && results.length === 0 && (
            <div className="search-empty">
              <Loader2 size={24} className="spinner" />
              <p>{t('search.searching')}</p>
            </div>
          )}

          {error && (
            <div className="search-empty is-error">
              <SearchX size={24} />
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && query.trim().length >= 2 && result && results.length === 0 && (
            <div className="search-empty">
              <div className="search-empty-icon">
                <SearchX size={24} />
              </div>
              <p>{t('search.noResults', { query: query.trim() })}</p>
              <span>{t('search.noResultsBody')}</span>
            </div>
          )}

          {results.map((item, index) => (
            <div
              key={item.path}
              className={`search-result${active === index ? ' is-active' : ''}`}
              role="option"
              aria-selected={active === index}
              onMouseEnter={() => setActive(index)}
            >
              <button type="button" className="search-result-main" onClick={() => onOpen(item)}>
                <FileIcon item={item} size={34} />
                <span className="search-result-copy">
                  <span className="search-result-name">
                    {highlightParts(item.name, query.trim()).map((part, partIndex) =>
                      part.match ? <mark key={partIndex}>{part.text}</mark> : <span key={partIndex}>{part.text}</span>,
                    )}
                  </span>
                  <span className="search-result-meta">
                    {item.isDir ? t('common.folder') : formatBytes(item.size, locale)}
                    <span className="dot-separator" />
                    <span className="search-result-path" title={item.path}>
                      {shortenMiddle(item.path.slice(0, Math.max(item.path.length - item.name.length, 0)) || item.path, 72)}
                    </span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="search-result-action"
                onClick={() => onReveal(item)}
                title={t('search.openLocation')}
                aria-label={t('search.openLocation')}
              >
                <FolderOpen size={17} />
              </button>
              {active === index && (
                <span className="search-enter-hint" aria-hidden="true">
                  <CornerDownLeft size={13} />
                </span>
              )}
            </div>
          ))}
        </div>

        <footer className="search-foot">
          {result && (
            <span>
              {t('search.resultsCount', { count: results.length })}
              <span className="dot-separator" />
              {t('search.scanned', {
                count: formatNumber(result.scanned, locale),
                time: formatDuration(result.elapsedMs),
              })}
            </span>
          )}
          {result?.truncated && <span className="search-truncated">{t('search.truncated')}</span>}
          {!result && (
            <span className="search-foot-hint">
              <FolderSearch size={13} />
              {scopeLabel}
            </span>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
