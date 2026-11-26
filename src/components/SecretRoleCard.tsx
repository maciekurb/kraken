import React, { useEffect, useState } from 'react';
import type { Faction, PlayerView } from '../engine/types';
import { useI18n } from '../i18n/I18nContext';
import { FactionIcon, WaxSealIcon } from './icons/GameIcons';

interface SecretRoleCardProps {
  view: PlayerView;
}

export function getFactionLabel(
  faction: Faction,
  t: ReturnType<typeof useI18n>['t']
): string {
  switch (faction) {
    case 'sailor':
      return t('factionSailor');
    case 'pirate':
      return t('factionPirate');
    case 'cult_leader':
      return t('factionCultLeader');
    case 'cultist':
      return t('factionCultist');
  }
}

export const SecretRoleCard: React.FC<SecretRoleCardProps> = ({ view }) => {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);

  const { me } = view;
  const faction = me.currentFaction;

  // Auto-hide after 18 seconds so nobody accidentally leaves their role face-up on the table
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), 18000);
    return () => clearTimeout(timer);
  }, [revealed]);

  // Also hide immediately if tab loses focus / screen locks
  useEffect(() => {
    const onBlur = () => setRevealed(false);
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  if (!faction) return null;

  const winConditionText =
    faction === 'sailor'
      ? t('winSailor')
      : faction === 'pirate'
        ? t('winPirate')
        : t('winCult');

  return (
    <div>
      <div className="crimson-ribbon">
        <h2>{t('secretCardTitle')}</h2>
        <span className="small-text" style={{ color: 'var(--brass-light)' }}>
          {me.name}
        </span>
      </div>

      {!me.alive && (
        <div className="notice-box" data-testid="eliminated-self-banner">
          {t('eliminatedSelfBanner', {
            reason:
              me.eliminatedReason === 'kraken' ? t('reasonKraken') : t('reasonOverboard'),
          })}
        </div>
      )}

      <div
        className={`secret-card-frame ${revealed ? `revealed-${faction}` : 'sealed'}`}
        data-testid="secret-role-card"
      >
        {!revealed ? (
          <div>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.92rem',
                letterSpacing: '0.06em',
                color: 'var(--brass-light)',
                margin: '0.2rem 0 0.4rem',
              }}
            >
              {t('secretSealedHint')}
            </p>
            <button
              type="button"
              className="wax-seal-btn"
              onClick={() => setRevealed(true)}
              data-testid="reveal-role-btn"
            >
              <WaxSealIcon size={50} />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  marginTop: '0.25rem',
                }}
              >
                {t('holdToReveal')}
              </span>
            </button>
            <p className="small-text" style={{ color: 'var(--parchment-deep)', margin: '0.35rem 0 0' }}>
              {t('autoHideNote')}
            </p>
          </div>
        ) : (
          <div data-testid="revealed-role-content">
            {me.wasConverted && me.originalFaction && (
              <div
                className="notice-box cult"
                style={{ textAlign: 'left', marginBottom: '0.85rem' }}
                data-testid="converted-banner"
              >
                <strong>{t('convertedBanner')}</strong>
                <div className="small-text">
                  {t('convertedSubtext', {
                    original: getFactionLabel(me.originalFaction, t),
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
              <FactionIcon faction={faction} size={86} />
            </div>

            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.55rem',
                margin: '0.2rem 0 0.35rem',
                color: 'var(--ink-primary)',
              }}
              data-testid="my-faction-name"
            >
              {getFactionLabel(faction, t)}
            </h2>

            <p style={{ margin: '0 0 0.9rem', fontSize: '0.98rem', color: 'var(--ink-secondary)' }}>
              {winConditionText}
            </p>

            {/* Pirate Conclave Allies */}
            {me.originalFaction === 'pirate' && (
              <div
                className="parchment-card"
                style={{ textAlign: 'left', marginBottom: '0.75rem' }}
                data-testid="pirate-allies-box"
              >
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem' }}>
                  {me.wasConverted ? t('formerPirateAlliesTitle') : t('pirateAlliesTitle')}
                </strong>
                {me.isLonePirate ? (
                  <p className="small-text" style={{ margin: '0.35rem 0 0' }}>
                    {t('lonePirateNote')}
                  </p>
                ) : (
                  <div className="badge-row" style={{ marginTop: '0.45rem' }}>
                    {me.knownPirates.map((p) => (
                      <span key={p.id} className="badge badge-faction-pirate" style={{ fontSize: '0.82rem', padding: '0.28rem 0.65rem' }}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cult Leader's Known Converted Cultists */}
            {faction === 'cult_leader' && (
              <div
                className="parchment-card"
                style={{ textAlign: 'left', marginBottom: '0.75rem' }}
                data-testid="cult-roster-box"
              >
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem' }}>
                  {t('cultistsKnownTitle')}
                </strong>
                {me.knownCultists.length === 0 ? (
                  <p className="small-text muted" style={{ margin: '0.35rem 0 0' }}>
                    {t('noCultistsYet')}
                  </p>
                ) : (
                  <div className="badge-row" style={{ marginTop: '0.45rem' }}>
                    {me.knownCultists.map((c) => (
                      <span key={c.id} className="badge badge-faction-cultist" style={{ fontSize: '0.82rem', padding: '0.28rem 0.65rem' }}>
                        {c.name}
                      </span>
                    ))}
                  </div>
                )}
                {view.players.length === 11 && (
                  <p className="small-text muted" style={{ margin: '0.45rem 0 0' }}>
                    {t('blindCultist11Note')}
                  </p>
                )}
              </div>
            )}

            {/* Converted Cultist's Known Cult Leader */}
            {faction === 'cultist' && me.knownCultLeader && (
              <div
                className="parchment-card"
                style={{ textAlign: 'left', marginBottom: '0.75rem' }}
                data-testid="known-cult-leader-box"
              >
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem' }}>
                  {t('yourCultLeaderTitle')}
                </strong>
                <div className="badge-row" style={{ marginTop: '0.4rem' }}>
                  <span className="badge badge-faction-cult_leader" style={{ fontSize: '0.85rem', padding: '0.28rem 0.65rem' }}>
                    {me.knownCultLeader.name}
                  </span>
                </div>
              </div>
            )}

            {faction === 'cultist' && !me.knownCultLeader && view.players.length === 11 && (
              <div className="notice-box cult small-text" style={{ textAlign: 'left' }}>
                {t('blindCultist11Note')}
              </div>
            )}

            {/* Captain's Private Cabin Search History */}
            {me.myCabinSearches.length > 0 && (
              <div
                className="parchment-card"
                style={{ textAlign: 'left', marginBottom: '0.75rem' }}
                data-testid="my-cabin-searches"
              >
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem' }}>
                  {t('myCabinSearchesTitle')}
                </strong>
                <div className="stack-sm" style={{ marginTop: '0.45rem' }}>
                  {me.myCabinSearches.map((rec) => (
                    <div key={rec.id} className="row-between small-text">
                      <strong>{rec.targetName}</strong>
                      <span className={`badge badge-faction-${rec.seenCurrentFaction}`}>
                        {rec.wasConverted
                          ? t('cabinSearchSeenConverted', {
                              original: getFactionLabel(rec.seenOriginalFaction, t),
                            })
                          : getFactionLabel(rec.seenCurrentFaction, t)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={() => setRevealed(false)}
              data-testid="hide-role-btn"
            >
              {t('hideRole')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
