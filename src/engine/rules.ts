import type { Faction, Player, PublicFactionGroup, RitualType, VoyageMode } from './types';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 11;

export interface CrewTableRow {
  players: number;
  sailors: string;
  pirates: string;
  cultLeader: number;
  cultist: number;
  offDuty: number;
  mutinyGuns: number;
}

export const CREW_COMPOSITION_TABLE: CrewTableRow[] = [
  { players: 5, sailors: '2–3', pirates: '1–2', cultLeader: 1, cultist: 0, offDuty: 1, mutinyGuns: 3 },
  { players: 6, sailors: '3', pirates: '2', cultLeader: 1, cultist: 0, offDuty: 1, mutinyGuns: 3 },
  { players: 7, sailors: '4', pirates: '2', cultLeader: 1, cultist: 0, offDuty: 2, mutinyGuns: 3 },
  { players: 8, sailors: '4', pirates: '3', cultLeader: 1, cultist: 0, offDuty: 2, mutinyGuns: 4 },
  { players: 9, sailors: '5', pirates: '3', cultLeader: 1, cultist: 0, offDuty: 3, mutinyGuns: 4 },
  { players: 10, sailors: '5', pirates: '4', cultLeader: 1, cultist: 0, offDuty: 3, mutinyGuns: 5 },
  { players: 11, sailors: '5', pirates: '4', cultLeader: 1, cultist: 1, offDuty: 3, mutinyGuns: 5 },
];

export interface NavigationDeckInfo {
  total: number;
  blue: { total: number; drunk: number; disarm: number };
  yellow: { total: number; cultUprising: number };
  red: { total: number; drunk: number; mermaid: number; telescope: number; arming: number };
  mapActions: { cabinSearch: number; flogging: number; cutTongue: number; feedKraken: number };
}

export function getNavigationDeckInfo(mode: VoyageMode): NavigationDeckInfo {
  if (mode === 'short') {
    return {
      total: 19,
      blue: { total: 5, drunk: 3, disarm: 2 },
      yellow: { total: 5, cultUprising: 5 },
      red: { total: 9, drunk: 5, mermaid: 2, telescope: 2, arming: 0 },
      mapActions: { cabinSearch: 3, flogging: 0, cutTongue: 0, feedKraken: 2 },
    };
  }
  return {
    total: 23,
    blue: { total: 6, drunk: 4, disarm: 2 },
    yellow: { total: 6, cultUprising: 6 },
    red: { total: 11, drunk: 5, mermaid: 2, telescope: 2, arming: 2 },
    mapActions: { cabinSearch: 4, flogging: 2, cutTongue: 1, feedKraken: 3 },
  };
}

export function getMutinyThreshold(playerCount: number): number {
  if (playerCount <= 7) return 3;
  if (playerCount <= 9) return 4;
  return 5;
}

export function getOffDutyCount(playerCount: number): number {
  if (playerCount <= 6) return 1;
  if (playerCount <= 8) return 2;
  return 3;
}

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateFactionDeck(
  playerCount: number,
  rng: () => number = Math.random
): { factions: Faction[]; fivePlayerRemovedFaction?: 'sailor' | 'pirate' } {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`Feed the Kraken requires ${MIN_PLAYERS}–${MAX_PLAYERS} players (got ${playerCount}).`);
  }

  if (playerCount === 5) {
    // Official 5-player rule (Rulebook p. 5):
    // Shuffle 3 Sailors + 2 Pirates, secretly remove 1, then add 1 Cult Leader & shuffle.
    const pool = shuffle<Faction>(['sailor', 'sailor', 'sailor', 'pirate', 'pirate'], rng);
    const removed = pool.pop() as 'sailor' | 'pirate';
    const deck = shuffle<Faction>([...pool, 'cult_leader'], rng);
    return { factions: deck, fivePlayerRemovedFaction: removed };
  }

  const counts: Record<number, { sailors: number; pirates: number; cultist: number }> = {
    6: { sailors: 3, pirates: 2, cultist: 0 },
    7: { sailors: 4, pirates: 2, cultist: 0 },
    8: { sailors: 4, pirates: 3, cultist: 0 },
    9: { sailors: 5, pirates: 3, cultist: 0 },
    10: { sailors: 5, pirates: 4, cultist: 0 },
    11: { sailors: 5, pirates: 4, cultist: 1 },
  };

  const cfg = counts[playerCount];
  const raw: Faction[] = [
    ...Array<Faction>(cfg.sailors).fill('sailor'),
    ...Array<Faction>(cfg.pirates).fill('pirate'),
    'cult_leader',
    ...Array<Faction>(cfg.cultist).fill('cultist'),
  ];

  return { factions: shuffle(raw, rng) };
}

export function createShuffledRitualDeck(rng: () => number = Math.random): RitualType[] {
  // Rulebook p. 3 & 15: 3x Conversion, 1x Gun Stash, 1x Enlightenment (Cult's Cabin Search)
  return shuffle<RitualType>(
    ['conversion', 'conversion', 'conversion', 'gun_stash', 'enlightenment'],
    rng
  );
}

export function factionToPublicGroup(faction: Faction): PublicFactionGroup {
  if (faction === 'sailor') return 'sailor';
  if (faction === 'pirate') return 'pirate';
  return 'cult';
}

export function getFloggingNonMatchingChoices(
  trueFaction: Faction,
  rng: () => number = Math.random
): [PublicFactionGroup, PublicFactionGroup] {
  const trueGroup = factionToPublicGroup(trueFaction);
  const allGroups: PublicFactionGroup[] = ['sailor', 'pirate', 'cult'];
  const remaining = allGroups.filter((g) => g !== trueGroup);
  const shuffled = shuffle(remaining, rng);
  return [shuffled[0], shuffled[1]];
}

/**
 * Rulebook p. 13, 14, 15:
 * Cult Leader cannot convert:
 * - themselves
 * - eliminated players
 * - players who were Cabin Searched
 * - players who were Flogged
 * - players already converted by the Cult Leader (knownConvertedIds)
 * Note: In 11-player games, the initial blind Cultist IS selectable (they put out a fist
 * so they don't reveal themselves; if picked, they recognize the Cult Leader).
 */
export function isEligibleForConversion(
  player: Player,
  cultLeaderId: string,
  knownConvertedIds: readonly string[]
): boolean {
  if (!player.alive) return false;
  if (player.id === cultLeaderId) return false;
  if (player.cabinSearched) return false;
  if (player.flogged) return false;
  if (knownConvertedIds.includes(player.id)) return false;
  return true;
}
