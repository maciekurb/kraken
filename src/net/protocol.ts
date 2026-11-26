import type { PlayerView } from '../engine/types';
import type { RitualSubmissionPayload } from '../engine/gameEngine';

export type TransportMode = 'peerjs' | 'local';

export type ClientAction =
  | { type: 'cabin_search_select_target'; targetId: string }
  | { type: 'cabin_search_complete' }
  | { type: 'flogging_select_target'; targetId: string }
  | { type: 'flogging_pick_card'; cardIndex: 0 | 1 }
  | { type: 'flogging_complete' }
  | { type: 'cut_tongue_select_target'; targetId: string }
  | { type: 'feed_kraken_select_target'; targetId: string }
  | { type: 'feed_kraken_dismiss' }
  | { type: 'ritual_submit'; payload: RitualSubmissionPayload }
  | { type: 'ritual_acknowledge' };

export type ClientToHostMessage =
  | { type: 'JOIN'; playerId: string; name: string }
  | { type: 'ACTION'; playerId: string; action: ClientAction }
  | { type: 'PING'; ts: number };

export type HostToClientMessage =
  | { type: 'JOIN_ACCEPTED'; playerId: string; view: PlayerView }
  | { type: 'JOIN_REJECTED'; reason: string }
  | { type: 'STATE_SYNC'; view: PlayerView }
  | { type: 'ROOM_CLOSED' }
  | { type: 'PONG'; ts: number };

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 4): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

export function roomCodeToPeerId(roomCode: string): string {
  const clean = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `ftk-companion-v1-${clean}`;
}

export function generatePlayerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
