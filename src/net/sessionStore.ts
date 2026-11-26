import type { HostGameState } from '../engine/types';
import type { TransportMode } from './protocol';

export interface SavedSession {
  role: 'host' | 'client';
  roomCode: string;
  playerId: string;
  playerName: string;
  transportMode: TransportMode;
}

const SESSION_KEY = 'ftk_session_v1';
const HOST_STATE_KEY = 'ftk_host_state_v1';
const NAME_KEY = 'ftk_last_name_v1';

function getStorage(mode: TransportMode): Storage {
  return mode === 'local' ? window.sessionStorage : window.localStorage;
}

export function detectTransportMode(): TransportMode {
  if (typeof window === 'undefined') return 'peerjs';
  const params = new URLSearchParams(window.location.search);
  return params.get('transport') === 'local' ? 'local' : 'peerjs';
}

export function saveSession(session: SavedSession): void {
  try {
    getStorage(session.transportMode).setItem(SESSION_KEY, JSON.stringify(session));
    if (session.playerName) {
      window.localStorage.setItem(NAME_KEY, session.playerName);
    }
  } catch {
    // ignore storage quota errors
  }
}

export function loadSession(mode: TransportMode): SavedSession | null {
  try {
    const raw = getStorage(mode).getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    if (parsed && parsed.roomCode && parsed.playerId && parsed.role) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession(mode: TransportMode): void {
  try {
    getStorage(mode).removeItem(SESSION_KEY);
    getStorage(mode).removeItem(HOST_STATE_KEY);
  } catch {
    // ignore
  }
}

export function saveHostState(mode: TransportMode, state: HostGameState): void {
  try {
    getStorage(mode).setItem(HOST_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function loadHostState(mode: TransportMode): HostGameState | null {
  try {
    const raw = getStorage(mode).getItem(HOST_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HostGameState;
  } catch {
    return null;
  }
}

export function loadLastPlayerName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
