import React, { useState } from 'react';
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

export const GameScreen: React.FC<GameScreenProps> = ({
  view,
  hostActions,
  playerActions,
  onLeave,
}) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<GameTab>('secret');
  const [showManualRituals, setShowManualRituals] = useState(false);

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
      <div className="main-content no-nav">
        <GameOverOverlay view={view} hostActions={hostActions} onLeave={onLeave} />
      </div>
    );
  }

  return (
    <>
      <div className="main-content">
        {/* Quick Rules Strip */}
        <div
          className="row-between small-text"
          style={{
            background: 'rgba(50, 31, 20, 0.08)',
            border: '1px solid var(--parchment-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.35rem 0.65rem',
            marginBottom: '0.65rem',
            fontFamily: 'var(--font-display)',
            fontSize: '0.73rem',
          }}
        >
          <span>{t('mutinyThresholdLabel', { count: mutinyGuns })}</span>
          <span>{t('offDutyCountLabel', { count: offDuty })}</span>
          <span>{view.roomCode}</span>
        </div>

        {tab === 'secret' && <SecretRoleCard view={view} />}

        {tab === 'crew' && (
          <div>
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
                    color: 'var(--crimson-banner)',
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
                  style={{ fontFamily: 'var(--font-display)', marginBottom: '0.4rem' }}
                >
                  {t('mapActionsTitle')}
                </div>
                <div className="action-grid" style={{ marginBottom: '0.85rem' }}>
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
                  style={{ fontFamily: 'var(--font-display)', marginBottom: '0.4rem' }}
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
                        gap: '0.4rem',
                      }}
                    >
                      {(['conversion', 'gun_stash', 'enlightenment'] as RitualType[]).map((rt) => (
                        <button
                          key={rt}
                          type="button"
                          className="action-tile"
                          style={{ padding: '0.5rem 0.25rem', fontSize: '0.7rem' }}
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
                      <div className="row-gap">
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
                      <div className="stack-sm" style={{ gap: '0.25rem' }}>
                        {!isCaptain && !p.tongueCut && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '0.68rem', padding: '0.22rem 0.45rem' }}
                            onClick={() => hostActions.setCurrentCaptain(p.id)}
                          >
                            {t('badgeCaptain')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger-outline btn-sm"
                          style={{ fontSize: '0.68rem', padding: '0.22rem 0.45rem' }}
                          onClick={() => {
                            if (window.confirm(t('markOverboardConfirm', { name: p.name }))) {
                              hostActions.markPlayerOverboard(p.id);
                            }
                          }}
                        >
                          {t('markOverboardBtn')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Host End Voyage Controls */}
            {view.me.isHost && (
              <div className="parchment-card">
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  {t('endVoyageTitle')}
                </div>
                <div className="stack-sm">
                  <button
                    type="button"
                    className="btn btn-ocean btn-sm btn-block"
                    onClick={() => hostActions.triggerGameEnd('sailor', 'port')}
                    data-testid="end-sailors-win-btn"
                  >
                    {t('endSailorsWin')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm btn-block"
                    onClick={() => hostActions.triggerGameEnd('pirate', 'port')}
                    data-testid="end-pirates-win-btn"
                  >
                    {t('endPiratesWin')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-cult btn-sm btn-block"
                    onClick={() => hostActions.triggerGameEnd('cult', 'kraken_space')}
                    data-testid="end-cult-win-btn"
                  >
                    {t('endCultWin')}
                  </button>
                </div>
              </div>
            )}

            {/* Captain's Public Log */}
            {view.publicLog.length > 0 && (
              <div className="parchment-card">
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    marginBottom: '0.45rem',
                  }}
                >
                  {t('eventLogTitle')}
                </div>
                <div className="stack-sm">
                  {view.publicLog.slice(0, 12).map((entry) => (
                    <div
                      key={entry.id}
                      className="small-text"
                      style={{
                        borderBottom: '1px solid var(--parchment-deep)',
                        paddingBottom: '0.35rem',
                      }}
                    >
                      {formatLog(entry)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-danger-outline btn-sm btn-block"
              onClick={onLeave}
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
      </div>

      {/* Bottom Tab Bar */}
      <nav className="bottom-nav" aria-label="Game navigation">
        <button
          type="button"
          className={tab === 'secret' ? 'active' : ''}
          onClick={() => setTab('secret')}
          data-testid="nav-tab-secret"
        >
          <WaxSealIcon size={20} />
          <span>{t('tabSecret')}</span>
        </button>
        <button
          type="button"
          className={tab === 'crew' ? 'active' : ''}
          onClick={() => setTab('crew')}
          data-testid="nav-tab-crew"
        >
          <NavCultUprisingIcon size={20} />
          <span>{t('tabCrew')}</span>
        </button>
        <button
          type="button"
          className={tab === 'aid' ? 'active' : ''}
          onClick={() => setTab('aid')}
          data-testid="nav-tab-aid"
        >
          <CompassIcon size={20} />
          <span>{t('tabAid')}</span>
        </button>
      </nav>

      {/* Active Synced P2P Phase Overlays */}
      <PhaseOverlays
        view={view}
        hostActions={hostActions}
        playerActions={playerActions}
      />
    </>
  );
};
