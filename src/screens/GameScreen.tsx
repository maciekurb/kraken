import React, { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { logger } from '../debug/logger';
import { getMutinyThreshold, getOffDutyCount } from '../engine/rules';
import type { PlayerView, PublicEventLogEntry, PublicFactionGroup, RitualType } from '../engine/types';
import { useI18n } from '../i18n/I18nContext';
import type { HostActions, PlayerActions } from '../net/gameSession';
import {
  CabinSearchHexIcon,
  CompassIcon,
  CutTongueHexIcon,
  FeedKrakenHexIcon,
  FloggingHexIcon,
  NavCultUprisingIcon,
  RitualIcon,
  WaxSealIcon,
} from '../components/icons/GameIcons';
import { PlayerAid } from '../components/PlayerAid';
import { SecretRoleCard } from '../components/SecretRoleCard';
import { GameOverOverlay } from '../components/phases/GameOverOverlay';
import { getPublicGroupLabel, getRitualLabel, PhaseOverlays } from '../components/phases/PhaseOverlays';

interface GameScreenProps {
  view: PlayerView;
  hostActions: HostActions;
  playerActions: PlayerActions;
  onLeave: () => void;
}

type GameTab = 'secret' | 'crew' | 'aid';

type PendingConfirm =
  | { kind: 'overboard'; playerId: string; playerName: string }
  | { kind: 'end_voyage'; winner: PublicFactionGroup; reason: 'port' | 'kraken_space'; label: string }
  | { kind: 'leave' };

export const GameScreen: React.FC<GameScreenProps> = ({
  view,
  hostActions,
  playerActions,
  onLeave,
}) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<GameTab>('secret');
  const [showManualRituals, setShowManualRituals] = useState(false);
  const [endVoyageOpen, setEndVoyageOpen] = useState(false);
  const [eventLogOpen, setEventLogOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const mutinyGuns = getMutinyThreshold(view.players.length);
  const offDuty = getOffDutyCount(view.players.length);

  const formatLog = (entry: PublicEventLogEntry): string => {
    switch (entry.type) {
      case 'game_started':
        return t('logGameStarted', entry.params);
      case 'captain_changed':
        return t('logCaptainChanged', entry.params);
      case 'cabin_searched':
        return t('logCabinSearched', entry.params);
      case 'flogged':
        return t('logFlogged', {
          ...entry.params,
          notFaction: getPublicGroupLabel(entry.params.notFaction as PublicFactionGroup, t),
        });
      case 'tongue_cut':
        return t('logTongueCut', entry.params);
      case 'fed_kraken':
        return t('logFedKraken', entry.params);
      case 'jumped_overboard':
        return t('logOverboard', entry.params);
      case 'ritual_resolved':
        return t('logRitualResolved', {
          ritual: getRitualLabel(entry.params.ritual as RitualType, t),
        });
      case 'game_ended':
        return t('logGameEnded', {
          winner: getPublicGroupLabel(entry.params.winner as PublicFactionGroup, t),
        });
    }
  };

  if (view.phase === 'ended') {
    return (
      <main className="main-content no-nav">
        <GameOverOverlay view={view} hostActions={hostActions} onLeave={onLeave} />
      </main>
    );
  }

  const executeConfirm = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === 'overboard') {
      hostActions.markPlayerOverboard(pendingConfirm.playerId);
    } else if (pendingConfirm.kind === 'end_voyage') {
      hostActions.triggerGameEnd(pendingConfirm.winner, pendingConfirm.reason);
    } else if (pendingConfirm.kind === 'leave') {
      onLeave();
    }
    setPendingConfirm(null);
  };

  return (
    <>
      <main className="main-content">
        {/* Quick Rules Strip (room code lives in the top bar) */}
        <div className="quick-rules-strip">
          <span>{t('mutinyThresholdLabel', { count: mutinyGuns })}</span>
          <span>{t('offDutyCountLabel', { count: offDuty })}</span>
        </div>

        {tab === 'secret' && <SecretRoleCard view={view} />}

        {tab === 'crew' && (
          <div className="screen-enter">
            <div className="crimson-ribbon">
              <h2>{t('tabCrew')}</h2>
              <span className="small-text" style={{ color: 'var(--brass-light)' }}>
                {view.players.filter((p) => p.alive).length}/{view.players.length}
              </span>
            </div>

            {/* Host Controls Panel */}
            {view.me.isHost && (
              <div className="parchment-card brass" data-testid="host-controls-panel">
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    marginBottom: '0.65rem',
                    color: 'var(--brass-dark)',
                  }}
                >
                  {t('tableActionsTitle')}
                </div>

                {/* Current Captain Selector */}
                <div className="field" style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="captain-select">{t('currentCaptain')}</label>
                  <select
                    id="captain-select"
                    value={view.currentCaptainId ?? ''}
                    onChange={(e) => hostActions.setCurrentCaptain(e.target.value)}
                    data-testid="captain-select"
                  >
                    {view.players
                      .filter((p) => p.alive && !p.tongueCut)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Map Actions 2x2 Grid */}
                <div
                  className="small-text muted"
                  style={{ fontFamily: 'var(--font-display)', marginBottom: '0.45rem' }}
                >
                  {t('mapActionsTitle')}
                </div>
                <div className="action-grid" style={{ marginBottom: '0.9rem' }}>
                  <button
                    type="button"
                    className="action-tile"
                    disabled={Boolean(view.activePhase)}
                    onClick={() => hostActions.startCabinSearch()}
                    data-testid="trigger-cabin-search-btn"
                  >
                    <CabinSearchHexIcon size={40} />
                    <span>{t('actionCabinSearch')}</span>
                  </button>
                  <button
                    type="button"
                    className="action-tile"
                    disabled={Boolean(view.activePhase)}
                    onClick={() => hostActions.startFlogging()}
                    data-testid="trigger-flogging-btn"
                  >
                    <FloggingHexIcon size={40} />
                    <span>{t('actionFlogging')}</span>
                  </button>
                  <button
                    type="button"
                    className="action-tile"
                    disabled={Boolean(view.activePhase)}
                    onClick={() => hostActions.startCutTongue()}
                    data-testid="trigger-cut-tongue-btn"
                  >
                    <CutTongueHexIcon size={40} />
                    <span>{t('actionCutTongue')}</span>
                  </button>
                  <button
                    type="button"
                    className="action-tile"
                    disabled={Boolean(view.activePhase)}
                    onClick={() => hostActions.startFeedKraken()}
                    data-testid="trigger-feed-kraken-btn"
                  >
                    <FeedKrakenHexIcon size={40} />
                    <span>{t('actionFeedKraken')}</span>
                  </button>
                </div>

                {/* Cult Rituals Section */}
                <div
                  className="small-text muted"
                  style={{ fontFamily: 'var(--font-display)', marginBottom: '0.45rem' }}
                >
                  {t('cultRitualsTitle', { remaining: view.ritualDeckRemaining })}
                </div>
                <div className="stack-sm">
                  <button
                    type="button"
                    className="btn btn-cult btn-block"
                    disabled={Boolean(view.activePhase) || view.ritualDeckRemaining === 0}
                    onClick={hostActions.startCultRitualFromDeck}
                    data-testid="draw-ritual-btn"
                  >
                    <NavCultUprisingIcon size={24} />
                    {view.ritualDeckRemaining > 0 ? t('drawNextRitual') : t('ritualDeckEmpty')}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-block"
                    aria-expanded={showManualRituals}
                    onClick={() => setShowManualRituals((v) => !v)}
                    data-testid="toggle-manual-rituals-btn"
                  >
                    {t('orManualRitual')} {showManualRituals ? '▲' : '▼'}
                  </button>

                  {showManualRituals && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.42rem',
                      }}
                    >
                      {(['conversion', 'gun_stash', 'enlightenment'] as RitualType[]).map((rt) => (
                        <button
                          key={rt}
                          type="button"
                          className="action-tile"
                          style={{ padding: '0.55rem 0.25rem', fontSize: '0.7rem', minHeight: 74 }}
                          disabled={Boolean(view.activePhase)}
                          onClick={() => hostActions.startCultRitualManual(rt)}
                          data-testid={`manual-ritual-${rt}-btn`}
                        >
                          <RitualIcon ritual={rt} size={32} />
                          <span>{getRitualLabel(rt, t)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Crew Roster */}
            <div className="parchment-card" data-testid="crew-roster-card">
              {view.players.map((p) => {
                const isCaptain = view.currentCaptainId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`crew-row ${p.alive ? '' : 'eliminated'}`}
                    data-testid={`crew-row-${p.name}`}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row-gap" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                        <strong>{p.name}</strong>
                        {p.id === view.me.id && (
                          <span className="badge badge-searched">{t('youTag')}</span>
                        )}
                        {!p.connected && (
                          <span className="badge badge-eliminated">{t('offlineTag')}</span>
                        )}
                      </div>
                      <div className="badge-row">
                        {isCaptain && p.alive && (
                          <span className="badge badge-captain">{t('badgeCaptain')}</span>
                        )}
                        {p.cabinSearched && (
                          <span className="badge badge-searched" data-testid={`badge-searched-${p.name}`}>
                            {t('badgeCabinSearched')}
                          </span>
                        )}
                        {p.flogged && p.floggedNotFaction && (
                          <span className="badge badge-flogged" data-testid={`badge-flogged-${p.name}`}>
                            {t('badgeNotFaction', {
                              group: getPublicGroupLabel(p.floggedNotFaction, t),
                            })}
                          </span>
                        )}
                        {p.tongueCut && (
                          <span className="badge badge-tongue" data-testid={`badge-tongue-${p.name}`}>
                            {t('badgeTongueCut')}
                          </span>
                        )}
                        {!p.alive && (
                          <span className="badge badge-eliminated">
                            {p.eliminatedReason === 'kraken'
                              ? t('badgeFedKraken')
                              : t('badgeOverboard')}
                          </span>
                        )}
                      </div>
                    </div>

                    {view.me.isHost && p.alive && (
                      <div className="stack-sm" style={{ gap: '0.3rem', flexShrink: 0 }}>
                        {!isCaptain && !p.tongueCut && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '0.7rem', minHeight: 34, padding: '0.25rem 0.55rem' }}
                            onClick={() => hostActions.setCurrentCaptain(p.id)}
                          >
                            {t('badgeCaptain')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger-outline btn-sm"
                          style={{ fontSize: '0.7rem', minHeight: 34, padding: '0.25rem 0.55rem' }}
                          onClick={() =>
                            setPendingConfirm({
                              kind: 'overboard',
                              playerId: p.id,
                              playerName: p.name,
                            })
                          }
                        >
                          {t('markOverboardBtn')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Collapsible Host End Voyage Controls (guards against accidental taps) */}
            {view.me.isHost && (
              <div className="parchment-card collapsible-card">
                <button
                  type="button"
                  className="collapsible-trigger"
                  aria-expanded={endVoyageOpen}
                  onClick={() => setEndVoyageOpen((v) => !v)}
                  data-testid="toggle-end-voyage-btn"
                >
                  <span>{t('endVoyageTitle')}</span>
                  <span className="collapsible-meta" aria-hidden="true">
                    {endVoyageOpen ? '▲' : '▼'}
                  </span>
                </button>
                {endVoyageOpen && (
                  <div className="collapsible-body stack-sm">
                    <button
                      type="button"
                      className="btn btn-ocean btn-sm btn-block"
                      onClick={() =>
                        setPendingConfirm({
                          kind: 'end_voyage',
                          winner: 'sailor',
                          reason: 'port',
                          label: t('endSailorsWin'),
                        })
                      }
                      data-testid="end-sailors-win-btn"
                    >
                      {t('endSailorsWin')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-block"
                      onClick={() =>
                        setPendingConfirm({
                          kind: 'end_voyage',
                          winner: 'pirate',
                          reason: 'port',
                          label: t('endPiratesWin'),
                        })
                      }
                      data-testid="end-pirates-win-btn"
                    >
                      {t('endPiratesWin')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-cult btn-sm btn-block"
                      onClick={() =>
                        setPendingConfirm({
                          kind: 'end_voyage',
                          winner: 'cult',
                          reason: 'kraken_space',
                          label: t('endCultWin'),
                        })
                      }
                      data-testid="end-cult-win-btn"
                    >
                      {t('endCultWin')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Collapsible Captain's Public Log */}
            {view.publicLog.length > 0 && (
              <div className="parchment-card collapsible-card">
                <button
                  type="button"
                  className="collapsible-trigger"
                  aria-expanded={eventLogOpen}
                  onClick={() => setEventLogOpen((v) => !v)}
                  data-testid="toggle-event-log-btn"
                >
                  <span>{t('eventLogTitle')}</span>
                  <span className="collapsible-meta">
                    <span>{t('showLogCount', { count: view.publicLog.length })}</span>
                    <span aria-hidden="true">{eventLogOpen ? '▲' : '▼'}</span>
                  </span>
                </button>
                {eventLogOpen && (
                  <div className="collapsible-body stack-sm">
                    {view.publicLog.slice(0, 15).map((entry) => (
                      <div
                        key={entry.id}
                        className="small-text"
                        style={{
                          borderBottom: '1px solid var(--parchment-deep)',
                          paddingBottom: '0.38rem',
                        }}
                      >
                        {formatLog(entry)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="btn btn-danger-outline btn-sm btn-block"
              onClick={() => setPendingConfirm({ kind: 'leave' })}
              data-testid="leave-game-btn"
            >
              {t('leaveRoom')}
            </button>
          </div>
        )}

        {tab === 'aid' && (
          <PlayerAid
            activePlayerCount={view.players.length}
            defaultVoyageMode={view.voyageMode}
          />
        )}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="bottom-nav" aria-label="Game navigation" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'secret'}
          className={tab === 'secret' ? 'active' : ''}
          onClick={() => {
            logger.debug('UI', 'GameScreen tab -> secret');
            setTab('secret');
          }}
          data-testid="nav-tab-secret"
        >
          <WaxSealIcon size={20} />
          <span>{t('tabSecret')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'crew'}
          className={tab === 'crew' ? 'active' : ''}
          onClick={() => {
            logger.debug('UI', 'GameScreen tab -> crew');
            setTab('crew');
          }}
          data-testid="nav-tab-crew"
        >
          <NavCultUprisingIcon size={20} />
          <span>{t('tabCrew')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'aid'}
          className={tab === 'aid' ? 'active' : ''}
          onClick={() => {
            logger.debug('UI', 'GameScreen tab -> aid');
            setTab('aid');
          }}
          data-testid="nav-tab-aid"
        >
          <CompassIcon size={20} />
          <span>{t('tabAid')}</span>
        </button>
      </nav>

      {/* Active Synced P2P Phase Overlays (portaled to document.body) */}
      <PhaseOverlays
        view={view}
        hostActions={hostActions}
        playerActions={playerActions}
      />

      {/* Styled In-App Confirmation Dialog for Destructive Actions */}
      <ConfirmDialog
        open={Boolean(pendingConfirm)}
        title={
          pendingConfirm?.kind === 'overboard'
            ? t('confirmOverboardTitle')
            : pendingConfirm?.kind === 'end_voyage'
              ? t('confirmEndVoyageTitle')
              : t('confirmLeaveTitle')
        }
        description={
          pendingConfirm?.kind === 'overboard'
            ? t('markOverboardConfirm', { name: pendingConfirm.playerName })
            : pendingConfirm?.kind === 'end_voyage'
              ? t('confirmEndVoyageDesc', { winner: pendingConfirm.label })
              : view.me.isHost
                ? t('confirmLeaveHostDesc')
                : t('confirmLeaveDesc')
        }
        confirmLabel={
          pendingConfirm?.kind === 'overboard'
            ? t('confirmOverboardBtn')
            : pendingConfirm?.kind === 'end_voyage'
              ? t('confirmEndVoyageBtn')
              : t('confirmLeaveBtn')
        }
        tone={
          pendingConfirm?.kind === 'end_voyage'
            ? pendingConfirm.winner === 'sailor'
              ? 'ocean'
              : pendingConfirm.winner === 'cult'
                ? 'cult'
                : 'primary'
            : 'danger'
        }
        onConfirm={executeConfirm}
        onCancel={() => setPendingConfirm(null)}
        testId="game-confirm-dialog"
      />
    </>
  );
};
