import React, { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  clearLogs,
  copyLogsToClipboard,
  formatLogLine,
  formatLogsForExport,
  getDiagnosticContext,
  getLogEntries,
  logger,
  subscribeLogs,
  type LogLevel,
} from '../debug/logger';
import { useI18n } from '../i18n/I18nContext';
import { OverlayPortal } from './OverlayPortal';

interface DebugLogPanelProps {
  open: boolean;
  onClose: () => void;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export function useLogEntries() {
  return useSyncExternalStore(subscribeLogs, getLogEntries, getLogEntries);
}

export function useDiagnosticContext() {
  return useSyncExternalStore(subscribeLogs, getDiagnosticContext, getDiagnosticContext);
}

export const DebugLogPanel: React.FC<DebugLogPanelProps> = ({ open, onClose }) => {
  const { t } = useI18n();
  const titleId = useId();
  const entries = useLogEntries();
  const ctx = useDiagnosticContext();
  const [minLevel, setMinLevel] = useState<LogLevel>('DEBUG');
  const [search, setSearch] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [showRawText, setShowRawText] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const minRank = LEVEL_RANK[minLevel];
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (LEVEL_RANK[entry.level] < minRank) return false;
      if (!query) return true;
      return formatLogLine(entry).toLowerCase().includes(query);
    });
  }, [entries, minLevel, search]);

  const exportText = useMemo(() => formatLogsForExport(filtered), [filtered]);

  useEffect(() => {
    if (!open || !autoScroll || showRawText) return;
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [open, autoScroll, showRawText, filtered.length]);

  if (!open) return null;

  const handleCopy = async () => {
    const ok = await copyLogsToClipboard(exportText);
    setCopyStatus(ok ? 'copied' : 'failed');
    if (!ok) {
      setShowRawText(true);
    }
    setTimeout(() => setCopyStatus('idle'), 2500);
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `kraken-logs-${ctx.roomCode || 'no-room'}-${stamp}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logger.info('UI', 'Downloaded diagnostic log file', { entries: filtered.length });
    } catch (err) {
      logger.error('UI', 'Failed to download diagnostic log file', err);
    }
  };

  return (
    <OverlayPortal
      open={open}
      onClose={onClose}
      variant="modal"
      zIndex={95}
      panelClassName="debug-log-modal"
      ariaLabelledBy={titleId}
      testId="debug-log-modal"
    >
      <div className="crimson-ribbon" style={{ marginTop: 0 }}>
        <h3 id={titleId}>{t('debugLogsTitle')}</h3>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ minHeight: 34, padding: '0.2rem 0.6rem' }}
          onClick={onClose}
          aria-label={t('closeLabel')}
          data-testid="close-logs-btn"
        >
          ✕
        </button>
      </div>

        {/* Live connection & environment strip */}
        <div className="debug-ctx-grid">
          <span>
            <strong>{t('debugCtxRole')}:</strong> {ctx.role ?? 'none'}
          </span>
          <span>
            <strong>{t('debugCtxMode')}:</strong> {ctx.transportMode ?? '—'}
          </span>
          <span>
            <strong>{t('debugCtxState')}:</strong> {ctx.connectionState ?? '—'}
          </span>
          <span>
            <strong>{t('debugCtxRoom')}:</strong> {ctx.roomCode ?? '—'}
          </span>
          {ctx.peerId && (
            <span style={{ gridColumn: '1 / -1', wordBreak: 'break-all' }}>
              <strong>Peer ID:</strong> {ctx.peerId}
            </span>
          )}
          {ctx.error && (
            <span style={{ gridColumn: '1 / -1', color: 'var(--pirate-red)' }}>
              <strong>{t('debugCtxError')}:</strong> {ctx.error}
            </span>
          )}
        </div>

        {/* Primary Copy / Download / Raw / Clear actions */}
        <div className="debug-actions-row">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ flex: 2 }}
            onClick={() => void handleCopy()}
            data-testid="copy-logs-btn"
          >
            {copyStatus === 'copied'
              ? t('debugLogsCopied')
              : copyStatus === 'failed'
                ? t('debugLogsCopyFailed')
                : t('debugLogsCopyAll')}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleDownload}
            data-testid="download-logs-btn"
          >
            .txt
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setShowRawText((v) => !v)}
            data-testid="toggle-raw-logs-btn"
          >
            {showRawText ? t('debugLogsListView') : t('debugLogsRawView')}
          </button>
          <button
            type="button"
            className="btn btn-danger-outline btn-sm"
            onClick={clearLogs}
            data-testid="clear-logs-btn"
          >
            {t('debugLogsClear')}
          </button>
        </div>

        {/* Filter bar */}
        <div className="debug-filter-row">
          <div className="debug-level-pills">
            {(['DEBUG', 'INFO', 'WARN', 'ERROR'] as LogLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={minLevel === lvl ? 'active' : ''}
                onClick={() => setMinLevel(lvl)}
              >
                {lvl}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="debug-search-input"
            placeholder={t('debugLogsFilterPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="debug-log-search"
          />
        </div>

        <div className="row-between small-text muted" style={{ marginBottom: '0.35rem' }}>
          <span>
            {t('debugLogsCount', { shown: filtered.length, total: entries.length })}
          </span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>{t('debugLogsAutoScroll')}</span>
          </label>
        </div>

        {/* Log viewport */}
        {showRawText ? (
          <textarea
            className="debug-raw-textarea"
            readOnly
            value={exportText}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="debug-raw-textarea"
          />
        ) : (
          <div className="debug-log-list" ref={listRef} data-testid="debug-log-list">
            {filtered.length === 0 ? (
              <div className="debug-log-empty">{t('debugLogsEmpty')}</div>
            ) : (
              filtered.map((entry) => (
                <div
                  key={entry.id}
                  className={`debug-log-line level-${entry.level.toLowerCase()}`}
                >
                  {formatLogLine(entry)}
                </div>
              ))
            )}
          </div>
        )}

        <p className="small-text muted" style={{ margin: '0.45rem 0 0', fontSize: '0.75rem' }}>
          {t('debugLogsConsoleHint')}
        </p>
    </OverlayPortal>
  );
};
