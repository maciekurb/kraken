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
        className="settings-row-btn"
        disabled={!wakeLockSupported}
        onClick={onToggleWakeLock}
        aria-pressed={wakeLockActive}
        data-testid="settings-wakelock-btn"
      >
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.86rem' }}>
            {wakeLockActive ? '☀' : '☾'} {t('wakeLockTitle')}
          </div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {wakeLockSupported ? t('wakeLockDesc') : t('wakeLockUnsupported')}
          </div>
        </div>
        <span className={`badge ${wakeLockActive ? 'badge-captain' : 'badge-eliminated'}`}>
          {wakeLockSupported ? (wakeLockActive ? 'ON' : 'OFF') : '—'}
        </span>
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
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.86rem' }}>
            {t('diagnosticsTitle')}
          </div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {t('diagnosticsDesc')}
          </div>
        </div>
        <div className="row-gap" style={{ gap: '0.35rem' }}>
          {errorCount > 0 && <span className="log-error-badge">{errorCount}</span>}
          <span className="muted" aria-hidden="true">→</span>
        </div>
      </button>
    </OverlayPortal>
  );
};
