export type Faction = 'sailor' | 'pirate' | 'cult_leader' | 'cultist';
export type PublicFactionGroup = 'sailor' | 'pirate' | 'cult';
export type VoyageMode = 'short' | 'long';
export type RitualType = 'conversion' | 'gun_stash' | 'enlightenment';
export type WinningFaction = 'sailor' | 'pirate' | 'cult';
export type EliminatedReason = 'kraken' | 'overboard';

export interface Player {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  connected: boolean;
  alive: boolean;
  eliminatedReason?: EliminatedReason;
  originalFaction?: Faction;
  currentFaction?: Faction;
  wasConverted: boolean;
  cabinSearched: boolean;
  flogged: boolean;
  floggedNotFaction?: PublicFactionGroup;
  tongueCut: boolean;
}

export interface PublicPlayerView {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  connected: boolean;
  alive: boolean;
  eliminatedReason?: EliminatedReason;
  cabinSearched: boolean;
  flogged: boolean;
  floggedNotFaction?: PublicFactionGroup;
  tongueCut: boolean;
  // Populated ONLY when phase === 'ended'
  revealedOriginalFaction?: Faction;
  revealedCurrentFaction?: Faction;
  revealedWasConverted?: boolean;
}

export interface CabinSearchRecord {
  id: string;
  captainId: string;
  targetId: string;
  targetName: string;
  seenCurrentFaction: Faction;
  seenOriginalFaction: Faction;
  wasConverted: boolean;
  timestamp: number;
}

export interface CommandTeamIds {
  captainId: string;
  lieutenantId: string;
  navigatorId: string;
}

export interface EnlightenedMember {
  role: 'captain' | 'lieutenant' | 'navigator';
  playerId: string;
  playerName: string;
  currentFaction: Faction;
  originalFaction: Faction;
  wasConverted: boolean;
}

export type ActivePhase =
  | {
      type: 'cabin_search';
      captainId: string;
      step: 'select_target' | 'reveal';
      targetId?: string;
      seenCurrentFaction?: Faction;
      seenOriginalFaction?: Faction;
      wasConverted?: boolean;
    }
  | {
      type: 'flogging';
      captainId: string;
      step: 'select_target' | 'pick_card' | 'revealed';
      targetId?: string;
      hiddenChoices?: [PublicFactionGroup, PublicFactionGroup];
      revealedNotFaction?: PublicFactionGroup;
    }
  | {
      type: 'cut_tongue';
      captainId: string;
      step: 'select_target';
    }
  | {
      type: 'feed_kraken';
      captainId: string;
      step: 'select_target' | 'survived_notice';
      targetId?: string;
    }
  | {
      type: 'cult_ritual';
      ritualType: RitualType;
      source: 'deck' | 'manual';
      step: 'select_command' | 'acting' | 'result';
      commandTeamIds?: CommandTeamIds;
      submittedPlayerIds: string[];
      acknowledgedPlayerIds: string[];
      cultLeaderChoice?: {
        convertedTargetId?: string;
        gunAllocations?: Record<string, number>;
      };
      resultSummary?: {
        convertedTargetId?: string;
        wasAlreadyCultist?: boolean;
        noEligibleTargets?: boolean;
        gunAllocations?: Record<string, number>;
        enlightenedTeam?: EnlightenedMember[];
      };
    };

export type PlayerRitualResult =
  | { type: 'neutral' }
  | { type: 'conversion_target'; cultLeaderName: string; wasAlreadyCultist: boolean }
  | { type: 'conversion_leader'; targetName: string; wasAlreadyCultist: boolean }
  | { type: 'conversion_none' }
  | {
      type: 'gun_stash_public';
      allocations: Array<{ playerId: string; playerName: string; guns: number }>;
    }
  | { type: 'enlightenment_leader'; team: EnlightenedMember[] };

export type PlayerActivePhaseView =
  | {
      type: 'cabin_search';
      captainId: string;
      captainName: string;
      canAct: boolean;
      step: 'select_target' | 'reveal';
      targetId?: string;
      targetName?: string;
      reveal?: {
        seenCurrentFaction: Faction;
        seenOriginalFaction: Faction;
        wasConverted: boolean;
      };
    }
  | {
      type: 'flogging';
      captainId: string;
      captainName: string;
      canAct: boolean;
      step: 'select_target' | 'pick_card' | 'revealed';
      targetId?: string;
      targetName?: string;
      revealedNotFaction?: PublicFactionGroup;
    }
  | {
      type: 'cut_tongue';
      captainId: string;
      captainName: string;
      canAct: boolean;
      step: 'select_target';
    }
  | {
      type: 'feed_kraken';
      captainId: string;
      captainName: string;
      canAct: boolean;
      step: 'select_target' | 'survived_notice';
      targetId?: string;
      targetName?: string;
    }
  | {
      type: 'cult_ritual';
      ritualType: RitualType;
      step: 'select_command' | 'acting' | 'result';
      commandTeamIds?: CommandTeamIds;
      submittedCount: number;
      acknowledgedCount: number;
      totalAliveCount: number;
      hasSubmitted: boolean;
      hasAcknowledged: boolean;
      isCultLeaderActing: boolean;
      selectableTargetIds: string[];
      enlightenedTeam?: EnlightenedMember[];
      myResult?: PlayerRitualResult;
    };

export interface PublicEventLogEntry {
  id: string;
  timestamp: number;
  type:
    | 'game_started'
    | 'captain_changed'
    | 'cabin_searched'
    | 'flogged'
    | 'tongue_cut'
    | 'fed_kraken'
    | 'jumped_overboard'
    | 'ritual_resolved'
    | 'game_ended';
  params: Record<string, string | number>;
}

export interface GameWinner {
  faction: WinningFaction;
  reason: 'port' | 'kraken_space' | 'cult_leader_fed';
}

export interface HostGameState {
  roomCode: string;
  phase: 'lobby' | 'playing' | 'ended';
  voyageMode: VoyageMode;
  players: Player[];
  currentCaptainId: string | null;
  ritualDeck: RitualType[];
  usedRituals: RitualType[];
  activePhase: ActivePhase | null;
  cabinSearchHistory: CabinSearchRecord[];
  knownConvertedIds: string[];
  fivePlayerRemovedFaction?: 'sailor' | 'pirate';
  winner?: GameWinner;
  publicLog: PublicEventLogEntry[];
}

export interface PlayerPrivateInfo {
  id: string;
  name: string;
  isHost: boolean;
  alive: boolean;
  eliminatedReason?: EliminatedReason;
  originalFaction?: Faction;
  currentFaction?: Faction;
  wasConverted: boolean;
  knownPirates: Array<{ id: string; name: string }>;
  isLonePirate: boolean;
  knownCultLeader: { id: string; name: string } | null;
  knownCultists: Array<{ id: string; name: string }>;
  myCabinSearches: CabinSearchRecord[];
}

export interface PlayerView {
  roomCode: string;
  phase: 'lobby' | 'playing' | 'ended';
  voyageMode: VoyageMode;
  currentCaptainId: string | null;
  ritualDeckRemaining: number;
  usedRituals: RitualType[];
  me: PlayerPrivateInfo;
  players: PublicPlayerView[];
  activePhase: PlayerActivePhaseView | null;
  winner?: GameWinner;
  publicLog: PublicEventLogEntry[];
  fivePlayerRemovedFaction?: 'sailor' | 'pirate';
}
