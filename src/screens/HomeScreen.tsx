import React, { useEffect, useState } from 'react';
import { logger } from '../debug/logger';
import type { VoyageMode } from '../engine/types';
import { useI18n } from '../i18n/I18nContext';
import type { ConnectionState, TransportMode } from '../net/protocol';
import { loadLastPlayerName, type SavedSession } from '../net/sessionStore';
import { CompassIcon, CultLeaderIcon, PirateIcon, SailorIcon } from '../components/icons/GameIcons';

interface HomeScreenProps {
  connectionState: ConnectionState;
  error: string | null;
  transportMode: TransportMode;
  savedSession: SavedSession | null;
  initialJoinCode: string;
  onHost: (name: string, voyageMode: VoyageMode) => void;
  onJoin: (roomCode: string, name: string) => void;
  onResume: () => void;
  onDiscardSaved: () => void;
  onOpenAid: () => void;
  onClearError: () => void;
  onOpenLogs: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  connectionState,
  error,
  transportMode,
  savedSession,
  initialJoinCode,
  onHost,
  onJoin,
  onResume,
  onDiscardSaved,
  onOpenAid,
  onClearError,
  onOpenLogs,
}) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<'host' | 'join'>(initialJoinCode ? 'join' : 'host');
  const [name, setName] = useState<string>(() => loadLastPlayerName());
  const [roomCode, setRoomCode] = useState<string>(initialJoinCode);
  const [voyageMode, setVoyageMode] = useState<VoyageMode>('short');

  useEffect(() => {
    if (initialJoinCode) {
      setMode('join');
      setRoomCode(initialJoinCode);
    }
  }, [initialJoinCode]);

  const errorMessage = error
    ? error === 'room_not_found'
      ? t('errRoomNotFound')
      : error === 'room_full'
        ? t('errRoomFull')
        : error === 'game_in_progress'
          ? t('errGameInProgress')
          : error === 'room_closed'
            ? t('errRoomClosed')
            : `${t('errGeneric')} (${error})`
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClearError();
    if (!name.trim()) {
      logger.warn('UI', 'HomeScreen form submit ignored: empty player name', { mode });
      return;
    }
    if (mode === 'host') {
      logger.info('UI', 'User submitted Host Room form', {
        name: name.trim(),
        voyageMode,
        transportMode,
      });
      onHost(name.trim(), voyageMode);
    } else {
      if (!roomCode.trim()) {
        logger.warn('UI', 'HomeScreen join submit ignored: empty room code');
        return;
      }
      logger.info('UI', 'User submitted Join Room form', {
        roomCode: roomCode.trim(),
        name: name.trim(),
        transportMode,
      });
      onJoin(roomCode.trim(), name.trim());
    }
  };

  return (
    <div>
      {/* Hero Banner */}
      <div
        className="parchment-card brass center"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(201,155,59,0.22) 0%, transparent 70%), var(--parchment-card)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.65rem',
            marginBottom: '0.45rem',
          }}
        >
          <SailorIcon size={40} />
          <CultLeaderIcon size={54} />
          <PirateIcon size={40} />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-pirate)',
            fontSize: '2.15rem',
            letterSpacing: '0.03em',
            color: 'var(--crimson-banner)',
            margin: '0 0 0.15rem',
            lineHeight: 1.08,
          }}
        >
          {t('appTitle')}
        </h1>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.82rem',
            fontWeight: 700,
            color: 'var(--brass-dark)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '0.35rem',
          }}
        >
          {t('appSubtitle')}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {t('tagline')}
        </p>
      </div>

      {transportMode === 'local' && (
        <div className="notice-box ocean small-text">{t('localModeBanner')}</div>
      )}

      {errorMessage && (
        <div className="notice-box" role="alert" data-testid="home-error">
          <div>{errorMessage}</div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ marginTop: '0.45rem' }}
            onClick={onOpenLogs}
          >
            {t('openLogsInline')}
          </button>
        </div>
      )}

      {!errorMessage && connectionState === 'reconnecting' && (
        <div className="notice-box gold small-text" role="status" data-testid="home-reconnecting">
          <div>{t('reconnectingBanner')}</div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ marginTop: '0.45rem' }}
            onClick={onOpenLogs}
          >
            {t('openLogsInline')}
          </button>
        </div>
      )}

      {savedSession && (
        <div className="parchment-card brass" data-testid="resume-session-card">
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.25rem' }}>
            {t('resumeTitle')}
          </div>
          <p className="small-text" style={{ margin: '0 0 0.65rem' }}>
            {t('resumeDesc', {
              code: savedSession.roomCode,
              name: savedSession.playerName,
              role: savedSession.role === 'host' ? t('roleHost') : t('roleCrew'),
            })}
          </p>
          <div className="row-gap">
            <button
              type="button"
              className="btn btn-gold"
              style={{ flex: 1 }}
              onClick={onResume}
              data-testid="resume-session-btn"
            >
              {t('resumeBtn')}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onDiscardSaved}
            >
              {t('discardBtn')}
            </button>
          </div>
        </div>
      )}

      {/* Host / Join Switcher */}
      <div className="parchment-card">
        <div className="pill-tabs">
          <button
            type="button"
            className={mode === 'host' ? 'active' : ''}
            onClick={() => {
              setMode('host');
              onClearError();
            }}
            data-testid="mode-host-tab"
          >
            {t('hostGame')}
          </button>
          <button
            type="button"
            className={mode === 'join' ? 'active' : ''}
            onClick={() => {
              setMode('join');
              onClearError();
            }}
            data-testid="mode-join-tab"
          >
            {t('joinGame')}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="player-name-input">{t('yourName')}</label>
            <input
              id="player-name-input"
              type="text"
              maxLength={24}
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="player-name-input"
            />
          </div>

          {mode === 'join' ? (
            <div className="field">
              <label htmlFor="room-code-input">{t('roomCode')}</label>
              <input
                id="room-code-input"
                type="text"
                maxLength={8}
                className="room-code-input"
                placeholder={t('roomCodePlaceholder')}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                required
                data-testid="room-code-input"
              />
            </div>
          ) : (
            <div className="field">
              <label>{t('voyageModeTitle')}</label>
              <div className="action-grid">
                <button
                  type="button"
                  className={`action-tile ${voyageMode === 'short' ? 'selected' : ''}`}
                  style={
                    voyageMode === 'short'
                      ? { borderColor: 'var(--crimson-banner)', borderWidth: 2 }
                      : undefined
                  }
                  onClick={() => setVoyageMode('short')}
                >
                  <span>{t('voyageShort')}</span>
                  <span className="muted" style={{ fontSize: '0.72rem', fontFamily: 'var(--font-body)', fontWeight: 400 }}>
                    {t('voyageShortHint')}
                  </span>
                </button>
                <button
                  type="button"
                  className={`action-tile ${voyageMode === 'long' ? 'selected' : ''}`}
                  style={
                    voyageMode === 'long'
                      ? { borderColor: 'var(--crimson-banner)', borderWidth: 2 }
                      : undefined
                  }
                  onClick={() => setVoyageMode('long')}
                >
                  <span>{t('voyageLong')}</span>
                  <span className="muted" style={{ fontSize: '0.72rem', fontFamily: 'var(--font-body)', fontWeight: 400 }}>
                    {t('voyageLongHint')}
                  </span>
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={
              connectionState === 'connecting' ||
              !name.trim() ||
              (mode === 'join' && !roomCode.trim())
            }
            data-testid={mode === 'host' ? 'create-room-btn' : 'join-room-btn'}
          >
            {connectionState === 'connecting'
              ? t('connConnecting')
              : mode === 'host'
                ? t('createRoomBtn')
                : t('joinRoomBtn')}
          </button>
        </form>
      </div>

      {/* Offline Player Aid Shortcut */}
      <button
        type="button"
        className="btn btn-outline btn-block"
        onClick={onOpenAid}
        data-testid="open-offline-aid-btn"
      >
        <CompassIcon size={22} />
        {t('openPlayerAid')}
      </button>
    </div>
  );
};
