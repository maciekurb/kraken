import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Faction, PlayerView } from '../engine/types';
import { useI18n } from '../i18n/I18nContext';
import { FactionIcon, WaxSealIcon } from './icons/GameIcons';

interface SecretRoleCardProps {
  view: PlayerView;
}

const TAP_REVEAL_MS = 15_000;
const HOLD_THRESHOLD_MS = 240;

type RevealMode = 'sealed' | 'hold' | 'tap';

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
  const [revealMode, setRevealMode] = useState<RevealMode>('sealed');
  const [remainingMs, setRemainingMs] = useState<number>(TAP_REVEAL_MS);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHoldRef = useRef(false);
  const tapDeadlineRef = useRef<number>(0);

  const { me } = view;
  const faction = me.currentFaction;
  const revealed = revealMode !== 'sealed';

  const conceal = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setRevealMode('sealed');
  }, []);

  // Tap mode: 15s countdown timer with smooth progress bar
  useEffect(() => {
    if (revealMode !== 'tap') return;
    tapDeadlineRef.current = Date.now() + TAP_REVEAL_MS;
    setRemainingMs(TAP_REVEAL_MS);

    const interval = setInterval(() => {
      const left = Math.max(0, tapDeadlineRef.current - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        setRevealMode('sealed');
      }
    }, 150);

    return () => clearInterval(interval);
  }, [revealMode]);

  // Global release listener so press-and-hold always conceals cleanly on finger/mouse lift
  useEffect(() => {
    const onPointerEnd = () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setRevealMode((prev) => (prev === 'hold' ? 'sealed' : prev));
    };
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, []);

  // Hide immediately if tab loses focus, switches app, or screen locks
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) conceal();
    };
    window.addEventListener('blur', conceal);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', conceal);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [conceal]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  const handleSealPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    didHoldRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      didHoldRef.current = true;
      setRevealMode('hold');
    }, HOLD_THRESHOLD_MS);
  };

  const handleSealClick = () => {
    if (didHoldRef.current) {
      didHoldRef.current = false;
      return;
    }
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setRevealMode('tap');
  };

  if (!faction) return null;

  const winConditionText =
    faction === 'sailor'
      ? t('winSailor')
      : faction === 'pirate'
        ? t('winPirate')
        : t('winCult');

  const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
  const countdownPct = Math.max(0, Math.min(100, (remainingMs / TAP_REVEAL_MS) * 100));

  return (
    <div className="screen-enter">
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
                fontSize: '0.9rem',
                letterSpacing: '0.04em',
                color: 'var(--brass-light)',
                margin: '0.2rem 0 0.45rem',
              }}
            >
              {t('holdOrTapHint')}
            </p>
            <button
              type="button"
              className="wax-seal-btn"
              onPointerDown={handleSealPointerDown}
              onClick={handleSealClick}
              onContextMenu={(e) => e.preventDefault()}
              data-testid="reveal-role-btn"
            >
              <WaxSealIcon size={54} />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  marginTop: '0.25rem',
                  padding: '0 0.4rem',
                }}
              >
                {t('holdToReveal')}
              </span>
            </button>
            <p className="small-text" style={{ color: '#dfd0b0', margin: '0.35rem 0 0' }}>
              {t('autoHideNote')}
            </p>
          </div>
        ) : (
          <div className="secret-revealed-body" data-testid="revealed-role-content">
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
              <FactionIcon faction={faction} size={88} />
            </div>

            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.6rem',
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
                      <span
                        key={p.id}
                        className="badge badge-faction-pirate"
                        style={{ fontSize: '0.82rem', padding: '0.28rem 0.65rem' }}
                      >
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
                      <span
                        key={c.id}
                        className="badge badge-faction-cultist"
                        style={{ fontSize: '0.82rem', padding: '0.28rem 0.65rem' }}
                      >
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
                  <span
                    className="badge badge-faction-cult_leader"
                    style={{ fontSize: '0.85rem', padding: '0.28rem 0.65rem' }}
                  >
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

            {revealMode === 'hold' ? (
              <p
                className="small-text muted"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: '0.4rem 0 0' }}
              >
                {t('releaseToHide')}
              </p>
            ) : (
              <>
                <div className="countdown-track" aria-hidden="true">
                  <div className="countdown-fill" style={{ width: `${countdownPct}%` }} />
                </div>
                <div className="small-text muted" style={{ marginBottom: '0.6rem' }}>
                  {t('autoHideCountdown', { seconds: remainingSec })}
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-block"
                  onClick={conceal}
                  data-testid="hide-role-btn"
                >
                  {t('hideRole')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
