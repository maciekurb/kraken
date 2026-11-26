import {
  createShuffledRitualDeck,
  generateFactionDeck,
  getFloggingNonMatchingChoices,
  isEligibleForConversion,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from './rules';
import type {
  CommandTeamIds,
  EnlightenedMember,
  HostGameState,
  Player,
  PlayerActivePhaseView,
  PlayerRitualResult,
  PlayerView,
  PublicEventLogEntry,
  PublicPlayerView,
  RitualType,
  VoyageMode,
  WinningFaction,
} from './types';

function makeId(prefix: string, rng: () => number = Math.random): string {
  return `${prefix}_${Math.floor(rng() * 1e9).toString(36)}`;
}

function appendLog(
  state: HostGameState,
  type: PublicEventLogEntry['type'],
  params: Record<string, string | number>,
  now: number = Date.now(),
  rng: () => number = Math.random
): PublicEventLogEntry[] {
  const entry: PublicEventLogEntry = {
    id: makeId('log', rng),
    timestamp: now,
    type,
    params,
  };
  return [entry, ...state.publicLog].slice(0, 60);
}

export function createLobbyState(
  roomCode: string,
  hostId: string,
  hostName: string,
  voyageMode: VoyageMode = 'short'
): HostGameState {
  const trimmed = hostName.trim() || 'Captain';
  return {
    roomCode: roomCode.toUpperCase(),
    phase: 'lobby',
    voyageMode,
    players: [
      {
        id: hostId,
        name: trimmed,
        seatIndex: 0,
        isHost: true,
        connected: true,
        alive: true,
        wasConverted: false,
        cabinSearched: false,
        flogged: false,
        tongueCut: false,
      },
    ],
    currentCaptainId: null,
    ritualDeck: [],
    usedRituals: [],
    activePhase: null,
    cabinSearchHistory: [],
    knownConvertedIds: [],
    publicLog: [],
  };
}

export function setVoyageMode(state: HostGameState, mode: VoyageMode): HostGameState {
  return { ...state, voyageMode: mode };
}

export function addOrReconnectPlayer(
  state: HostGameState,
  playerId: string,
  name: string
): { state: HostGameState; accepted: boolean; reason?: string } {
  const existing = state.players.find((p) => p.id === playerId);
  if (existing) {
    const updatedName =
      state.phase === 'lobby' && name.trim().length > 0 ? name.trim() : existing.name;
    return {
      accepted: true,
      state: {
        ...state,
        players: state.players.map((p) =>
          p.id === playerId ? { ...p, connected: true, name: updatedName } : p
        ),
      },
    };
  }

  if (state.phase !== 'lobby') {
    return { state, accepted: false, reason: 'game_in_progress' };
  }

  if (state.players.length >= MAX_PLAYERS) {
    return { state, accepted: false, reason: 'room_full' };
  }

  const cleanName = name.trim().slice(0, 24) || `Sailor ${state.players.length + 1}`;
  const duplicate = state.players.some(
    (p) => p.name.toLowerCase() === cleanName.toLowerCase()
  );
  const finalName = duplicate ? `${cleanName} #${state.players.length + 1}` : cleanName;

  const newPlayer: Player = {
    id: playerId,
    name: finalName,
    seatIndex: state.players.length,
    isHost: false,
    connected: true,
    alive: true,
    wasConverted: false,
    cabinSearched: false,
    flogged: false,
    tongueCut: false,
  };

  const nextPlayers = [...state.players, newPlayer];
  // Auto-suggest long voyage once 8+ players join if still on short? Keep host control explicit.
  return {
    accepted: true,
    state: {
      ...state,
      players: nextPlayers,
    },
  };
}

export function setPlayerConnected(
  state: HostGameState,
  playerId: string,
  connected: boolean
): HostGameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, connected } : p)),
  };
}

export function removePlayerFromLobby(state: HostGameState, playerId: string): HostGameState {
  if (state.phase !== 'lobby') return state;
  const target = state.players.find((p) => p.id === playerId);
  if (!target || target.isHost) return state;
  const remaining = state.players
    .filter((p) => p.id !== playerId)
    .map((p, idx) => ({ ...p, seatIndex: idx }));
  return { ...state, players: remaining };
}

export function movePlayerSeat(
  state: HostGameState,
  playerId: string,
  direction: -1 | 1
): HostGameState {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return state;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= state.players.length) return state;
  const next = [...state.players];
  [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
  return {
    ...state,
    players: next.map((p, i) => ({ ...p, seatIndex: i })),
  };
}

export function startGame(
  state: HostGameState,
  rng: () => number = Math.random,
  now: number = Date.now()
): HostGameState {
  if (state.players.length < MIN_PLAYERS || state.players.length > MAX_PLAYERS) {
    throw new Error(`Need between ${MIN_PLAYERS} and ${MAX_PLAYERS} players to start.`);
  }

  const { factions, fivePlayerRemovedFaction } = generateFactionDeck(state.players.length, rng);
  const ritualDeck = createShuffledRitualDeck(rng);
  const initialCaptainIdx = Math.floor(rng() * state.players.length);

  const assignedPlayers: Player[] = state.players.map((p, idx) => ({
    ...p,
    seatIndex: idx,
    alive: true,
    eliminatedReason: undefined,
    originalFaction: factions[idx],
    currentFaction: factions[idx],
    wasConverted: false,
    cabinSearched: false,
    flogged: false,
    floggedNotFaction: undefined,
    tongueCut: false,
  }));

  const captain = assignedPlayers[initialCaptainIdx];

  const next: HostGameState = {
    ...state,
    phase: 'playing',
    players: assignedPlayers,
    currentCaptainId: captain.id,
    ritualDeck,
    usedRituals: [],
    activePhase: null,
    cabinSearchHistory: [],
    knownConvertedIds: [],
    fivePlayerRemovedFaction,
    winner: undefined,
    publicLog: [],
  };

  return {
    ...next,
    publicLog: appendLog(
      next,
      'game_started',
      { count: assignedPlayers.length, captain: captain.name },
      now,
      rng
    ),
  };
}

export function resetToLobby(state: HostGameState): HostGameState {
  return {
    ...state,
    phase: 'lobby',
    currentCaptainId: null,
    ritualDeck: [],
    usedRituals: [],
    activePhase: null,
    cabinSearchHistory: [],
    knownConvertedIds: [],
    fivePlayerRemovedFaction: undefined,
    winner: undefined,
    publicLog: [],
    players: state.players.map((p, idx) => ({
      ...p,
      seatIndex: idx,
      alive: true,
      eliminatedReason: undefined,
      originalFaction: undefined,
      currentFaction: undefined,
      wasConverted: false,
      cabinSearched: false,
      flogged: false,
      floggedNotFaction: undefined,
      tongueCut: false,
    })),
  };
}

export function setCurrentCaptain(
  state: HostGameState,
  captainId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): HostGameState {
  if (state.phase !== 'playing') return state;
  const target = state.players.find((p) => p.id === captainId);
  if (!target || !target.alive || target.tongueCut) return state;
  if (state.currentCaptainId === captainId) return state;
  return {
    ...state,
    currentCaptainId: captainId,
    publicLog: appendLog(state, 'captain_changed', { captain: target.name }, now, rng),
  };
}

export function cancelActivePhase(state: HostGameState): HostGameState {
  if (!state.activePhase) return state;
  // Note: If a deck ritual was already drawn and is still in select_command or acting before result,
  // put it back on top of the deck only if not yet resolved.
  if (
    state.activePhase.type === 'cult_ritual' &&
    state.activePhase.source === 'deck' &&
    state.activePhase.step !== 'result'
  ) {
    return {
      ...state,
      ritualDeck: [state.activePhase.ritualType, ...state.ritualDeck],
      usedRituals: state.usedRituals.slice(0, -1),
      activePhase: null,
    };
  }
  return { ...state, activePhase: null };
}

// ============================================================================
// MAP ACTIONS
// ============================================================================

export function startCabinSearch(state: HostGameState, captainId?: string): HostGameState {
  if (state.phase !== 'playing' || state.activePhase) return state;
  const capId = captainId ?? state.currentCaptainId ?? state.players.find((p) => p.alive)?.id;
  if (!capId) return state;
  return {
    ...state,
    currentCaptainId: capId,
    activePhase: {
      type: 'cabin_search',
      captainId: capId,
      step: 'select_target',
    },
  };
}

export function selectCabinSearchTarget(
  state: HostGameState,
  targetId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): HostGameState {
  if (state.activePhase?.type !== 'cabin_search' || state.activePhase.step !== 'select_target') {
    return state;
  }
  const captainId = state.activePhase.captainId;
  const target = state.players.find((p) => p.id === targetId);
  const captain = state.players.find((p) => p.id === captainId);
  if (!target || !captain || !target.alive || target.id === captainId) return state;
  if (!target.currentFaction || !target.originalFaction) return state;

  const record = {
    id: makeId('cs', rng),
    captainId,
    targetId: target.id,
    targetName: target.name,
    seenCurrentFaction: target.currentFaction,
    seenOriginalFaction: target.originalFaction,
    wasConverted: target.wasConverted,
    timestamp: now,
  };

  return {
    ...state,
    players: state.players.map((p) => (p.id === targetId ? { ...p, cabinSearched: true } : p)),
    cabinSearchHistory: [record, ...state.cabinSearchHistory],
    activePhase: {
      type: 'cabin_search',
      captainId,
      step: 'reveal',
      targetId: target.id,
      seenCurrentFaction: target.currentFaction,
      seenOriginalFaction: target.originalFaction,
      wasConverted: target.wasConverted,
    },
    publicLog: appendLog(
      state,
      'cabin_searched',
      { captain: captain.name, target: target.name },
      now,
      rng
    ),
  };
}

export function completeCabinSearch(state: HostGameState): HostGameState {
  if (state.activePhase?.type !== 'cabin_search' || state.activePhase.step !== 'reveal') {
    return state;
  }
  return { ...state, activePhase: null };
}

export function startFlogging(state: HostGameState, captainId?: string): HostGameState {
  if (state.phase !== 'playing' || state.activePhase) return state;
  const capId = captainId ?? state.currentCaptainId ?? state.players.find((p) => p.alive)?.id;
  if (!capId) return state;
  return {
    ...state,
    currentCaptainId: capId,
    activePhase: {
      type: 'flogging',
      captainId: capId,
      step: 'select_target',
    },
  };
}

export function selectFloggingTarget(
  state: HostGameState,
  targetId: string,
  rng: () => number = Math.random
): HostGameState {
  if (state.activePhase?.type !== 'flogging' || state.activePhase.step !== 'select_target') {
    return state;
  }
  const captainId = state.activePhase.captainId;
  const target = state.players.find((p) => p.id === targetId);
  if (!target || !target.alive || target.id === captainId || !target.currentFaction) return state;

  const hiddenChoices = getFloggingNonMatchingChoices(target.currentFaction, rng);

  return {
    ...state,
    activePhase: {
      type: 'flogging',
      captainId,
      step: 'pick_card',
      targetId: target.id,
      hiddenChoices,
    },
  };
}

export function pickFloggingCard(
  state: HostGameState,
  cardIndex: 0 | 1,
  now: number = Date.now(),
  rng: () => number = Math.random
): HostGameState {
  if (
    state.activePhase?.type !== 'flogging' ||
    state.activePhase.step !== 'pick_card' ||
    !state.activePhase.targetId ||
    !state.activePhase.hiddenChoices
  ) {
    return state;
  }
  const { captainId, targetId, hiddenChoices } = state.activePhase;
  const revealed = hiddenChoices[cardIndex];
  const target = state.players.find((p) => p.id === targetId);
  const captain = state.players.find((p) => p.id === captainId);
  if (!target || !captain) return state;

  return {
    ...state,
    players: state.players.map((p) =>
      p.id === targetId ? { ...p, flogged: true, floggedNotFaction: revealed } : p
    ),
    activePhase: {
      type: 'flogging',
      captainId,
      step: 'revealed',
      targetId,
      revealedNotFaction: revealed,
    },
    publicLog: appendLog(
      state,
      'flogged',
      { captain: captain.name, target: target.name, notFaction: revealed },
      now,
      rng
    ),
  };
}

export function completeFlogging(state: HostGameState): HostGameState {
  if (state.activePhase?.type !== 'flogging' || state.activePhase.step !== 'revealed') {
    return state;
  }
  return { ...state, activePhase: null };
}

export function startCutTongue(state: HostGameState, captainId?: string): HostGameState {
  if (state.phase !== 'playing' || state.activePhase) return state;
  const capId = captainId ?? state.currentCaptainId ?? state.players.find((p) => p.alive)?.id;
  if (!capId) return state;
  return {
    ...state,
    currentCaptainId: capId,
    activePhase: {
      type: 'cut_tongue',
      captainId: capId,
      step: 'select_target',
    },
  };
}

export function selectCutTongueTarget(
  state: HostGameState,
  targetId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): HostGameState {
  if (state.activePhase?.type !== 'cut_tongue') return state;
  const captainId = state.activePhase.captainId;
  const target = state.players.find((p) => p.id === targetId);
  const captain = state.players.find((p) => p.id === captainId);
  if (!target || !captain || !target.alive || target.id === captainId) return state;

  return {
    ...state,
    players: state.players.map((p) => (p.id === targetId ? { ...p, tongueCut: true } : p)),
    activePhase: null,
    publicLog: appendLog(
      state,
      'tongue_cut',
      { captain: captain.name, target: target.name },
      now,
      rng
    ),
  };
}

export function startFeedKraken(state: HostGameState, captainId?: string): HostGameState {
  if (state.phase !== 'playing' || state.activePhase) return state;
  const capId = captainId ?? state.currentCaptainId ?? state.players.find((p) => p.alive)?.id;
  if (!capId) return state;
  return {
    ...state,
    currentCaptainId: capId,
    activePhase: {
      type: 'feed_kraken',
      captainId: capId,
      step: 'select_target',
    },
  };
}

export function selectFeedKrakenTarget(
  state: HostGameState,
  targetId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): HostGameState {
  if (state.activePhase?.type !== 'feed_kraken' || state.activePhase.step !== 'select_target') {
    return state;
  }
  const captainId = state.activePhase.captainId;
  const target = state.players.find((p) => p.id === targetId);
  const captain = state.players.find((p) => p.id === captainId);
  // Rulebook p. 14: Captain cannot choose themselves!
  if (!target || !captain || !target.alive || target.id === captainId) return state;

  const updatedPlayers = state.players.map((p) =>
    p.id === targetId ? { ...p, alive: false, eliminatedReason: 'kraken' as const } : p
  );

  // Rulebook p. 8 & 14: If the Cult Leader is fed to the Kraken, Cult wins IMMEDIATELY!
  if (target.currentFaction === 'cult_leader') {
    const logged = appendLog(
      state,
      'fed_kraken',
      { captain: captain.name, target: target.name },
      now,
      rng
    );
    return {
      ...state,
      phase: 'ended',
      players: updatedPlayers,
      activePhase: null,
      winner: { faction: 'cult', reason: 'cult_leader_fed' },
      publicLog: appendLog(
        { ...state, publicLog: logged },
        'game_ended',
        { winner: 'cult', reason: 'cult_leader_fed' },
        now,
        rng
      ),
    };
  }

  return {
    ...state,
    players: updatedPlayers,
    activePhase: {
      type: 'feed_kraken',
      captainId,
      step: 'survived_notice',
      targetId: target.id,
    },
    publicLog: appendLog(
      state,
      'fed_kraken',
      { captain: captain.name, target: target.name },
      now,
      rng
    ),
  };
}

export function dismissFeedKrakenNotice(state: HostGameState): HostGameState {
  if (state.activePhase?.type !== 'feed_kraken' || state.activePhase.step !== 'survived_notice') {
    return state;
  }
  return { ...state, activePhase: null };
}

/**
 * Rulebook p. 12: Navigator jumps overboard (Refusal of Orders).
 * Does NOT trigger Cult victory even if the Cult Leader jumps overboard!
 */
export function markPlayerOverboard(
  state: HostGameState,
  targetId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): HostGameState {
  if (state.phase !== 'playing') return state;
  const target = state.players.find((p) => p.id === targetId);
  if (!target || !target.alive) return state;

  const nextPlayers = state.players.map((p) =>
    p.id === targetId ? { ...p, alive: false, eliminatedReason: 'overboard' as const } : p
  );
  const nextCaptainId =
    state.currentCaptainId === targetId
      ? (nextPlayers.find((p) => p.alive && !p.tongueCut)?.id ??
        nextPlayers.find((p) => p.alive)?.id ??
        null)
      : state.currentCaptainId;

  return {
    ...state,
    players: nextPlayers,
    currentCaptainId: nextCaptainId,
    publicLog: appendLog(state, 'jumped_overboard', { target: target.name }, now, rng),
  };
}

// ============================================================================
// CULT RITUALS (ANTI-TELL SIMULTANEOUS INTERACTION)
// ============================================================================

export function startCultRitualFromDeck(state: HostGameState): HostGameState {
  if (state.phase !== 'playing' || state.activePhase) return state;
  if (state.ritualDeck.length === 0) return state;
  const [ritualType, ...rest] = state.ritualDeck;
  return {
    ...state,
    ritualDeck: rest,
    usedRituals: [...state.usedRituals, ritualType],
    activePhase: {
      type: 'cult_ritual',
      ritualType,
      source: 'deck',
      step: ritualType === 'enlightenment' ? 'select_command' : 'acting',
      submittedPlayerIds: [],
      acknowledgedPlayerIds: [],
    },
  };
}

export function startCultRitualManual(
  state: HostGameState,
  ritualType: RitualType
): HostGameState {
  if (state.phase !== 'playing' || state.activePhase) return state;
  // Also remove one matching card from remaining deck if present so count stays accurate
  const deckIdx = state.ritualDeck.indexOf(ritualType);
  const nextDeck =
    deckIdx >= 0
      ? [...state.ritualDeck.slice(0, deckIdx), ...state.ritualDeck.slice(deckIdx + 1)]
      : state.ritualDeck;
  return {
    ...state,
    ritualDeck: nextDeck,
    usedRituals: [...state.usedRituals, ritualType],
    activePhase: {
      type: 'cult_ritual',
      ritualType,
      source: 'manual',
      step: ritualType === 'enlightenment' ? 'select_command' : 'acting',
      submittedPlayerIds: [],
      acknowledgedPlayerIds: [],
    },
  };
}

export function setEnlightenmentCommandTeam(
  state: HostGameState,
  team: CommandTeamIds
): HostGameState {
  if (
    state.activePhase?.type !== 'cult_ritual' ||
    state.activePhase.ritualType !== 'enlightenment' ||
    state.activePhase.step !== 'select_command'
  ) {
    return state;
  }
  const uniqueIds = new Set([team.captainId, team.lieutenantId, team.navigatorId]);
  if (uniqueIds.size !== 3) return state;
  const allValid = [...uniqueIds].every((id) => state.players.some((p) => p.id === id && p.alive));
  if (!allValid) return state;

  return {
    ...state,
    currentCaptainId: team.captainId,
    activePhase: {
      ...state.activePhase,
      step: 'acting',
      commandTeamIds: team,
    },
  };
}

export interface RitualSubmissionPayload {
  convertedTargetId?: string;
  gunAllocations?: Record<string, number>;
}

function buildEnlightenedTeam(state: HostGameState, team: CommandTeamIds): EnlightenedMember[] {
  const roles: Array<{ role: 'captain' | 'lieutenant' | 'navigator'; id: string }> = [
    { role: 'captain', id: team.captainId },
    { role: 'lieutenant', id: team.lieutenantId },
    { role: 'navigator', id: team.navigatorId },
  ];
  return roles.map(({ role, id }) => {
    const p = state.players.find((pl) => pl.id === id)!;
    return {
      role,
      playerId: p.id,
      playerName: p.name,
      currentFaction: p.currentFaction!,
      originalFaction: p.originalFaction!,
      wasConverted: p.wasConverted,
    };
  });
}

export function submitRitualAction(
  state: HostGameState,
  playerId: string,
  payload: RitualSubmissionPayload,
  now: number = Date.now(),
  rng: () => number = Math.random
): HostGameState {
  if (state.activePhase?.type !== 'cult_ritual' || state.activePhase.step !== 'acting') {
    return state;
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player || !player.alive) return state;
  if (state.activePhase.submittedPlayerIds.includes(playerId)) return state;

  const isCultLeader = player.currentFaction === 'cult_leader';
  let nextChoice = state.activePhase.cultLeaderChoice ?? {};

  if (isCultLeader) {
    if (state.activePhase.ritualType === 'conversion') {
      const eligible = state.players.filter((p) =>
        isEligibleForConversion(p, player.id, state.knownConvertedIds)
      );
      if (eligible.length > 0) {
        const chosen = eligible.find((p) => p.id === payload.convertedTargetId);
        if (!chosen) return state; // Must pick a valid eligible target
        nextChoice = { ...nextChoice, convertedTargetId: chosen.id };
      }
    } else if (state.activePhase.ritualType === 'gun_stash') {
      const allocs = payload.gunAllocations ?? {};
      const aliveIds = new Set(state.players.filter((p) => p.alive).map((p) => p.id));
      let total = 0;
      const sanitized: Record<string, number> = {};
      for (const [tid, count] of Object.entries(allocs)) {
        if (!aliveIds.has(tid)) continue;
        if (!Number.isInteger(count) || count < 0 || count > 3) return state;
        if (count > 0) {
          sanitized[tid] = count;
          total += count;
        }
      }
      if (total !== 3) return state; // Rulebook p. 15: Must distribute all 3 guns!
      nextChoice = { ...nextChoice, gunAllocations: sanitized };
    }
  }
  // Non-cult-leader decoy submissions are intentionally discarded!

  const nextSubmitted = [...state.activePhase.submittedPlayerIds, playerId];
  const alivePlayers = state.players.filter((p) => p.alive);
  const allSubmitted = alivePlayers.every((p) => nextSubmitted.includes(p.id));

  if (!allSubmitted) {
    return {
      ...state,
      activePhase: {
        ...state.activePhase,
        submittedPlayerIds: nextSubmitted,
        cultLeaderChoice: nextChoice,
      },
    };
  }

  // All alive players confirmed! Resolve the ritual and enter synchronized 'result' step.
  return resolveCultRitual(
    {
      ...state,
      activePhase: {
        ...state.activePhase,
        submittedPlayerIds: nextSubmitted,
        cultLeaderChoice: nextChoice,
      },
    },
    now,
    rng
  );
}

function resolveCultRitual(
  state: HostGameState,
  now: number,
  rng: () => number
): HostGameState {
  if (state.activePhase?.type !== 'cult_ritual') return state;
  const ritual = state.activePhase;

  if (ritual.ritualType === 'conversion') {
    const targetId = ritual.cultLeaderChoice?.convertedTargetId;
    if (!targetId) {
      return {
        ...state,
        activePhase: {
          ...ritual,
          step: 'result',
          resultSummary: { noEligibleTargets: true },
        },
        publicLog: appendLog(state, 'ritual_resolved', { ritual: 'conversion' }, now, rng),
      };
    }

    const target = state.players.find((p) => p.id === targetId)!;
    const wasAlreadyCultist = target.currentFaction === 'cultist'; // 11-player initial cultist!

    const nextPlayers = state.players.map((p) =>
      p.id === targetId
        ? {
            ...p,
            currentFaction: 'cultist' as const,
            wasConverted: wasAlreadyCultist ? p.wasConverted : true,
          }
        : p
    );

    const nextKnownConverted = state.knownConvertedIds.includes(targetId)
      ? state.knownConvertedIds
      : [...state.knownConvertedIds, targetId];

    return {
      ...state,
      players: nextPlayers,
      knownConvertedIds: nextKnownConverted,
      activePhase: {
        ...ritual,
        step: 'result',
        resultSummary: {
          convertedTargetId: targetId,
          wasAlreadyCultist,
        },
      },
      publicLog: appendLog(state, 'ritual_resolved', { ritual: 'conversion' }, now, rng),
    };
  }

  if (ritual.ritualType === 'gun_stash') {
    const gunAllocations = ritual.cultLeaderChoice?.gunAllocations ?? {};
    return {
      ...state,
      activePhase: {
        ...ritual,
        step: 'result',
        resultSummary: { gunAllocations },
      },
      publicLog: appendLog(state, 'ritual_resolved', { ritual: 'gun_stash' }, now, rng),
    };
  }

  // Enlightenment
  const enlightenedTeam = ritual.commandTeamIds
    ? buildEnlightenedTeam(state, ritual.commandTeamIds)
    : [];
  return {
    ...state,
    activePhase: {
      ...ritual,
      step: 'result',
      resultSummary: { enlightenedTeam },
    },
    publicLog: appendLog(state, 'ritual_resolved', { ritual: 'enlightenment' }, now, rng),
  };
}

export function acknowledgeRitualResult(state: HostGameState, playerId: string): HostGameState {
  if (state.activePhase?.type !== 'cult_ritual' || state.activePhase.step !== 'result') {
    return state;
  }
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !player.alive) return state;
  if (state.activePhase.acknowledgedPlayerIds.includes(playerId)) return state;

  const nextAck = [...state.activePhase.acknowledgedPlayerIds, playerId];
  const alivePlayers = state.players.filter((p) => p.alive);
  const allAck = alivePlayers.every((p) => nextAck.includes(p.id));

  if (allAck) {
    return { ...state, activePhase: null };
  }

  return {
    ...state,
    activePhase: {
      ...state.activePhase,
      acknowledgedPlayerIds: nextAck,
    },
  };
}

/**
 * Host emergency escape hatch if a disconnected player blocks ritual dismissal/confirmation.
 */
export function forceAdvanceRitual(
  state: HostGameState,
  now: number = Date.now(),
  rng: () => number = Math.random
): HostGameState {
  if (state.activePhase?.type !== 'cult_ritual') return state;
  if (state.activePhase.step === 'result') {
    return { ...state, activePhase: null };
  }
  if (state.activePhase.step === 'acting') {
    // Only allow host force-advance once Cult Leader (if alive) has submitted!
    const cultLeader = state.players.find((p) => p.currentFaction === 'cult_leader');
    if (
      cultLeader &&
      cultLeader.alive &&
      !state.activePhase.submittedPlayerIds.includes(cultLeader.id)
    ) {
      return state;
    }
    return resolveCultRitual(state, now, rng);
  }
  return state;
}

export function triggerGameEnd(
  state: HostGameState,
  faction: WinningFaction,
  reason: 'port' | 'kraken_space' | 'cult_leader_fed',
  now: number = Date.now(),
  rng: () => number = Math.random
): HostGameState {
  if (state.phase === 'lobby') return state;
  return {
    ...state,
    phase: 'ended',
    activePhase: null,
    winner: { faction, reason },
    publicLog: appendLog(state, 'game_ended', { winner: faction, reason }, now, rng),
  };
}

// ============================================================================
// STRICT PER-PLAYER VIEW PROJECTION (SECURITY BOUNDARY)
// ============================================================================

export function projectPlayerView(state: HostGameState, playerId: string): PlayerView {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) {
    throw new Error(`Cannot project view for unknown player: ${playerId}`);
  }

  const isEnded = state.phase === 'ended';
  const cultLeader = state.players.find((p) => p.currentFaction === 'cult_leader');

  // Pirates learn fellow Pirates during Pirate Conclave (originalFaction === 'pirate')
  const otherPirates =
    me.originalFaction === 'pirate'
      ? state.players
          .filter((p) => p.id !== me.id && p.originalFaction === 'pirate')
          .map((p) => ({ id: p.id, name: p.name }))
      : [];

  const isLonePirate = me.originalFaction === 'pirate' && otherPirates.length === 0;

  // Cult Leader knows only players in knownConvertedIds (NOT the 11p blind initial Cultist until discovered)
  const knownCultists =
    me.currentFaction === 'cult_leader'
      ? state.knownConvertedIds
          .map((id) => state.players.find((p) => p.id === id))
          .filter((p): p is Player => Boolean(p))
          .map((p) => ({ id: p.id, name: p.name }))
      : [];

  // Converted cultist (or 11p cultist discovered during conversion) knows who the Cult Leader is
  const knownCultLeader =
    me.currentFaction === 'cultist' && state.knownConvertedIds.includes(me.id) && cultLeader
      ? { id: cultLeader.id, name: cultLeader.name }
      : null;

  const myCabinSearches = state.cabinSearchHistory.filter((r) => r.captainId === me.id);

  const publicPlayers: PublicPlayerView[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex,
    isHost: p.isHost,
    connected: p.connected,
    alive: p.alive,
    eliminatedReason: p.eliminatedReason,
    cabinSearched: p.cabinSearched,
    flogged: p.flogged,
    floggedNotFaction: p.floggedNotFaction,
    tongueCut: p.tongueCut,
    ...(isEnded
      ? {
          revealedOriginalFaction: p.originalFaction,
          revealedCurrentFaction: p.currentFaction,
          revealedWasConverted: p.wasConverted,
        }
      : {}),
  }));

  const activePhaseView = projectActivePhase(state, me, cultLeader);

  return {
    roomCode: state.roomCode,
    phase: state.phase,
    voyageMode: state.voyageMode,
    currentCaptainId: state.currentCaptainId,
    ritualDeckRemaining: state.ritualDeck.length,
    usedRituals: [...state.usedRituals],
    me: {
      id: me.id,
      name: me.name,
      isHost: me.isHost,
      alive: me.alive,
      eliminatedReason: me.eliminatedReason,
      originalFaction: me.originalFaction,
      currentFaction: me.currentFaction,
      wasConverted: me.wasConverted,
      knownPirates: otherPirates,
      isLonePirate,
      knownCultLeader,
      knownCultists,
      myCabinSearches,
    },
    players: publicPlayers,
    activePhase: activePhaseView,
    winner: state.winner,
    publicLog: state.publicLog,
    fivePlayerRemovedFaction: isEnded ? state.fivePlayerRemovedFaction : undefined,
  };
}

function projectActivePhase(
  state: HostGameState,
  me: Player,
  cultLeader: Player | undefined
): PlayerActivePhaseView | null {
  const phase = state.activePhase;
  if (!phase) return null;

  const findName = (id?: string) => state.players.find((p) => p.id === id)?.name ?? '';

  if (phase.type === 'cabin_search') {
    const isCaptain = me.id === phase.captainId;
    return {
      type: 'cabin_search',
      captainId: phase.captainId,
      captainName: findName(phase.captainId),
      canAct: isCaptain || me.isHost,
      step: phase.step,
      targetId: phase.targetId,
      targetName: findName(phase.targetId),
      // SECRET: ONLY the actual Captain sees the searched player's role!
      reveal:
        phase.step === 'reveal' &&
        isCaptain &&
        phase.seenCurrentFaction &&
        phase.seenOriginalFaction
          ? {
              seenCurrentFaction: phase.seenCurrentFaction,
              seenOriginalFaction: phase.seenOriginalFaction,
              wasConverted: Boolean(phase.wasConverted),
            }
          : undefined,
    };
  }

  if (phase.type === 'flogging') {
    const isCaptain = me.id === phase.captainId;
    return {
      type: 'flogging',
      captainId: phase.captainId,
      captainName: findName(phase.captainId),
      canAct: isCaptain || me.isHost,
      step: phase.step,
      targetId: phase.targetId,
      targetName: findName(phase.targetId),
      revealedNotFaction: phase.step === 'revealed' ? phase.revealedNotFaction : undefined,
    };
  }

  if (phase.type === 'cut_tongue') {
    return {
      type: 'cut_tongue',
      captainId: phase.captainId,
      captainName: findName(phase.captainId),
      canAct: me.id === phase.captainId || me.isHost,
      step: phase.step,
    };
  }

  if (phase.type === 'feed_kraken') {
    return {
      type: 'feed_kraken',
      captainId: phase.captainId,
      captainName: findName(phase.captainId),
      canAct: me.id === phase.captainId || me.isHost,
      step: phase.step,
      targetId: phase.targetId,
      targetName: findName(phase.targetId),
    };
  }

  // Cult Ritual (Anti-tell filtered projection!)
  const alivePlayers = state.players.filter((p) => p.alive);
  const isCultLeaderActing = me.alive && me.currentFaction === 'cult_leader';

  let selectableTargetIds: string[] = [];
  if (phase.step === 'acting') {
    if (phase.ritualType === 'conversion') {
      if (isCultLeaderActing) {
        selectableTargetIds = state.players
          .filter((p) => isEligibleForConversion(p, me.id, state.knownConvertedIds))
          .map((p) => p.id);
      } else {
        // Decoy list mirrors identical visual structure (alive players excluding self, searched, flogged)
        selectableTargetIds = state.players
          .filter((p) => p.alive && p.id !== me.id && !p.cabinSearched && !p.flogged)
          .map((p) => p.id);
      }
    } else if (phase.ritualType === 'gun_stash') {
      selectableTargetIds = alivePlayers.map((p) => p.id);
    }
  }

  let enlightenedTeam: EnlightenedMember[] | undefined;
  if (
    phase.ritualType === 'enlightenment' &&
    isCultLeaderActing &&
    phase.commandTeamIds &&
    (phase.step === 'acting' || phase.step === 'result')
  ) {
    enlightenedTeam = buildEnlightenedTeam(state, phase.commandTeamIds);
  }

  let myResult: PlayerRitualResult | undefined;
  if (phase.step === 'result' && phase.resultSummary) {
    if (phase.ritualType === 'conversion') {
      if (phase.resultSummary.noEligibleTargets) {
        myResult = isCultLeaderActing ? { type: 'conversion_none' } : { type: 'neutral' };
      } else if (phase.resultSummary.convertedTargetId === me.id && cultLeader) {
        myResult = {
          type: 'conversion_target',
          cultLeaderName: cultLeader.name,
          wasAlreadyCultist: Boolean(phase.resultSummary.wasAlreadyCultist),
        };
      } else if (isCultLeaderActing && phase.resultSummary.convertedTargetId) {
        myResult = {
          type: 'conversion_leader',
          targetName: findName(phase.resultSummary.convertedTargetId),
          wasAlreadyCultist: Boolean(phase.resultSummary.wasAlreadyCultist),
        };
      } else {
        myResult = { type: 'neutral' };
      }
    } else if (phase.ritualType === 'gun_stash') {
      const allocs = phase.resultSummary.gunAllocations ?? {};
      myResult = {
        type: 'gun_stash_public',
        allocations: Object.entries(allocs)
          .filter(([, guns]) => guns > 0)
          .map(([pid, guns]) => ({
            playerId: pid,
            playerName: findName(pid),
            guns,
          })),
      };
    } else if (phase.ritualType === 'enlightenment') {
      myResult =
        isCultLeaderActing && enlightenedTeam
          ? { type: 'enlightenment_leader', team: enlightenedTeam }
          : { type: 'neutral' };
    }
  }

  return {
    type: 'cult_ritual',
    ritualType: phase.ritualType,
    step: phase.step,
    commandTeamIds: phase.commandTeamIds,
    submittedCount: phase.submittedPlayerIds.length,
    acknowledgedCount: phase.acknowledgedPlayerIds.length,
    totalAliveCount: alivePlayers.length,
    hasSubmitted: phase.submittedPlayerIds.includes(me.id),
    hasAcknowledged: phase.acknowledgedPlayerIds.includes(me.id),
    isCultLeaderActing,
    selectableTargetIds,
    enlightenedTeam,
    myResult,
  };
}
