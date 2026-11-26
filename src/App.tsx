import React, { useMemo, useState } from 'react';
import { CompassIcon } from './components/icons/GameIcons';
import { PlayerAid } from './components/PlayerAid';
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

  const initialJoinCode = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('join') ?? '').toUpperCase();
  }, []);

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
            />
          )}
        </main>
      ) : session.view.phase === 'lobby' ? (
        <main className="main-content no-nav">
          <LobbyScreen
            view={session.view}
            transportMode={session.transportMode}
            hostActions={session.hostActions}
            onLeave={session.leaveRoom}
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
    </div>
  );
};
