import React, { useEffect, useMemo, useState } from 'react';
import { DebugLogPanel, useLogEntries } from './components/DebugLogPanel';
import { CompassIcon } from './components/icons/GameIcons';
import { PlayerAid } from './components/PlayerAid';
import { SettingsSheet } from './components/SettingsSheet';
import { logger } from './debug/logger';
import { useTheme } from './hooks/useTheme';
import { useWakeLock } from './hooks/useWakeLock';
import { useI18n } from './i18n/I18nContext';
import { useGameSession } from './net/gameSession';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';

const GearIcon: React.FC = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const App: React.FC = () => {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const session = useGameSession();
  const wakeLock = useWakeLock();
  const [standaloneAid, setStandaloneAid] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const logEntries = useLogEntries();

  const errorCount = useMemo(
    () => logEntries.filter((entry) => entry.level === 'ERROR').length,
    [logEntries]
  );

  const initialJoinCode = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('join') ?? '').toUpperCase();
  }, []);

  useEffect(() => {
    if (initialJoinCode) {
      logger.info('APP', 'Detected ?join= query parameter on load', { initialJoinCode });
    }
  }, [initialJoinCode]);

  const currentScreen = !session.view
    ? standaloneAid
      ? 'standalone_aid'
      : 'home'
    : session.view.phase === 'lobby'
      ? 'lobby'
      : session.view.phase === 'ended'
        ? 'game_over'
        : 'game';

  useEffect(() => {
    logger.info('UI', `Active screen -> ${currentScreen}`, {
      roomCode: session.view?.roomCode ?? null,
      phase: session.view?.phase ?? null,
      connectionState: session.connectionState,
    });
  }, [currentScreen, session.view?.roomCode, session.view?.phase, session.connectionState]);

  const connLabel =
    session.connectionState === 'connected'
      ? t('connConnected')
      : session.connectionState === 'connecting'
        ? t('connConnecting')
        : session.connectionState === 'reconnecting'
          ? t('connReconnecting')
          : session.connectionState === 'error'
            ? t('connError')
            : '';

  return (
    <div className="app-shell">
      {/* Slim Maritime Wood Top Bar */}
      <header className="top-bar">
        <div className="top-bar-brand">
          <CompassIcon size={28} />
          {session.view ? (
            <span
              className="conn-pill"
              title={connLabel}
              aria-label={`${session.view.roomCode} — ${connLabel}`}
              data-testid="connection-pill"
            >
              <span className={`conn-dot ${session.connectionState}`} />
              <span>{session.view.roomCode}</span>
            </span>
          ) : (
            <span className="top-bar-title">{t('appTitle')}</span>
          )}
        </div>

        <div className="top-bar-controls">
          <div className="lang-toggle" role="group" aria-label={t('langLabel')}>
            <button
              type="button"
              className={lang === 'pl' ? 'active' : ''}
              aria-pressed={lang === 'pl'}
              onClick={() => setLang('pl')}
              data-testid="lang-pl-btn"
            >
              PL
            </button>
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              aria-pressed={lang === 'en'}
              onClick={() => setLang('en')}
              data-testid="lang-en-btn"
            >
              EN
            </button>
          </div>

          <button
            type="button"
            className={`icon-pill-btn ${errorCount > 0 ? 'has-error' : ''}`}
            onClick={() => {
              logger.debug('UI', 'Opened settings sheet');
              setSettingsOpen(true);
            }}
            aria-label={t('settingsBtnLabel')}
            title={t('settingsTitle')}
            data-testid="open-settings-btn"
          >
            <GearIcon />
            {errorCount > 0 && (
              <span className="settings-error-dot" aria-hidden="true">
                {errorCount > 9 ? '9+' : errorCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Route Views */}
      {!session.view ? (
        <main className="main-content no-nav">
          {standaloneAid ? (
            <div className="screen-enter">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ marginBottom: '0.65rem' }}
                onClick={() => setStandaloneAid(false)}
                data-testid="aid-back-home-btn"
              >
                ← {t('backHome')}
              </button>
              <PlayerAid />
            </div>
          ) : (
            <HomeScreen
              connectionState={session.connectionState}
              error={session.error}
              transportMode={session.transportMode}
              savedSession={session.savedSession}
              initialJoinCode={initialJoinCode}
              onHost={(name, mode) => session.hostRoom(name, mode)}
              onJoin={(code, name) => session.joinRoom(code, name)}
              onResume={session.resumeSavedSession}
              onDiscardSaved={session.discardSavedSession}
              onOpenAid={() => setStandaloneAid(true)}
              onClearError={session.clearError}
              onOpenLogs={() => setLogsOpen(true)}
            />
          )}
        </main>
      ) : session.view.phase === 'lobby' ? (
        <main className="main-content no-nav">
          <LobbyScreen
            view={session.view}
            transportMode={session.transportMode}
            connectionState={session.connectionState}
            error={session.error}
            hostActions={session.hostActions}
            onLeave={session.leaveRoom}
            onOpenLogs={() => setLogsOpen(true)}
          />
        </main>
      ) : (
        <GameScreen
          view={session.view}
          hostActions={session.hostActions}
          playerActions={session.playerActions}
          onLeave={session.leaveRoom}
        />
      )}

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onSetTheme={setTheme}
        wakeLockSupported={wakeLock.supported}
        wakeLockActive={wakeLock.active}
        wakeLockFailed={wakeLock.failed}
        onToggleWakeLock={() => void wakeLock.toggle()}
        errorCount={errorCount}
        onOpenLogs={() => {
          logger.debug('UI', 'Opened diagnostic log panel from settings');
          setLogsOpen(true);
        }}
      />

      <DebugLogPanel open={logsOpen} onClose={() => setLogsOpen(false)} />
    </div>
  );
};
