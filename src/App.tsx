import React, { useEffect, useMemo, useState } from 'react';
import { DebugLogPanel, useLogEntries } from './components/DebugLogPanel';
import { CompassIcon } from './components/icons/GameIcons';
import { PlayerAid } from './components/PlayerAid';
import { logger } from './debug/logger';
import { useWakeLock } from './hooks/useWakeLock';
import { useI18n } from './i18n/I18nContext';
import { useGameSession } from './net/gameSession';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';

export const App: React.FC = () => {
  const { lang, setLang, t } = useI18n();
  const session = useGameSession();
  const wakeLock = useWakeLock();
  const [standaloneAid, setStandaloneAid] = useState(false);
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
      {/* Top Wood-Plank Bar */}
      <header className="top-bar">
        <div className="top-bar-brand">
          <CompassIcon size={26} />
          <span className="top-bar-title">{t('appTitle')}</span>
        </div>

        <div className="top-bar-controls">
          {session.view && (
            <span className="conn-pill" title={connLabel} data-testid="connection-pill">
              <span className={`conn-dot ${session.connectionState}`} />
              <span>{session.view.roomCode}</span>
            </span>
          )}

          {wakeLock.supported && session.view && (
            <button
              type="button"
              className="conn-pill"
              style={{ cursor: 'pointer' }}
              onClick={wakeLock.toggle}
              title={wakeLock.active ? t('wakeLockOn') : t('wakeLockOff')}
            >
              {wakeLock.active ? '☀' : '☾'}
            </button>
          )}

          <button
            type="button"
            className={`conn-pill log-pill-btn ${errorCount > 0 ? 'has-error' : ''}`}
            onClick={() => {
              logger.debug('UI', 'Opened diagnostic log panel');
              setLogsOpen(true);
            }}
            title={t('debugLogsTitle')}
            data-testid="open-logs-btn"
          >
            <span>{t('debugLogsBtn')}</span>
            {errorCount > 0 && <span className="log-error-badge">{errorCount}</span>}
          </button>

          <div className="lang-toggle" role="group" aria-label={t('langLabel')}>
            <button
              type="button"
              className={lang === 'pl' ? 'active' : ''}
              onClick={() => setLang('pl')}
              data-testid="lang-pl-btn"
            >
              PL
            </button>
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              onClick={() => setLang('en')}
              data-testid="lang-en-btn"
            >
              EN
            </button>
          </div>
        </div>
      </header>

      {/* Route Views */}
      {!session.view ? (
        <main className="main-content no-nav">
          {standaloneAid ? (
            <div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ marginBottom: '0.6rem' }}
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

      <DebugLogPanel open={logsOpen} onClose={() => setLogsOpen(false)} />
    </div>
  );
};
