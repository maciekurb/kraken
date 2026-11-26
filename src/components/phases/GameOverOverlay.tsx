import React from 'react';
import type { PlayerView } from '../../engine/types';
import { useI18n } from '../../i18n/I18nContext';
import type { HostActions } from '../../net/gameSession';
import { CultLeaderIcon, FactionIcon, PirateIcon, SailorIcon } from '../icons/GameIcons';
import { getFactionLabel } from '../SecretRoleCard';

interface GameOverOverlayProps {
  view: PlayerView;
  hostActions: HostActions;
  onLeave: () => void;
}

export const GameOverOverlay: React.FC<GameOverOverlayProps> = ({
  view,
  hostActions,
  onLeave,
}) => {
  const { t } = useI18n();
  if (view.phase !== 'ended' || !view.winner) return null;

  const { faction, reason } = view.winner;

  const title =
    faction === 'sailor'
      ? t('winnerSailors')
      : faction === 'pirate'
        ? t('winnerPirates')
        : t('winnerCult');

  const subtitle =
    reason === 'cult_leader_fed'
      ? t('winReasonCultLeaderFed')
      : reason === 'kraken_space'
        ? t('winReasonKrakenSpace')
        : faction === 'sailor'
          ? t('winReasonPortSailors')
          : t('winReasonPortPirates');

  return (
    <div data-testid="game-over-screen">
      <div className="crimson-ribbon">
        <h2>{t('gameOverTitle')}</h2>
      </div>

      <div className="parchment-card brass center">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
          {faction === 'sailor' ? (
            <SailorIcon size={82} />
          ) : faction === 'pirate' ? (
            <PirateIcon size={82} />
          ) : (
            <CultLeaderIcon size={82} />
          )}
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-pirate)',
            fontSize: '2rem',
            color: 'var(--crimson-banner)',
            margin: '0 0 0.35rem',
          }}
          data-testid="winner-headline"
        >
          {title}
        </h2>
        <p style={{ margin: 0 }}>{subtitle}</p>
      </div>

      <div className="parchment-card">
        <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.65rem', fontSize: '0.96rem' }}>
          {t('fullCrewReveal')}
        </h3>

        {view.players.map((p) => (
          <div key={p.id} className={`crew-row ${p.alive ? '' : 'eliminated'}`}>
            <div>
              <strong>{p.name}</strong>
              {p.revealedWasConverted && p.revealedOriginalFaction && (
                <div className="small-text muted">
                  {getFactionLabel(p.revealedOriginalFaction, t)} → {t('factionCultist')}
                </div>
              )}
            </div>
            {p.revealedCurrentFaction && (
              <div className="row-gap">
                <FactionIcon faction={p.revealedCurrentFaction} size={30} />
                <span className={`badge badge-faction-${p.revealedCurrentFaction}`}>
                  {getFactionLabel(p.revealedCurrentFaction, t)}
                </span>
              </div>
            )}
          </div>
        ))}

        {view.fivePlayerRemovedFaction && (
          <div className="notice-box gold small-text" style={{ marginTop: '0.65rem' }}>
            {t('fivePlayerUnusedCard', {
              faction: getFactionLabel(view.fivePlayerRemovedFaction, t),
            })}
          </div>
        )}
      </div>

      <div className="stack-sm">
        {view.me.isHost && (
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={hostActions.resetToLobby}
            data-testid="play-again-btn"
          >
            {t('playAgainKeepCrew')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline btn-block btn-sm"
          onClick={onLeave}
        >
          {t('leaveRoom')}
        </button>
      </div>
    </div>
  );
};
