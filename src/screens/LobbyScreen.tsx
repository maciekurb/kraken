import QRCode from 'qrcode';
import React, { useEffect, useMemo, useState } from 'react';
import { MIN_PLAYERS } from '../engine/rules';
import type { PlayerView } from '../engine/types';
import { useI18n } from '../i18n/I18nContext';
import type { HostActions } from '../net/gameSession';
import type { TransportMode } from '../net/protocol';

interface LobbyScreenProps {
  view: PlayerView;
  transportMode: TransportMode;
  hostActions: HostActions;
  onLeave: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  view,
  transportMode,
  hostActions,
  onLeave,
}) => {
  const { t } = useI18n();
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const joinUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('join', view.roomCode);
    if (transportMode === 'local') {
      url.searchParams.set('transport', 'local');
    } else {
      url.searchParams.delete('transport');
    }
    return url.toString();
  }, [transportMode, view.roomCode]);

  useEffect(() => {
    let active = true;
    QRCode.toString(joinUrl, {
      type: 'svg',
      margin: 1,
      width: 176,
      color: { dark: '#1D120C', light: '#FFFFFF' },
    })
      .then((svg) => {
        if (active) setQrSvg(svg);
      })
      .catch(() => {
        if (active) setQrSvg('');
      });
    return () => {
      active = false;
    };
  }, [joinUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const canStart = view.players.length >= MIN_PLAYERS;

  return (
    <div>
      <div className="crimson-ribbon">
        <h2>{t('lobbyTitle')}</h2>
        <span className="badge badge-captain" data-testid="lobby-room-code-badge">
          {view.roomCode}
        </span>
      </div>

      {/* Share / QR Card */}
      <div className="parchment-card brass center">
        <div className="small-text muted">{t('shareToJoin')}</div>
        <div className="room-code-hero" data-testid="lobby-room-code">
          {view.roomCode}
        </div>
        {qrSvg && (
          <div
            className="qr-frame"
            style={{ margin: '0.35rem auto 0.65rem' }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        )}
        <div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleCopy}
          >
            {copied ? t('copied') : t('copyLink')}
          </button>
        </div>
      </div>

      {/* Voyage Mode (Host selectable, Peers read-only) */}
      <div className="parchment-card">
        <div className="row-between" style={{ marginBottom: '0.45rem' }}>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.88rem' }}>
            {t('voyageModeTitle')}
          </strong>
          {!view.me.isHost && (
            <span className="badge badge-searched">
              {view.voyageMode === 'short' ? t('voyageShort') : t('voyageLong')}
            </span>
          )}
        </div>
        {view.me.isHost ? (
          <div className="pill-tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={view.voyageMode === 'short' ? 'active' : ''}
              onClick={() => hostActions.setVoyageMode('short')}
            >
              {t('voyageShort')}
            </button>
            <button
              type="button"
              className={view.voyageMode === 'long' ? 'active' : ''}
              onClick={() => hostActions.setVoyageMode('long')}
            >
              {t('voyageLong')}
            </button>
          </div>
        ) : (
          <p className="small-text muted" style={{ margin: 0 }}>
            {view.voyageMode === 'short' ? t('voyageShortHint') : t('voyageLongHint')}
          </p>
        )}
      </div>

      {/* Crew List */}
      <div className="parchment-card">
        <div className="row-between" style={{ marginBottom: '0.5rem' }}>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}>
            {t('crewListTitle', { count: view.players.length })}
          </strong>
        </div>

        {view.me.isHost && (
          <p className="small-text muted" style={{ margin: '0 0 0.6rem' }}>
            {t('seatOrderHint')}
          </p>
        )}

        <div data-testid="lobby-crew-list">
          {view.players.map((p, idx) => (
            <div key={p.id} className="crew-row" data-testid={`lobby-player-${p.name}`}>
              <div>
                <div className="row-gap">
                  <span className="muted" style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem' }}>
                    #{idx + 1}
                  </span>
                  <strong>{p.name}</strong>
                  {p.id === view.me.id && <span className="badge badge-searched">{t('youTag')}</span>}
                  {p.isHost && <span className="badge badge-captain">{t('hostTag')}</span>}
                  {!p.connected && <span className="badge badge-eliminated">{t('offlineTag')}</span>}
                </div>
              </div>
              {view.me.isHost && (
                <div className="row-gap" style={{ gap: '0.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ padding: '0.22rem 0.45rem' }}
                    disabled={idx === 0}
                    onClick={() => hostActions.movePlayerSeat(p.id, -1)}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ padding: '0.22rem 0.45rem' }}
                    disabled={idx === view.players.length - 1}
                    onClick={() => hostActions.movePlayerSeat(p.id, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  {!p.isHost && (
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      style={{ padding: '0.22rem 0.45rem' }}
                      onClick={() => hostActions.removePlayer(p.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {!canStart && (
          <div className="notice-box gold small-text" style={{ marginTop: '0.6rem' }}>
            {t('minPlayersHint')}
          </div>
        )}
      </div>

      {/* Start / Leave Actions */}
      <div className="stack-sm">
        {view.me.isHost ? (
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!canStart}
            onClick={hostActions.startGame}
            data-testid="start-voyage-btn"
          >
            {t('startVoyage')}
          </button>
        ) : (
          <div className="parchment-card center muted">{t('waitingForHost')}</div>
        )}

        <button
          type="button"
          className="btn btn-danger-outline btn-block btn-sm"
          onClick={onLeave}
          data-testid="leave-room-btn"
        >
          {t('leaveRoom')}
        </button>
      </div>
    </div>
  );
};
