import React, { useId } from 'react';
import type { ThemeMode } from '../hooks/useTheme';
import { useI18n } from '../i18n/I18nContext';
import { OverlayPortal } from './OverlayPortal';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  wakeLockSupported: boolean;
  wakeLockActive: boolean;
  wakeLockFailed: boolean;
  onToggleWakeLock: () => void;
  errorCount: number;
  onOpenLogs: () => void;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({
  open,
  onClose,
  theme,
  onSetTheme,
  wakeLockSupported,
  wakeLockActive,
  wakeLockFailed,
  onToggleWakeLock,
  errorCount,
  onOpenLogs,
}) => {
  const { t } = useI18n();
  const titleId = useId();

  return (
    <OverlayPortal
      open={open}
      onClose={onClose}
      variant="sheet"
      zIndex={80}
      ariaLabelledBy={titleId}
      testId="settings-sheet"
    >
      <div className="crimson-ribbon" style={{ marginTop: 0 }}>
        <h3 id={titleId}>{t('settingsTitle')}</h3>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ minHeight: 34, padding: '0.2rem 0.6rem' }}
          onClick={onClose}
          aria-label={t('closeLabel')}
          data-testid="close-settings-btn"
        >
          ✕
        </button>
      </div>

      {/* Tabletop Theme Picker */}
      <div className="settings-section">
        <div className="settings-section-title">{t('themeLabel')}</div>
        <div className="theme-picker-grid" role="radiogroup" aria-label={t('themeLabel')}>
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'light'}
            className={`theme-option-btn ${theme === 'light' ? 'active' : ''}`}
            onClick={() => onSetTheme('light')}
            data-testid="theme-light-btn"
          >
            <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.84rem' }}>
              ☀ {t('themeLight')}
            </strong>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {t('themeLightHint')}
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={theme === 'dark'}
            className={`theme-option-btn ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => onSetTheme('dark')}
            data-testid="theme-dark-btn"
          >
            <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.84rem' }}>
              🕯 {t('themeDark')}
            </strong>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {t('themeDarkHint')}
            </span>
          </button>
        </div>
      </div>

      {/* Screen Wake Lock */}
      <button
        type="button"
        role="switch"
        aria-checked={wakeLockActive}
        className={`settings-row-btn ${wakeLockActive ? 'is-active' : ''}`}
        disabled={!wakeLockSupported}
        onClick={onToggleWakeLock}
        data-testid="settings-wakelock-btn"
      >
        <div className="settings-row-content">
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.86rem' }}>
            {wakeLockActive ? '☀' : '☾'} {t('wakeLockTitle')}
          </div>
          <div
            className={wakeLockFailed ? 'settings-row-error' : 'muted'}
            style={{ fontSize: '0.8rem' }}
          >
            {!wakeLockSupported
              ? t('wakeLockUnsupported')
              : wakeLockFailed
                ? t('wakeLockFailed')
                : t('wakeLockDesc')}
          </div>
        </div>
        <div className="settings-toggle-wrap">
          <span
            className={`settings-toggle-state ${wakeLockActive ? 'is-on' : ''}`}
            data-testid="settings-wakelock-state"
          >
            {wakeLockSupported ? (wakeLockActive ? 'ON' : 'OFF') : '—'}
          </span>
          <span
            className={`toggle-switch ${wakeLockActive ? 'is-on' : ''}`}
            aria-hidden="true"
          >
            <span className="toggle-switch-thumb" />
          </span>
        </div>
      </button>

      {/* Diagnostic Logs */}
      <button
        type="button"
        className="settings-row-btn"
        style={{ marginBottom: 0 }}
        onClick={() => {
          onClose();
          onOpenLogs();
        }}
        data-testid="open-logs-btn"
      >
        <div className="settings-row-content">
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.86rem' }}>
            {t('diagnosticsTitle')}
          </div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {t('diagnosticsDesc')}
          </div>
        </div>
        <div className="row-gap" style={{ gap: '0.35rem', flexShrink: 0 }}>
          {errorCount > 0 && <span className="log-error-badge">{errorCount}</span>}
          <span className="muted" aria-hidden="true">→</span>
        </div>
      </button>
    </OverlayPortal>
  );
};
