import { describe, expect, it } from 'vitest';
import {
  acknowledgeRitualResult,
  addOrReconnectPlayer,
  completeCabinSearch,
  completeFlogging,
  createLobbyState,
  markPlayerOverboard,
  pickFloggingCard,
  projectPlayerView,
  selectCabinSearchTarget,
  selectCutTongueTarget,
  selectFeedKrakenTarget,
  selectFloggingTarget,
  setEnlightenmentCommandTeam,
  startCabinSearch,
  startCultRitualFromDeck,
  startCultRitualManual,
  startCutTongue,
  startFeedKraken,
  startFlogging,
  startGame,
  submitRitualAction,
} from './gameEngine';
import { factionToPublicGroup, generateFactionDeck } from './rules';
import type { HostGameState } from './types';

function makeRng(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createStartedGame(count: number, seed = 42): HostGameState {
  let state = createLobbyState('KRKN', 'p0', 'Player 0');
  for (let i = 1; i < count; i++) {
    const res = addOrReconnectPlayer(state, `p${i}`, `Player ${i}`);
    expect(res.accepted).toBe(true);
    state = res.state;
  }
  return startGame(state, makeRng(seed), 1000);
}

describe('Feed the Kraken — Rules & Faction Distribution', () => {
  it('enforces exact faction counts for 6 to 11 players', () => {
    const expected: Record<number, { sailor: number; pirate: number; cult_leader: number; cultist: number }> = {
      6: { sailor: 3, pirate: 2, cult_leader: 1, cultist: 0 },
      7: { sailor: 4, pirate: 2, cult_leader: 1, cultist: 0 },
      8: { sailor: 4, pirate: 3, cult_leader: 1, cultist: 0 },
      9: { sailor: 5, pirate: 3, cult_leader: 1, cultist: 0 },
      10: { sailor: 5, pirate: 4, cult_leader: 1, cultist: 0 },
      11: { sailor: 5, pirate: 4, cult_leader: 1, cultist: 1 },
    };

    for (const [countStr, exp] of Object.entries(expected)) {
      const { factions } = generateFactionDeck(Number(countStr), makeRng(Number(countStr)));
      expect(factions).toHaveLength(Number(countStr));
      expect(factions.filter((f) => f === 'sailor')).toHaveLength(exp.sailor);
      expect(factions.filter((f) => f === 'pirate')).toHaveLength(exp.pirate);
      expect(factions.filter((f) => f === 'cult_leader')).toHaveLength(exp.cult_leader);
      expect(factions.filter((f) => f === 'cultist')).toHaveLength(exp.cultist);
    }
  });

  it('implements the 5-player variable Sailor/Pirate split accurately', () => {
    let sawOnePirate = false;
    let sawTwoPirates = false;
    for (let seed = 1; seed <= 40; seed++) {
      const { factions, fivePlayerRemovedFaction } = generateFactionDeck(5, makeRng(seed));
      expect(factions).toHaveLength(5);
      expect(factions.filter((f) => f === 'cult_leader')).toHaveLength(1);
      const sailors = factions.filter((f) => f === 'sailor').length;
      const pirates = factions.filter((f) => f === 'pirate').length;
      if (fivePlayerRemovedFaction === 'pirate') {
        expect(sailors).toBe(3);
        expect(pirates).toBe(1);
        sawOnePirate = true;
      } else {
        expect(sailors).toBe(2);
        expect(pirates).toBe(2);
        sawTwoPirates = true;
      }
    }
    expect(sawOnePirate).toBe(true);
    expect(sawTwoPirates).toBe(true);
  });

  it('reveals fellow Pirates ONLY to Pirates and keeps 11-player Cultist blind at start', () => {
    const state = createStartedGame(11, 77);
    const pirates = state.players.filter((p) => p.originalFaction === 'pirate');
    const sailors = state.players.filter((p) => p.originalFaction === 'sailor');
    const cultLeader = state.players.find((p) => p.originalFaction === 'cult_leader')!;
    const cultist = state.players.find((p) => p.originalFaction === 'cultist')!;

    // Pirates see all 3 other Pirates
    const pirateView = projectPlayerView(state, pirates[0].id);
    expect(pirateView.me.knownPirates).toHaveLength(3);
    expect(pirateView.me.knownPirates.map((p) => p.id).sort()).toEqual(
      pirates
        .slice(1)
        .map((p) => p.id)
        .sort()
    );

    // Sailors see no Pirates or Cultists
    const sailorView = projectPlayerView(state, sailors[0].id);
    expect(sailorView.me.knownPirates).toHaveLength(0);
    expect(sailorView.me.knownCultists).toHaveLength(0);
    expect(sailorView.me.knownCultLeader).toBeNull();

    // 11-player rule (Rulebook p. 8): Cult Leader and initial Cultist do NOT know each other at start!
    const leaderView = projectPlayerView(state, cultLeader.id);
    const cultistView = projectPlayerView(state, cultist.id);
    expect(leaderView.me.knownCultists).toHaveLength(0);
    expect(cultistView.me.knownCultLeader).toBeNull();

    // No public player view leaks factions before game end
    expect(sailorView.players.every((p) => p.revealedCurrentFaction === undefined)).toBe(true);
  });
});

describe('Map Actions & Conversion Immunity', () => {
  it('Cabin Search reveals role ONLY to Captain and grants Conversion immunity', () => {
    let state = createStartedGame(6, 12);
    const captain = state.players[0];
    const target = state.players.find((p) => p.id !== captain.id && p.currentFaction !== 'cult_leader')!;
    const bystander = state.players.find((p) => p.id !== captain.id && p.id !== target.id)!;

    state = startCabinSearch(state, captain.id);
    state = selectCabinSearchTarget(state, target.id);

    const captainView = projectPlayerView(state, captain.id);
    const bystanderView = projectPlayerView(state, bystander.id);

    expect(captainView.activePhase?.type).toBe('cabin_search');
    if (captainView.activePhase?.type === 'cabin_search') {
      expect(captainView.activePhase.reveal?.seenCurrentFaction).toBe(target.currentFaction);
    }
    if (bystanderView.activePhase?.type === 'cabin_search') {
      expect(bystanderView.activePhase.reveal).toBeUndefined();
    }

    state = completeCabinSearch(state);
    expect(state.players.find((p) => p.id === target.id)?.cabinSearched).toBe(true);

    // Start a Conversion ritual -> Cabin Searched player must NOT be eligible!
    state = startCultRitualManual(state, 'conversion');
    const cultLeader = state.players.find((p) => p.currentFaction === 'cult_leader')!;
    const clView = projectPlayerView(state, cultLeader.id);
    if (clView.activePhase?.type === 'cult_ritual') {
      expect(clView.activePhase.selectableTargetIds).not.toContain(target.id);
    }
  });

  it('Flogging never reveals the target true faction and grants Conversion immunity', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let state = createStartedGame(7, seed);
      const captain = state.players[0];
      const target = state.players[1];

      state = startFlogging(state, captain.id);
      state = selectFloggingTarget(state, target.id, makeRng(seed + 100));
      state = pickFloggingCard(state, (seed % 2) as 0 | 1);

      const updatedTarget = state.players.find((p) => p.id === target.id)!;
      expect(updatedTarget.flogged).toBe(true);
      expect(updatedTarget.floggedNotFaction).toBeDefined();
      expect(updatedTarget.floggedNotFaction).not.toBe(
        factionToPublicGroup(updatedTarget.currentFaction!)
      );

      state = completeFlogging(state);
      state = startCultRitualManual(state, 'conversion');
      const cultLeader = state.players.find((p) => p.currentFaction === 'cult_leader')!;
      const clView = projectPlayerView(state, cultLeader.id);
      if (clView.activePhase?.type === 'cult_ritual') {
        expect(clView.activePhase.selectableTargetIds).not.toContain(target.id);
      }
    }
  });

  it('Cut Off Tongue marks player tongueCut', () => {
    let state = createStartedGame(7, 5);
    const captain = state.players[0];
    const target = state.players[2];
    state = startCutTongue(state, captain.id);
    state = selectCutTongueTarget(state, target.id);
    expect(state.players.find((p) => p.id === target.id)?.tongueCut).toBe(true);
  });

  it('Feed the Kraken triggers instant Cult victory ONLY if Cult Leader is sacrificed', () => {
    let state = createStartedGame(6, 9);
    const cultLeader = state.players.find((p) => p.currentFaction === 'cult_leader')!;
    const sailor = state.players.find((p) => p.currentFaction === 'sailor')!;
    const pirate = state.players.find((p) => p.currentFaction === 'pirate')!;

    // Feeding a Sailor does NOT end the game
    state = startFeedKraken(state, pirate.id);
    state = selectFeedKrakenTarget(state, sailor.id);
    expect(state.phase).toBe('playing');
    expect(state.players.find((p) => p.id === sailor.id)?.alive).toBe(false);
    expect(state.activePhase?.type).toBe('feed_kraken');

    // Feeding the Cult Leader immediately triggers Cult Victory!
    state = { ...state, activePhase: null };
    state = startFeedKraken(state, pirate.id);
    state = selectFeedKrakenTarget(state, cultLeader.id);
    expect(state.phase).toBe('ended');
    expect(state.winner).toEqual({ faction: 'cult', reason: 'cult_leader_fed' });
  });

  it('Jumping overboard as Cult Leader does NOT trigger Cult victory (Rulebook p. 12)', () => {
    let state = createStartedGame(6, 9);
    const cultLeader = state.players.find((p) => p.currentFaction === 'cult_leader')!;
    state = markPlayerOverboard(state, cultLeader.id);
    expect(state.phase).toBe('playing');
    expect(state.winner).toBeUndefined();
    expect(state.players.find((p) => p.id === cultLeader.id)?.alive).toBe(false);
  });
});

describe('Cult Rituals (Anti-Tell Simultaneous Confirmation)', () => {
  it('Conversion waits for all alive players, flips target faction, and informs ONLY Cult Leader + target', () => {
    let state = createStartedGame(6, 21);
    const cultLeader = state.players.find((p) => p.currentFaction === 'cult_leader')!;
    const target = state.players.find((p) => p.currentFaction === 'sailor')!;
    const bystander = state.players.find((p) => p.id !== cultLeader.id && p.id !== target.id)!;

    state = startCultRitualManual(state, 'conversion');

    // Cult Leader picks target; others submit decoys
    state = submitRitualAction(state, cultLeader.id, { convertedTargetId: target.id });
    expect(state.activePhase?.type === 'cult_ritual' && state.activePhase.step).toBe('acting');

    for (const p of state.players) {
      if (p.id !== cultLeader.id) {
        state = submitRitualAction(state, p.id, { convertedTargetId: cultLeader.id }); // decoy discarded!
      }
    }

    expect(state.activePhase?.type === 'cult_ritual' && state.activePhase.step).toBe('result');

    const targetView = projectPlayerView(state, target.id);
    const leaderView = projectPlayerView(state, cultLeader.id);
    const bystanderView = projectPlayerView(state, bystander.id);

    expect(targetView.me.currentFaction).toBe('cultist');
    expect(targetView.me.wasConverted).toBe(true);
    expect(targetView.me.knownCultLeader?.id).toBe(cultLeader.id);
    expect(leaderView.me.knownCultists.map((c) => c.id)).toContain(target.id);
    expect(bystanderView.me.currentFaction).not.toBe('cultist');

    if (targetView.activePhase?.type === 'cult_ritual') {
      expect(targetView.activePhase.myResult).toEqual({
        type: 'conversion_target',
        cultLeaderName: cultLeader.name,
        wasAlreadyCultist: false,
      });
    }
    if (bystanderView.activePhase?.type === 'cult_ritual') {
      expect(bystanderView.activePhase.myResult).toEqual({ type: 'neutral' });
    }

    // Subsequent Cabin Search on converted target shows Cultist + original faction!
    for (const p of state.players) {
      state = acknowledgeRitualResult(state, p.id);
    }
    expect(state.activePhase).toBeNull();

    state = startCabinSearch(state, bystander.id);
    state = selectCabinSearchTarget(state, target.id);
    const capView = projectPlayerView(state, bystander.id);
    if (capView.activePhase?.type === 'cabin_search') {
      expect(capView.activePhase.reveal).toEqual({
        seenCurrentFaction: 'cultist',
        seenOriginalFaction: 'sailor',
        wasConverted: true,
      });
    }
  });

  it('Gun Stash validates exact 3 guns and publishes distribution after all players confirm', () => {
    let state = createStartedGame(6, 33);
    const cultLeader = state.players.find((p) => p.currentFaction === 'cult_leader')!;
    const pA = state.players[0];
    const pB = state.players[1];

    state = startCultRitualManual(state, 'gun_stash');

    // Rejects invalid total (2 guns)
    const rejected = submitRitualAction(state, cultLeader.id, { gunAllocations: { [pA.id]: 2 } });
    expect(
      rejected.activePhase?.type === 'cult_ritual' &&
        rejected.activePhase.submittedPlayerIds.length
    ).toBe(0);

    // Accepts valid total (3 guns)
    state = submitRitualAction(state, cultLeader.id, {
      gunAllocations: { [pA.id]: 2, [pB.id]: 1 },
    });
    for (const p of state.players) {
      if (p.id !== cultLeader.id) {
        state = submitRitualAction(state, p.id, {});
      }
    }

    const view = projectPlayerView(state, pA.id);
    expect(view.activePhase?.type).toBe('cult_ritual');
    if (view.activePhase?.type === 'cult_ritual') {
      expect(view.activePhase.step).toBe('result');
      expect(view.activePhase.myResult?.type).toBe('gun_stash_public');
      if (view.activePhase.myResult?.type === 'gun_stash_public') {
        expect(view.activePhase.myResult.allocations).toHaveLength(2);
      }
    }
  });

  it('Enlightenment reveals the 3 Command Team roles ONLY to the Cult Leader', () => {
    let state = createStartedGame(6, 55);
    const cultLeader = state.players.find((p) => p.currentFaction === 'cult_leader')!;
    const other = state.players.find((p) => p.id !== cultLeader.id)!;

    state = startCultRitualManual(state, 'enlightenment');
    state = setEnlightenmentCommandTeam(state, {
      captainId: state.players[0].id,
      lieutenantId: state.players[1].id,
      navigatorId: state.players[2].id,
    });

    const clView = projectPlayerView(state, cultLeader.id);
    const otherView = projectPlayerView(state, other.id);

    if (clView.activePhase?.type === 'cult_ritual') {
      expect(clView.activePhase.enlightenedTeam).toHaveLength(3);
    }
    if (otherView.activePhase?.type === 'cult_ritual') {
      expect(otherView.activePhase.enlightenedTeam).toBeUndefined();
    }
  });

  it('draws all 5 ritual cards from the virtual deck accurately', () => {
    let state = createStartedGame(6, 101);
    expect(state.ritualDeck).toHaveLength(5);
    const drawn: string[] = [];
    for (let i = 0; i < 5; i++) {
      state = startCultRitualFromDeck(state);
      if (state.activePhase?.type === 'cult_ritual') {
        drawn.push(state.activePhase.ritualType);
      }
      state = { ...state, activePhase: null };
    }
    expect(drawn.filter((r) => r === 'conversion')).toHaveLength(3);
    expect(drawn.filter((r) => r === 'gun_stash')).toHaveLength(1);
    expect(drawn.filter((r) => r === 'enlightenment')).toHaveLength(1);
    expect(state.ritualDeck).toHaveLength(0);
  });
});
