import React, { useEffect, useState } from 'react';
import type { PlayerView, PublicFactionGroup, RitualType } from '../../engine/types';
import { useI18n } from '../../i18n/I18nContext';
import type { HostActions, PlayerActions } from '../../net/gameSession';
import { OverlayPortal } from '../OverlayPortal';
import {
  CabinSearchHexIcon,
  CutTongueHexIcon,
  FactionIcon,
  FeedKrakenHexIcon,
  FloggingHexIcon,
  RitualIcon,
  WaxSealIcon,
} from '../icons/GameIcons';
import { getFactionLabel } from '../SecretRoleCard';

interface PhaseOverlaysProps {
  view: PlayerView;
  hostActions: HostActions;
  playerActions: PlayerActions;
}

export function getPublicGroupLabel(
  group: PublicFactionGroup,
  t: ReturnType<typeof useI18n>['t']
): string {
  if (group === 'sailor') return t('factionGroupSailor');
  if (group === 'pirate') return t('factionGroupPirate');
  return t('factionGroupCult');
}

export function getRitualLabel(
  ritual: RitualType,
  t: ReturnType<typeof useI18n>['t']
): string {
  if (ritual === 'conversion') return t('ritualConversion');
  if (ritual === 'gun_stash') return t('ritualGunStash');
  return t('ritualEnlightenment');
}

export const PhaseOverlays: React.FC<PhaseOverlaysProps> = ({
  view,
  hostActions,
  playerActions,
}) => {
  const { t } = useI18n();
  const phase = view.activePhase;

  // Local state for cult ritual interactive widgets
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [gunAlloc, setGunAlloc] = useState<Record<string, number>>({});
  const [cmdCaptain, setCmdCaptain] = useState<string>('');
  const [cmdLieutenant, setCmdLieutenant] = useState<string>('');
  const [cmdNavigator, setCmdNavigator] = useState<string>('');

  // Reset local interactive state whenever the active phase or step changes
  const phaseKey = phase
    ? `${phase.type}:${phase.step}:${phase.type === 'cult_ritual' ? phase.ritualType : ''}`
    : 'none';

  useEffect(() => {
    setSelectedTarget('');
    setGunAlloc({});
    if (phase?.type === 'cult_ritual' && phase.step === 'select_command') {
      const alive = view.players.filter((p) => p.alive);
      const cap =
        view.currentCaptainId && alive.some((p) => p.id === view.currentCaptainId)
          ? view.currentCaptainId
          : (alive[0]?.id ?? '');
      const others = alive.filter((p) => p.id !== cap);
      setCmdCaptain(cap);
      setCmdLieutenant(others[0]?.id ?? '');
      setCmdNavigator(others[1]?.id ?? '');
    }
  }, [phaseKey]);

  if (!phase) return null;

  // ============================================================================
  // 1. CABIN SEARCH
  // ============================================================================
  if (phase.type === 'cabin_search') {
    const aliveTargets = view.players.filter((p) => p.alive && p.id !== phase.captainId);
    return (
      <OverlayPortal
        open
        variant="modal"
        zIndex={70}
        ariaLabel={t('phaseCabinSearchTitle')}
        testId="phase-overlay-cabin-search"
      >
        <div className="crimson-ribbon" style={{ marginTop: 0 }}>
          <h3>{t('phaseCabinSearchTitle')}</h3>
          <CabinSearchHexIcon size={32} />
        </div>

          {phase.step === 'select_target' && (
            <>
              {phase.canAct ? (
                <div>
                  <p className="small-text" style={{ marginTop: 0 }}>
                    {t('selectTargetPrompt', { captain: phase.captainName })}
                  </p>
                  {aliveTargets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="crew-row selectable"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => playerActions.cabinSearchSelectTarget(p.id)}
                      data-testid={`cabin-search-target-${p.name}`}
                    >
                      <strong>{p.name}</strong>
                      <span className="badge badge-searched">{t('actionCabinSearch')}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="center muted">{t('waitingForCaptain', { captain: phase.captainName })}</p>
              )}
            </>
          )}

          {phase.step === 'reveal' && (
            <div>
              {phase.reveal ? (
                <div className="parchment-card brass center" data-testid="cabin-search-secret-reveal">
                  <div className="notice-box ocean small-text" style={{ textAlign: 'left' }}>
                    {t('cabinSearchSecretReveal')}
                  </div>
                  <p style={{ margin: '0.4rem 0' }}>
                    {t('cabinSearchTargetIs', { name: phase.targetName ?? '' })}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0' }}>
                    <FactionIcon faction={phase.reveal.seenCurrentFaction} size={78} />
                  </div>
                  <h2
                    style={{ fontFamily: 'var(--font-display)', margin: '0.25rem 0' }}
                    data-testid="cabin-search-revealed-faction"
                  >
                    {getFactionLabel(phase.reveal.seenCurrentFaction, t)}
                  </h2>
                  {phase.reveal.wasConverted && (
                    <div className="notice-box cult small-text" style={{ textAlign: 'left' }}>
                      {t('cabinSearchOriginallyWas', {
                        original: getFactionLabel(phase.reveal.seenOriginalFaction, t),
                      })}
                    </div>
                  )}
                  <p className="small-text muted">
                    {t('cabinSearchImmunityNote', { name: phase.targetName ?? '' })}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={playerActions.cabinSearchComplete}
                    data-testid="cabin-search-done-btn"
                  >
                    {t('confirmDone')}
                  </button>
                </div>
              ) : (
                <div className="center">
                  <p>{t('cabinSearchWaitingOthers', { captain: phase.captainName, target: phase.targetName ?? '' })}</p>
                  {view.me.isHost && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={playerActions.cabinSearchComplete}
                    >
                      {t('forceAdvanceBtn')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {view.me.isHost && phase.step === 'select_target' && (
            <button
              type="button"
              className="btn btn-outline btn-block btn-sm"
              style={{ marginTop: '0.6rem' }}
              onClick={hostActions.cancelActivePhase}
            >
              {t('cancelAction')}
            </button>
          )}
      </OverlayPortal>
    );
  }

  // ============================================================================
  // 2. FLOGGING
  // ============================================================================
  if (phase.type === 'flogging') {
    const aliveTargets = view.players.filter((p) => p.alive && p.id !== phase.captainId);
    return (
      <OverlayPortal
        open
        variant="modal"
        zIndex={70}
        ariaLabel={t('phaseFloggingTitle')}
        testId="phase-overlay-flogging"
      >
        <div className="crimson-ribbon" style={{ marginTop: 0 }}>
          <h3>{t('phaseFloggingTitle')}</h3>
          <FloggingHexIcon size={32} />
        </div>

          {phase.step === 'select_target' && (
            <>
              {phase.canAct ? (
                <div>
                  <p className="small-text" style={{ marginTop: 0 }}>
                    {t('selectTargetPrompt', { captain: phase.captainName })}
                  </p>
                  {aliveTargets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="crew-row selectable"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => playerActions.floggingSelectTarget(p.id)}
                      data-testid={`flogging-target-${p.name}`}
                    >
                      <strong>{p.name}</strong>
                      <span className="badge badge-flogged">{t('actionFlogging')}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="center muted">{t('waitingForCaptain', { captain: phase.captainName })}</p>
              )}
            </>
          )}

          {phase.step === 'pick_card' && (
            <div>
              {phase.canAct ? (
                <div className="center">
                  <p className="small-text">
                    {t('floggingPickCardPrompt', { target: phase.targetName ?? '' })}
                  </p>
                  <div className="flogging-cards-row">
                    <button
                      type="button"
                      className="flogging-card-btn"
                      onClick={() => playerActions.floggingPickCard(0)}
                      data-testid="flogging-card-0"
                    >
                      <WaxSealIcon size={40} />
                      <span>{t('floggingCardLabel', { num: 1 })}</span>
                    </button>
                    <button
                      type="button"
                      className="flogging-card-btn"
                      onClick={() => playerActions.floggingPickCard(1)}
                      data-testid="flogging-card-1"
                    >
                      <WaxSealIcon size={40} />
                      <span>{t('floggingCardLabel', { num: 2 })}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="center muted">
                  {t('floggingWaitingPick', {
                    captain: phase.captainName,
                    target: phase.targetName ?? '',
                  })}
                </p>
              )}
            </div>
          )}

          {phase.step === 'revealed' && phase.revealedNotFaction && (
            <div className="parchment-card brass center" data-testid="flogging-revealed-box">
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  color: 'var(--pirate-red)',
                  marginBottom: '0.45rem',
                }}
              >
                {t('floggingRevealedBanner')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', margin: '0.4rem 0' }}>
                <FactionIcon faction={phase.revealedNotFaction} size={74} />
              </div>
              <p style={{ fontWeight: 700, margin: '0.45rem 0' }} data-testid="flogging-revealed-text">
                {t('floggingRevealedDesc', {
                  target: phase.targetName ?? '',
                  group: getPublicGroupLabel(phase.revealedNotFaction, t),
                })}
              </p>
              <p className="small-text muted">
                {t('floggingImmunityNote', { target: phase.targetName ?? '' })}
              </p>
              {phase.canAct && (
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={playerActions.floggingComplete}
                  data-testid="flogging-done-btn"
                >
                  {t('confirmDone')}
                </button>
              )}
            </div>
          )}

          {view.me.isHost && phase.step !== 'revealed' && (
            <button
              type="button"
              className="btn btn-outline btn-block btn-sm"
              style={{ marginTop: '0.6rem' }}
              onClick={hostActions.cancelActivePhase}
            >
              {t('cancelAction')}
            </button>
          )}
      </OverlayPortal>
    );
  }

  // ============================================================================
  // 3. CUT OFF TONGUE
  // ============================================================================
  if (phase.type === 'cut_tongue') {
    const aliveTargets = view.players.filter(
      (p) => p.alive && p.id !== phase.captainId && !p.tongueCut
    );
    return (
      <OverlayPortal
        open
        variant="modal"
        zIndex={70}
        ariaLabel={t('phaseCutTongueTitle')}
        testId="phase-overlay-cut-tongue"
      >
        <div className="crimson-ribbon" style={{ marginTop: 0 }}>
          <h3>{t('phaseCutTongueTitle')}</h3>
          <CutTongueHexIcon size={32} />
        </div>
          <p className="small-text muted" style={{ marginTop: 0 }}>
            {t('cutTongueHint')}
          </p>
          {phase.canAct ? (
            <div>
              {aliveTargets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="crew-row selectable"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => playerActions.cutTongueSelectTarget(p.id)}
                  data-testid={`cut-tongue-target-${p.name}`}
                >
                  <strong>{p.name}</strong>
                  <span className="badge badge-tongue">{t('actionCutTongue')}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="center muted">{t('waitingForCaptain', { captain: phase.captainName })}</p>
          )}
          {view.me.isHost && (
            <button
              type="button"
              className="btn btn-outline btn-block btn-sm"
              style={{ marginTop: '0.6rem' }}
              onClick={hostActions.cancelActivePhase}
            >
              {t('cancelAction')}
            </button>
          )}
      </OverlayPortal>
    );
  }

  // ============================================================================
  // 4. FEED THE KRAKEN
  // ============================================================================
  if (phase.type === 'feed_kraken') {
    const aliveTargets = view.players.filter((p) => p.alive && p.id !== phase.captainId);
    return (
      <OverlayPortal
        open
        variant="modal"
        zIndex={70}
        ariaLabel={t('phaseFeedKrakenTitle')}
        testId="phase-overlay-feed-kraken"
      >
        <div className="crimson-ribbon" style={{ marginTop: 0 }}>
          <h3>{t('phaseFeedKrakenTitle')}</h3>
          <FeedKrakenHexIcon size={32} />
        </div>

          {phase.step === 'select_target' && (
            <>
              <div className="notice-box small-text">{t('feedKrakenWarning')}</div>
              {phase.canAct ? (
                <div>
                  {aliveTargets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="crew-row selectable"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => playerActions.feedKrakenSelectTarget(p.id)}
                      data-testid={`feed-kraken-target-${p.name}`}
                    >
                      <strong>{p.name}</strong>
                      <span className="badge badge-eliminated">{t('actionFeedKraken')}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="center muted">{t('waitingForCaptain', { captain: phase.captainName })}</p>
              )}
              {view.me.isHost && (
                <button
                  type="button"
                  className="btn btn-outline btn-block btn-sm"
                  style={{ marginTop: '0.6rem' }}
                  onClick={hostActions.cancelActivePhase}
                >
                  {t('cancelAction')}
                </button>
              )}
            </>
          )}

          {phase.step === 'survived_notice' && (
            <div className="parchment-card center" data-testid="feed-kraken-survived">
              <FeedKrakenHexIcon size={64} />
              <h3 style={{ fontFamily: 'var(--font-display)', margin: '0.5rem 0 0.35rem' }}>
                {t('feedKrakenSurvivedTitle')}
              </h3>
              <p>{t('feedKrakenSurvivedDesc', { target: phase.targetName ?? '' })}</p>
              {phase.canAct && (
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={playerActions.feedKrakenDismiss}
                  data-testid="feed-kraken-dismiss-btn"
                >
                  {t('confirmDone')}
                </button>
              )}
            </div>
          )}
      </OverlayPortal>
    );
  }

  // ============================================================================
  // 5. CULT RITUALS (ANTI-TELL SIMULTANEOUS INTERACTION!)
  // ============================================================================
  const ritualTitle = t('ritualTitlePrefix', { ritual: getRitualLabel(phase.ritualType, t) });
  const alivePlayers = view.players.filter((p) => p.alive);
  const totalGunsAssigned = Object.values(gunAlloc).reduce((a, b) => a + b, 0);
  const gunsLeft = 3 - totalGunsAssigned;

  const adjustGun = (pid: string, delta: -1 | 1) => {
    setGunAlloc((prev) => {
      const curr = prev[pid] ?? 0;
      const next = curr + delta;
      if (next < 0) return prev;
      if (delta > 0 && totalGunsAssigned >= 3) return prev;
      const copy = { ...prev };
      if (next === 0) delete copy[pid];
      else copy[pid] = next;
      return copy;
    });
  };

  return (
    <OverlayPortal
      open
      variant="modal"
      zIndex={70}
      ariaLabel={ritualTitle}
      testId={`phase-overlay-ritual-${phase.ritualType}`}
    >
      <div className="crimson-ribbon" style={{ marginTop: 0 }}>
        <h3>{ritualTitle}</h3>
        <RitualIcon ritual={phase.ritualType} size={34} />
      </div>

        {/* STEP A: Enlightenment Command Team Selection (Host) */}
        {phase.step === 'select_command' && (
          <div>
            <h4 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.35rem' }}>
              {t('enlSelectCommandTitle')}
            </h4>
            <p className="small-text muted" style={{ marginTop: 0 }}>
              {t('enlSelectCommandDesc')}
            </p>
            {view.me.isHost ? (
              <div className="stack-sm">
                <div className="field" style={{ marginBottom: '0.4rem' }}>
                  <label>{t('roleCaptain')}</label>
                  <select
                    value={cmdCaptain}
                    onChange={(e) => setCmdCaptain(e.target.value)}
                    data-testid="enl-select-captain"
                  >
                    {alivePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: '0.4rem' }}>
                  <label>{t('roleLieutenant')}</label>
                  <select
                    value={cmdLieutenant}
                    onChange={(e) => setCmdLieutenant(e.target.value)}
                    data-testid="enl-select-lieutenant"
                  >
                    {alivePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: '0.4rem' }}>
                  <label>{t('roleNavigator')}</label>
                  <select
                    value={cmdNavigator}
                    onChange={(e) => setCmdNavigator(e.target.value)}
                    data-testid="enl-select-navigator"
                  >
                    {alivePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-cult btn-block"
                  disabled={new Set([cmdCaptain, cmdLieutenant, cmdNavigator]).size !== 3}
                  onClick={() =>
                    hostActions.setEnlightenmentCommandTeam({
                      captainId: cmdCaptain,
                      lieutenantId: cmdLieutenant,
                      navigatorId: cmdNavigator,
                    })
                  }
                  data-testid="enl-confirm-team-btn"
                >
                  {t('enlConfirmCommandBtn')}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-block btn-sm"
                  onClick={hostActions.cancelActivePhase}
                >
                  {t('cancelAction')}
                </button>
              </div>
            ) : (
              <p className="center muted">{t('waitingForHost')}</p>
            )}
          </div>
        )}

        {/* STEP B: Simultaneous Acting (Real choice for Cult Leader, identical Decoy for others!) */}
        {phase.step === 'acting' && (
          <div>
            <div className="notice-box gold small-text" style={{ marginTop: 0 }}>
              {t('antiTellHint')}
            </div>

            {!view.me.alive ? (
              <div className="parchment-card center">
                <p className="muted">
                  {t('readyCounter', {
                    done: phase.submittedCount,
                    total: phase.totalAliveCount,
                  })}
                </p>
              </div>
            ) : phase.hasSubmitted ? (
              <div className="parchment-card center" data-testid="ritual-waiting-crew">
                <p style={{ fontWeight: 700 }}>
                  {t('waitingForCrew', {
                    done: phase.submittedCount,
                    total: phase.totalAliveCount,
                  })}
                </p>
                {view.me.isHost && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={hostActions.forceAdvanceRitual}
                  >
                    {t('forceAdvanceBtn')}
                  </button>
                )}
              </div>
            ) : (
              <div>
                {/* CONVERSION ACTING */}
                {phase.ritualType === 'conversion' && (
                  <div>
                    <p
                      className="small-text"
                      style={{ fontWeight: phase.isCultLeaderActing ? 700 : 400 }}
                      data-testid={
                        phase.isCultLeaderActing ? 'conv-leader-prompt' : 'conv-decoy-prompt'
                      }
                    >
                      {phase.isCultLeaderActing
                        ? phase.selectableTargetIds.length > 0
                          ? t('convLeaderPrompt')
                          : t('convLeaderNoTargets')
                        : t('convDecoyPrompt')}
                    </p>

                    <div style={{ margin: '0.65rem 0' }}>
                      {phase.selectableTargetIds.map((pid) => {
                        const p = view.players.find((pl) => pl.id === pid);
                        if (!p) return null;
                        return (
                          <button
                            key={pid}
                            type="button"
                            className={`crew-row selectable ${selectedTarget === pid ? 'selected' : ''}`}
                            style={{ width: '100%', textAlign: 'left' }}
                            onClick={() => setSelectedTarget(pid)}
                            data-testid={`ritual-target-${p.name}`}
                          >
                            <strong>{p.name}</strong>
                            <span>{selectedTarget === pid ? '●' : '○'}</span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="btn btn-cult btn-block"
                      disabled={phase.selectableTargetIds.length > 0 && !selectedTarget}
                      onClick={() =>
                        playerActions.submitRitual({
                          convertedTargetId: selectedTarget || undefined,
                        })
                      }
                      data-testid="ritual-submit-btn"
                    >
                      {t('convSubmitBtn')}
                    </button>
                  </div>
                )}

                {/* GUN STASH ACTING */}
                {phase.ritualType === 'gun_stash' && (
                  <div>
                    <p
                      className="small-text"
                      style={{ fontWeight: phase.isCultLeaderActing ? 700 : 400 }}
                    >
                      {phase.isCultLeaderActing ? t('gunLeaderPrompt') : t('gunDecoyPrompt')}
                    </p>
                    <div
                      className="center"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        color: gunsLeft === 0 ? 'var(--cultist-green)' : 'var(--pirate-red)',
                        marginBottom: '0.55rem',
                      }}
                    >
                      {t('gunsRemaining', { count: gunsLeft })}
                    </div>

                    <div style={{ marginBottom: '0.7rem' }}>
                      {phase.selectableTargetIds.map((pid) => {
                        const p = view.players.find((pl) => pl.id === pid);
                        if (!p) return null;
                        const count = gunAlloc[pid] ?? 0;
                        return (
                          <div key={pid} className="crew-row">
                            <strong>{p.name}</strong>
                            <div className="gun-stepper">
                              <button
                                type="button"
                                disabled={count <= 0}
                                onClick={() => adjustGun(pid, -1)}
                                data-testid={`gun-minus-${p.name}`}
                              >
                                −
                              </button>
                              <span data-testid={`gun-count-${p.name}`}>{count}</span>
                              <button
                                type="button"
                                disabled={gunsLeft <= 0}
                                onClick={() => adjustGun(pid, 1)}
                                data-testid={`gun-plus-${p.name}`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="btn btn-cult btn-block"
                      disabled={gunsLeft !== 0}
                      onClick={() => playerActions.submitRitual({ gunAllocations: gunAlloc })}
                      data-testid="ritual-submit-btn"
                    >
                      {t('convSubmitBtn')}
                    </button>
                  </div>
                )}

                {/* ENLIGHTENMENT ACTING */}
                {phase.ritualType === 'enlightenment' && (
                  <div>
                    {phase.isCultLeaderActing && phase.enlightenedTeam ? (
                      <div data-testid="enlightenment-leader-reveal">
                        <h4 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem' }}>
                          {t('enlLeaderTitle')}
                        </h4>
                        <p className="small-text" style={{ marginTop: 0 }}>
                          {t('enlLeaderDesc')}
                        </p>
                        {phase.enlightenedTeam.map((m) => (
                          <div key={m.playerId} className="crew-row">
                            <div>
                              <div className="muted" style={{ fontSize: '0.75rem' }}>
                                {m.role === 'captain'
                                  ? t('roleCaptain')
                                  : m.role === 'lieutenant'
                                    ? t('roleLieutenant')
                                    : t('roleNavigator')}
                              </div>
                              <strong>{m.playerName}</strong>
                            </div>
                            <div className="row-gap">
                              <FactionIcon faction={m.currentFaction} size={30} />
                              <span className={`badge badge-faction-${m.currentFaction}`}>
                                {getFactionLabel(m.currentFaction, t)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div data-testid="enlightenment-decoy-view">
                        <h4 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem' }}>
                          {t('enlDecoyTitle')}
                        </h4>
                        <p className="small-text muted" style={{ marginTop: 0 }}>
                          {t('enlDecoyDesc')}
                        </p>
                        {phase.commandTeamIds && (
                          <div className="stack-sm" style={{ marginBottom: '0.7rem' }}>
                            {(
                              [
                                ['captain', phase.commandTeamIds.captainId],
                                ['lieutenant', phase.commandTeamIds.lieutenantId],
                                ['navigator', phase.commandTeamIds.navigatorId],
                              ] as const
                            ).map(([role, pid]) => {
                              const pl = view.players.find((x) => x.id === pid);
                              return (
                                <div key={role} className="crew-row">
                                  <span className="muted">
                                    {role === 'captain'
                                      ? t('roleCaptain')
                                      : role === 'lieutenant'
                                        ? t('roleLieutenant')
                                        : t('roleNavigator')}
                                  </span>
                                  <strong>{pl?.name ?? '—'}</strong>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn btn-cult btn-block"
                      style={{ marginTop: '0.65rem' }}
                      onClick={() => playerActions.submitRitual({})}
                      data-testid="ritual-submit-btn"
                    >
                      {t('convSubmitBtn')}
                    </button>
                  </div>
                )}

                <div className="center small-text muted" style={{ marginTop: '0.6rem' }}>
                  {t('readyCounter', {
                    done: phase.submittedCount,
                    total: phase.totalAliveCount,
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP C: Synchronized Private Result & Acknowledgment */}
        {phase.step === 'result' && (
          <div className="parchment-card brass center" data-testid="ritual-result-box">
            {phase.myResult?.type === 'conversion_target' && (
              <div data-testid="ritual-result-converted">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                  <FactionIcon faction="cultist" size={76} />
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--cultist-green)',
                    margin: '0.2rem 0 0.45rem',
                  }}
                >
                  {t('convResultTargetTitle')}
                </h3>
                <p style={{ fontWeight: 700 }}>
                  {phase.myResult.wasAlreadyCultist
                    ? t('convResultAlreadyCultistDesc', {
                        leader: phase.myResult.cultLeaderName,
                      })
                    : t('convResultTargetDesc', {
                        leader: phase.myResult.cultLeaderName,
                      })}
                </p>
              </div>
            )}

            {phase.myResult?.type === 'conversion_leader' && (
              <div data-testid="ritual-result-leader">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                  <FactionIcon faction="cult_leader" size={72} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', margin: '0.2rem 0 0.4rem' }}>
                  {t('convResultLeaderTitle')}
                </h3>
                <p>
                  {phase.myResult.wasAlreadyCultist
                    ? t('convResultLeaderAlreadyDesc', { target: phase.myResult.targetName })
                    : t('convResultLeaderDesc', { target: phase.myResult.targetName })}
                </p>
              </div>
            )}

            {phase.myResult?.type === 'conversion_none' && <p>{t('convResultNoneDesc')}</p>}

            {phase.myResult?.type === 'gun_stash_public' && (
              <div data-testid="ritual-result-guns">
                <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.4rem' }}>
                  {t('gunResultTitle')}
                </h3>
                <p className="small-text muted" style={{ marginTop: 0 }}>
                  {t('gunResultDesc')}
                </p>
                <div className="stack-sm" style={{ margin: '0.6rem 0', textAlign: 'left' }}>
                  {phase.myResult.allocations.map((item) => (
                    <div key={item.playerId} className="crew-row">
                      <strong>{item.playerName}</strong>
                      <span className="badge badge-captain">
                        {t('gunResultItem', { guns: item.guns })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {phase.myResult?.type === 'enlightenment_leader' && (
              <div data-testid="ritual-result-enlightenment">
                <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.5rem' }}>
                  {t('enlLeaderTitle')}
                </h3>
                {phase.myResult.team.map((m) => (
                  <div key={m.playerId} className="crew-row" style={{ textAlign: 'left' }}>
                    <strong>{m.playerName}</strong>
                    <span className={`badge badge-faction-${m.currentFaction}`}>
                      {getFactionLabel(m.currentFaction, t)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {phase.myResult?.type === 'neutral' && (
              <div data-testid="ritual-result-neutral">
                <h3 style={{ fontFamily: 'var(--font-display)', margin: '0.2rem 0 0.4rem' }}>
                  {t('ritualNeutralTitle')}
                </h3>
                <p className="muted">{t('ritualNeutralDesc')}</p>
              </div>
            )}

            {view.me.alive && !phase.hasAcknowledged ? (
              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ marginTop: '0.75rem' }}
                onClick={playerActions.acknowledgeRitual}
                data-testid="ritual-ack-btn"
              >
                {t('ritualAckBtn')}
              </button>
            ) : (
              <div className="stack-sm" style={{ marginTop: '0.65rem' }}>
                <p className="small-text muted" style={{ margin: 0 }}>
                  {t('waitingForCrew', {
                    done: phase.acknowledgedCount,
                    total: phase.totalAliveCount,
                  })}
                </p>
                {view.me.isHost && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={hostActions.forceAdvanceRitual}
                  >
                    {t('forceAdvanceBtn')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
    </OverlayPortal>
  );
};
