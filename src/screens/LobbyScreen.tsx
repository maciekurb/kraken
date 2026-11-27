import QRCode from 'qrcode';
import React, { useEffect, useId, useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { OverlayPortal } from '../components/OverlayPortal';
import { logger } from '../debug/logger';
import { MIN_PLAYERS } from '../engine/rules';
import type { PlayerView } from '../engine/types';
import { useI18n } from '../i18n/I18nContext';
import type { HostActions } from '../net/gameSession';
import type { ConnectionState, TransportMode } from '../net/protocol';

interface LobbyScreenProps {
  view: PlayerView;
  transportMode: TransportMode;
  connectionState: ConnectionState;
  error: string | null;
  hostActions: HostActions;
  onLeave: () => void;
  onOpenLogs: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  view,
  transportMode,
  connectionState,
  error,
  hostActions,
  onLeave,
  onOpenLogs,
}) => {
  const { t } = useI18n();
  const qrTitleId = useId();
  const [qrSvg, setQrSvg] = useState<string>('');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

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
        if (active) {
          setQrSvg(svg);
          logger.debug('UI', 'Lobby QR code generated', { roomCode: view.roomCode, joinUrl });
        }
      })
      .catch((err) => {
        logger.warn('UI', 'Lobby QR code generation failed', err);
        if (active) setQrSvg('');
      });
    return () => {
      active = false;
    };
  }, [joinUrl, view.roomCode]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      logger.info('UI', 'Copied invite link to clipboard', { joinUrl });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.warn('UI', 'Failed to copy invite link to clipboard', err);
    }
  };

  const handleShare = async () => {
    if (!canShare) return;
    try {
      await navigator.share({
        title: `${t('appTitle')} — ${view.roomCode}`,
        text: `${t('shareToJoin')}: ${view.roomCode}`,
        url: joinUrl,
      });
      logger.info('UI', 'Shared invite link via Web Share API', { roomCode: view.roomCode });
    } catch (err) {
      // User cancelling native share sheet is expected
      if ((err as { name?: string })?.name !== 'AbortError') {
        logger.warn('UI', 'Web Share failed', err);
      }
    }
  };

  const playerCount = view.players.length;
  const canStart = playerCount >= MIN_PLAYERS;
  const needed = Math.max(0, MIN_PLAYERS - playerCount);
  const readinessPct = Math.min(100, Math.round((playerCount / MIN_PLAYERS) * 100));

  return (
    <div className="screen-enter">
      <div className="crimson-ribbon">
        <h2>{t('lobbyTitle')}</h2>
        <span className="badge badge-captain" data-testid="lobby-room-code-badge">
          {view.roomCode}
        </span>
      </div>

      {error && (
        <div className="notice-box" role="alert" data-testid="lobby-error">
          <div>
            {t('errGeneric')} ({error})
          </div>
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

      {!error && connectionState !== 'connected' && (
        <div className="notice-box gold small-text" role="status" data-testid="lobby-conn-status">
          {connectionState === 'reconnecting' ? t('connReconnecting') : t('connConnecting')}
        </div>
      )}

      {/* Share / QR Card */}
      <div className="parchment-card brass center">
        <div className="small-text muted">{t('shareToJoin')}</div>
        <div className="room-code-hero" data-testid="lobby-room-code">
          {view.roomCode}
        </div>
        {qrSvg && (
          <div>
            <button
              type="button"
              className="qr-frame"
              style={{ margin: '0.35rem auto 0.75rem' }}
              onClick={() => setQrModalOpen(true)}
              aria-label={t('enlargeQr')}
              title={t('enlargeQr')}
              data-testid="lobby-qr-enlarge-btn"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>
        )}
        <div className="row-wrap">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void handleCopy()}
            data-testid="copy-invite-btn"
          >
            {copied ? `✓ ${t('copied')}` : t('copyLink')}
          </button>
          {canShare && (
            <button
              type="button"
              className="btn btn-gold btn-sm"
              onClick={() => void handleShare()}
              data-testid="share-invite-btn"
            >
              {t('shareInvite')}
            </button>
          )}
          {qrSvg && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setQrModalOpen(true)}
            >
              {t('enlargeQr')}
            </button>
          )}
        </div>
      </div>

      {/* Voyage Mode (Host selectable, Peers read-only) */}
      <div className="parchment-card">
        <div className="row-between" style={{ marginBottom: '0.5rem' }}>
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
          <div className="pill-tabs" style={{ marginBottom: 0 }} role="radiogroup" aria-label={t('voyageModeTitle')}>
            <button
              type="button"
              role="radio"
              aria-checked={view.voyageMode === 'short'}
              className={view.voyageMode === 'short' ? 'active' : ''}
              onClick={() => hostActions.setVoyageMode('short')}
            >
              {t('voyageShort')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view.voyageMode === 'long'}
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
        <div className="row-between" style={{ marginBottom: '0.45rem' }}>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}>
            {t('crewListTitle', { count: playerCount })}
          </strong>
        </div>

        {/* Crew Readiness Progress */}
        <div className="readiness-bar-wrap">
          <div className="small-text muted">
            {canStart
              ? t('crewReadinessReady', { count: playerCount })
              : t('crewReadinessNeed', { count: needed })}
          </div>
          <div
            className="readiness-track"
            role="progressbar"
            aria-valuenow={playerCount}
            aria-valuemin={0}
            aria-valuemax={MIN_PLAYERS}
          >
            <div
              className={`readiness-fill ${canStart ? 'ready' : ''}`}
              style={{ width: `${readinessPct}%` }}
            />
          </div>
        </div>

        {view.me.isHost && (
          <p className="small-text muted" style={{ margin: '0 0 0.65rem' }}>
            {t('seatOrderHint')}
          </p>
        )}

        <div data-testid="lobby-crew-list">
          {view.players.map((p, idx) => (
            <div key={p.id} className="crew-row" data-testid={`lobby-player-${p.name}`}>
              <div style={{ minWidth: 0 }}>
                <div className="row-gap" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
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
                <div className="row-gap" style={{ gap: '0.28rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-icon-sq"
                    disabled={idx === 0}
                    onClick={() => hostActions.movePlayerSeat(p.id, -1)}
                    aria-label={t('moveSeatUp', { name: p.name })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-icon-sq"
                    disabled={idx === view.players.length - 1}
                    onClick={() => hostActions.movePlayerSeat(p.id, 1)}
                    aria-label={t('moveSeatDown', { name: p.name })}
                  >
                    ↓
                  </button>
                  {!p.isHost && (
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-icon-sq"
                      onClick={() => hostActions.removePlayer(p.id)}
                      aria-label={t('removePlayerLabel', { name: p.name })}
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
          <div className="notice-box gold small-text" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
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
          onClick={() => setLeaveConfirmOpen(true)}
          data-testid="leave-room-btn"
        >
          {t('leaveRoom')}
        </button>
      </div>

      {/* Tap-to-enlarge Fullscreen QR Modal */}
      <OverlayPortal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        variant="modal"
        zIndex={82}
        ariaLabelledBy={qrTitleId}
        testId="lobby-qr-modal"
      >
        <div className="crimson-ribbon" style={{ marginTop: 0 }}>
          <h3 id={qrTitleId}>{t('qrModalTitle')}</h3>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ minHeight: 34, padding: '0.2rem 0.6rem' }}
            onClick={() => setQrModalOpen(false)}
            aria-label={t('closeLabel')}
          >
            ✕
          </button>
        </div>
        <div className="center">
          <div className="room-code-hero" style={{ fontSize: '2.6rem', marginBottom: '0.5rem' }}>
            {view.roomCode}
          </div>
          {qrSvg && (
            <div
              className="qr-frame-large"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}
          <p className="small-text muted" style={{ margin: '0.85rem 0 0.9rem' }}>
            {t('qrModalHint')}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => setQrModalOpen(false)}
          >
            {t('closeLabel')}
          </button>
        </div>
      </OverlayPortal>

      <ConfirmDialog
        open={leaveConfirmOpen}
        title={t('confirmLeaveTitle')}
        description={view.me.isHost ? t('confirmLeaveHostDesc') : t('confirmLeaveDesc')}
        confirmLabel={t('confirmLeaveBtn')}
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          onLeave();
        }}
        onCancel={() => setLeaveConfirmOpen(false)}
        testId="confirm-leave-lobby"
      />
    </div>
  );
};
