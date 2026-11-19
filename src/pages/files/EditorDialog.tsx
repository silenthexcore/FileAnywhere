import { useCallback, useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import {
  AlertTriangle,
  FileWarning,
  Loader2,
  Minus,
  Plus,
  Save,
  ShieldAlert,
  WrapText,
  X,
} from 'lucide-react';
import { Dialog, DialogFooter, DialogHeader } from '../../components/Dialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FileIcon } from '../../components/FileIcon';
import { Spinner } from '../../components/Controls';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import { useProtection } from '../../context/ProtectionContext';
import { usePreferences } from '../../lib/PreferencesContext';
import { api, ApiError } from '../../lib/api';
import { editorLanguage, formatBytes, formatDate } from '../../lib/files';
import { translateError } from '../../lib/preferences';
import type { FsItem, TextContent } from '../../types';

const MAX_EDITOR_BYTES = 8 * 1024 * 1024;
const ENCODINGS = [
  { id: 'utf8', label: 'UTF-8' },
  { id: 'utf16le', label: 'UTF-16 LE' },
  { id: 'utf16be', label: 'UTF-16 BE' },
  { id: 'gb18030', label: 'GB18030' },
  { id: 'big5', label: 'Big5' },
  { id: 'shift_jis', label: 'Shift_JIS' },
  { id: 'windows-1252', label: 'Windows-1252' },
];

interface EditorDialogProps {
  item: FsItem;
  onClose: () => void;
  onSaved: (path: string) => void;
}

export function EditorDialog({ item, onClose, onSaved }: EditorDialogProps) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const { askProtection } = useProtection();
  const { prefs, updatePrefs, resolvedTheme } = usePreferences();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [doc, setDoc] = useState<TextContent | null>(null);
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [encoding, setEncoding] = useState('utf8');
  const [bom, setBom] = useState(false);
  const [originalBom, setOriginalBom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ line: 1, col: 1 });
  const [discardOpen, setDiscardOpen] = useState(false);
  const [encodingAsk, setEncodingAsk] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ mtimeMs: number; size: number } | null>(null);

  const dirty = content !== original || bom !== originalBom;
  const readOnly = Boolean(doc && !doc.writable);

  const load = useCallback(
    async (requested = 'auto') => {
      setLoading(true);
      setLoadError('');
      setError('');
      setConflict(null);
      if (item.size !== null && item.size > MAX_EDITOR_BYTES) {
        setLoadError(t('editor.tooLarge'));
        setLoading(false);
        return;
      }
      try {
        const data = await api.getContent(item.path, requested);
        setDoc(data);
        setContent(data.content);
        setOriginal(data.content);
        setEncoding(data.encoding);
        setBom(data.bom);
        setOriginalBom(data.bom);
        setPosition({ line: 1, col: 1 });
      } catch (caught) {
        const apiError = caught as ApiError;
        if (apiError.code === 'BINARY_FILE') setLoadError(t('editor.binary'));
        else if (apiError.code === 'FILE_TOO_LARGE') setLoadError(t('editor.tooLarge'));
        else setLoadError(translateError(t, apiError));
      } finally {
        setLoading(false);
      }
    },
    [item.path, item.size, t],
  );

  useEffect(() => {
    void load('auto');
  }, [load]);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }, [dirty, onClose, saving]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const languageExtension = useMemo(() => {
    const language = editorLanguage(item.ext);
    switch (language) {
      case 'typescript':
        return [javascript({ typescript: true })];
      case 'typescript-jsx':
        return [javascript({ typescript: true, jsx: true })];
      case 'javascript-jsx':
        return [javascript({ jsx: true })];
      case 'javascript':
        return [javascript()];
      case 'html':
        return [html()];
      case 'css':
        return [css()];
      case 'json':
        return [json()];
      case 'markdown':
        return [markdown()];
      case 'python':
        return [python()];
      case 'sql':
        return [sql()];
      case 'xml':
        return [xml()];
      default:
        return [];
    }
  }, [item.ext]);

  const themeExtension = useMemo(() => {
    const dark = resolvedTheme === 'dark';
    const base = EditorView.theme(
      {
        '&': {
          backgroundColor: 'transparent',
          color: 'var(--text)',
          height: '100%',
        },
        '.cm-scroller': {
          fontFamily: 'var(--font-mono)',
          fontSize: `${prefs.editorFontSize}px`,
          lineHeight: '1.7',
        },
        '.cm-content': {
          padding: '14px 0 40px',
          caretColor: 'var(--accent)',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          color: 'var(--text-faint)',
          border: 'none',
          paddingLeft: '6px',
        },
        '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
        '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
          backgroundColor: 'var(--editor-selection)',
        },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
        '.cm-panels': { backgroundColor: 'var(--surface-2)', color: 'var(--text)' },
        '.cm-searchMatch': { backgroundColor: 'var(--editor-selection)' },
        '&.cm-focused': { outline: 'none' },
      },
      { dark },
    );
    const highlight = syntaxHighlighting(
      HighlightStyle.define([
        { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: 'var(--syntax-keyword)' },
        { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--syntax-string)' },
        { tag: [tags.number, tags.bool, tags.null], color: 'var(--syntax-number)' },
        { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--syntax-comment)', fontStyle: 'italic' },
        { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syntax-function)' },
        { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--syntax-type)' },
        { tag: [tags.propertyName, tags.attributeName], color: 'var(--syntax-property)' },
        { tag: [tags.tagName, tags.angleBracket], color: 'var(--syntax-tag)' },
        { tag: [tags.heading, tags.strong], color: 'var(--syntax-heading)', fontWeight: '600' },
        { tag: [tags.link, tags.url], color: 'var(--accent)', textDecoration: 'underline' },
        { tag: tags.invalid, color: 'var(--danger)' },
      ]),
    );
    return [base, highlight, ...(prefs.editorWrap ? [EditorView.lineWrapping] : [])];
  }, [prefs.editorFontSize, prefs.editorWrap, resolvedTheme]);

  const save = useCallback(
    async (force = false) => {
      if (!doc || saving || (!dirty && !force)) return;
      setSaving(true);
      setError('');
      const saveWith = (allowProtected: boolean, expected: number | null) =>
        api.saveContent(item.path, content, encoding, bom, expected, allowProtected);
      try {
        let result;
        try {
          result = await saveWith(false, force ? null : doc.mtimeMs);
        } catch (caught) {
          if (caught instanceof ApiError && caught.code === 'PROTECTED_PATH') {
            const allowed = await askProtection({ operation: 'save', paths: [item.path] });
            if (!allowed) {
              setSaving(false);
              return;
            }
            result = await saveWith(true, force ? null : doc.mtimeMs);
          } else {
            throw caught;
          }
        }
        setDoc((current) => (current ? { ...current, mtimeMs: result.mtimeMs, size: result.size } : current));
        setOriginal(content);
        setOriginalBom(bom);
        setConflict(null);
        toast({ type: 'success', title: t('editor.savedToast', { name: item.name }) });
        onSaved(item.path);
      } catch (caught) {
        if (caught instanceof ApiError && caught.code === 'FILE_CHANGED') {
          setConflict(caught.details as { mtimeMs: number; size: number });
        } else {
          setError(translateError(t, caught as ApiError));
        }
      } finally {
        setSaving(false);
      }
    },
    [askProtection, bom, content, dirty, doc, encoding, item.name, item.path, onSaved, saving, t, toast],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);

  const changeEncoding = (next: string) => {
    if (next === encoding) return;
    if (dirty) setEncodingAsk(next);
    else void load(next);
  };

  return (
    <>
      <Dialog open onClose={requestClose} className="dialog-editor" closeOnBackdrop={!saving}>
        <header className="editor-head">
          <div className="editor-file">
            <FileIcon item={item} size={34} />
            <div className="editor-file-copy">
              <div className="editor-title-row">
                <h2 title={item.path}>{item.name}</h2>
                <span className={`editor-state ${dirty ? 'is-dirty' : 'is-saved'}`}>
                  {dirty ? t('editor.unsaved') : t('editor.saved')}
                </span>
              </div>
              <span className="editor-path" title={item.path}>
                {item.path}
              </span>
            </div>
          </div>

          <div className="editor-actions">
            <label className="editor-select">
              <span>{t('editor.encoding')}</span>
              <select
                className="select select-sm"
                value={encoding}
                onChange={(event) => changeEncoding(event.target.value)}
                disabled={saving || loading}
              >
                {ENCODINGS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`icon-btn editor-tool${prefs.editorWrap ? ' is-active' : ''}`}
              onClick={() => updatePrefs({ editorWrap: !prefs.editorWrap })}
              title={prefs.editorWrap ? t('editor.noWrap') : t('editor.wrap')}
              aria-label={prefs.editorWrap ? t('editor.noWrap') : t('editor.wrap')}
            >
              <WrapText size={17} />
            </button>
            <div className="editor-font-size">
              <button
                type="button"
                className="icon-btn"
                onClick={() => updatePrefs({ editorFontSize: Math.max(11, prefs.editorFontSize - 1) })}
                aria-label={t('editor.fontSmaller')}
                title={t('editor.fontSmaller')}
              >
                <Minus size={14} />
              </button>
              <span>{prefs.editorFontSize}</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => updatePrefs({ editorFontSize: Math.min(22, prefs.editorFontSize + 1) })}
                aria-label={t('editor.fontLarger')}
                title={t('editor.fontLarger')}
              >
                <Plus size={14} />
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={!dirty || saving || readOnly || loading}
            >
              {saving ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
              {saving ? t('common.saving') : t('editor.save')}
            </button>
            <button type="button" className="icon-btn editor-close" onClick={requestClose} aria-label={t('editor.close')}>
              <X size={19} />
            </button>
          </div>
        </header>

        {doc?.protected && (
          <div className="editor-note is-warning">
            <ShieldAlert size={15} />
            {t('editor.protectedNote')}
          </div>
        )}
        {readOnly && (
          <div className="editor-note">
            <ShieldAlert size={15} />
            {t('editor.readOnlyNote')}
          </div>
        )}
        {error && (
          <div className="editor-note is-error">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}

        <div className="editor-body">
          {loading && (
            <div className="editor-loading">
              <Spinner size={24} />
              <span>{t('editor.loading')}</span>
            </div>
          )}
          {!loading && loadError && (
            <div className="editor-loading is-error">
              <FileWarning size={34} />
              <h3>{t('editor.loadFailed')}</h3>
              <p>{loadError}</p>
              <button type="button" className="btn btn-secondary" onClick={requestClose}>
                {t('common.close')}
              </button>
            </div>
          )}
          {!loading && !loadError && doc && (
            <CodeMirror
              className="editor-codemirror"
              value={content}
              height="100%"
              extensions={[...languageExtension, ...themeExtension]}
              editable={!readOnly && !saving}
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLineGutter: true,
                highlightActiveLine: true,
                autocompletion: false,
                bracketMatching: true,
                closeBrackets: true,
                highlightSelectionMatches: false,
                searchKeymap: true,
              }}
              onChange={(value) => setContent(value)}
              onUpdate={(update) => {
                if (!update.selectionSet && !update.docChanged) return;
                const head = update.state.selection.main.head;
                const line = update.state.doc.lineAt(head);
                setPosition({ line: line.number, col: head - line.from + 1 });
              }}
            />
          )}
        </div>

        <footer className="editor-status">
          <span>{t('editor.position', position)}</span>
          <span className="dot-separator" />
          <span>{ENCODINGS.find((entry) => entry.id === encoding)?.label || encoding}</span>
          {doc && (
            <>
              <span className="dot-separator" />
              <span>{doc.eol}</span>
              <span className="dot-separator" />
              <span>{formatBytes(doc.size, locale)}</span>
              <span className="dot-separator" />
              <span>{formatDate(doc.mtimeMs, locale)}</span>
            </>
          )}
          <label className="editor-bom" title="Byte order mark">
            <input type="checkbox" checked={bom} onChange={(event) => setBom(event.target.checked)} />
            BOM
          </label>
          <span className="editor-status-spacer" />
          {dirty ? (
            <span className="editor-status-dirty">
              <span className="status-dot" />
              {t('editor.unsaved')}
            </span>
          ) : (
            <span>{t('editor.saved')}</span>
          )}
        </footer>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        title={t('editor.discardTitle')}
        body={t('editor.discardBody', { name: item.name })}
        confirmLabel={t('editor.discard')}
        cancelLabel={t('editor.keepEditing')}
        tone="warning"
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        onCancel={() => setDiscardOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(encodingAsk)}
        title={t('editor.encodingReloadTitle')}
        body={t('editor.encodingReloadBody')}
        confirmLabel={t('editor.encodingReload')}
        cancelLabel={t('common.cancel')}
        tone="warning"
        onConfirm={() => {
          const next = encodingAsk;
          setEncodingAsk(null);
          if (next) void load(next);
        }}
        onCancel={() => setEncodingAsk(null)}
      />

      <Dialog open={Boolean(conflict)} onClose={() => setConflict(null)} className="dialog-conflict">
        <DialogHeader
          icon={<FileWarning size={21} />}
          title={t('editor.fileChanged')}
          subtitle={t('editor.fileChangedBody')}
          tone="warning"
        />
        <DialogFooter>
          <button type="button" className="btn btn-secondary" onClick={() => setConflict(null)}>
            {t('editor.keepEditing')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setConflict(null);
              void load('auto');
            }}
          >
            {t('editor.reload')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setConflict(null);
              void save(true);
            }}
          >
            {t('editor.overwrite')}
          </button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
