import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acknowledgeRitualResult,
  addOrReconnectPlayer,
  cancelActivePhase,
  completeCabinSearch,
  completeFlogging,
  createLobbyState,
  dismissFeedKrakenNotice,
  forceAdvanceRitual,
  markPlayerOverboard,
  movePlayerSeat,
  pickFloggingCard,
  projectPlayerView,
  removePlayerFromLobby,
  resetToLobby,
  selectCabinSearchTarget,
  selectCutTongueTarget,
  selectFeedKrakenTarget,
  selectFloggingTarget,
  setCurrentCaptain,
  setEnlightenmentCommandTeam,
  setPlayerConnected,
  setVoyageMode,
  startCabinSearch,
  startCultRitualFromDeck,
  startCultRitualManual,
  startCutTongue,
  startFeedKraken,
  startFlogging,
  startGame,
  submitRitualAction,
  triggerGameEnd,
  type RitualSubmissionPayload,
} from '../engine/gameEngine';
import type {
  CommandTeamIds,
  HostGameState,
  PlayerView,
  RitualType,
  VoyageMode,
  WinningFaction,
} from '../engine/types';
import { LocalClientTransport, LocalHostTransport } from './localTransport';
import { PeerClientTransport, PeerHostTransport } from './peerTransport';
import {
  generatePlayerId,
  generateRoomCode,
  type ClientAction,
  type ConnectionState,
  type TransportMode,
} from './protocol';
import {
  clearSession,
  detectTransportMode,
  loadHostState,
  loadSession,
  saveHostState,
  saveSession,
  type SavedSession,
} from './sessionStore';
import type { ClientTransport, HostTransport } from './transport';

export interface HostActions {
  setVoyageMode: (mode: VoyageMode) => void;
  removePlayer: (playerId: string) => void;
  movePlayerSeat: (playerId: string, direction: -1 | 1) => void;
  startGame: () => void;
  resetToLobby: () => void;
  setCurrentCaptain: (captainId: string) => void;
  cancelActivePhase: () => void;
  startCabinSearch: (captainId?: string) => void;
  startFlogging: (captainId?: string) => void;
  startCutTongue: (captainId?: string) => void;
  startFeedKraken: (captainId?: string) => void;
  markPlayerOverboard: (targetId: string) => void;
  startCultRitualFromDeck: () => void;
  startCultRitualManual: (ritualType: RitualType) => void;
  setEnlightenmentCommandTeam: (team: CommandTeamIds) => void;
  forceAdvanceRitual: () => void;
  triggerGameEnd: (
    faction: WinningFaction,
    reason: 'port' | 'kraken_space' | 'cult_leader_fed'
  ) => void;
}

export interface PlayerActions {
  cabinSearchSelectTarget: (targetId: string) => void;
  cabinSearchComplete: () => void;
  floggingSelectTarget: (targetId: string) => void;
  floggingPickCard: (cardIndex: 0 | 1) => void;
  floggingComplete: () => void;
  cutTongueSelectTarget: (targetId: string) => void;
  feedKrakenSelectTarget: (targetId: string) => void;
  feedKrakenDismiss: () => void;
  submitRitual: (payload: RitualSubmissionPayload) => void;
  acknowledgeRitual: () => void;
}

export interface GameSession {
  view: PlayerView | null;
  connectionState: ConnectionState;
  error: string | null;
  transportMode: TransportMode;
  savedSession: SavedSession | null;
  clearError: () => void;
  hostRoom: (hostName: string, voyageMode?: VoyageMode, customRoomCode?: string) => void;
  joinRoom: (roomCode: string, playerName: string, existingPlayerId?: string) => void;
  resumeSavedSession: () => void;
  discardSavedSession: () => void;
  leaveRoom: () => void;
  hostActions: HostActions;
  playerActions: PlayerActions;
}

function applyClientAction(
  state: HostGameState,
  actorId: string,
  action: ClientAction
): HostGameState {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return state;

  const isHostOrCaptain = (captainId?: string) => actor.isHost || actor.id === captainId;

  switch (action.type) {
    case 'cabin_search_select_target':
      if (state.activePhase?.type === 'cabin_search' && isHostOrCaptain(state.activePhase.captainId)) {
        return selectCabinSearchTarget(state, action.targetId);
      }
      return state;
    case 'cabin_search_complete':
      if (state.activePhase?.type === 'cabin_search' && isHostOrCaptain(state.activePhase.captainId)) {
        return completeCabinSearch(state);
      }
      return state;
    case 'flogging_select_target':
      if (state.activePhase?.type === 'flogging' && isHostOrCaptain(state.activePhase.captainId)) {
        return selectFloggingTarget(state, action.targetId);
      }
      return state;
    case 'flogging_pick_card':
      if (state.activePhase?.type === 'flogging' && isHostOrCaptain(state.activePhase.captainId)) {
        return pickFloggingCard(state, action.cardIndex);
      }
      return state;
    case 'flogging_complete':
      if (state.activePhase?.type === 'flogging' && isHostOrCaptain(state.activePhase.captainId)) {
        return completeFlogging(state);
      }
      return state;
    case 'cut_tongue_select_target':
      if (state.activePhase?.type === 'cut_tongue' && isHostOrCaptain(state.activePhase.captainId)) {
        return selectCutTongueTarget(state, action.targetId);
      }
      return state;
    case 'feed_kraken_select_target':
      if (state.activePhase?.type === 'feed_kraken' && isHostOrCaptain(state.activePhase.captainId)) {
        return selectFeedKrakenTarget(state, action.targetId);
      }
      return state;
    case 'feed_kraken_dismiss':
      if (state.activePhase?.type === 'feed_kraken' && isHostOrCaptain(state.activePhase.captainId)) {
        return dismissFeedKrakenNotice(state);
      }
      return state;
    case 'ritual_submit':
      return submitRitualAction(state, actorId, action.payload);
    case 'ritual_acknowledge':
      return acknowledgeRitualResult(state, actorId);
    default:
      return state;
  }
}

export function useGameSession(): GameSession {
  const transportMode = useMemo(() => detectTransportMode(), []);
  const [view, setView] = useState<PlayerView | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(() =>
    loadSession(transportMode)
  );

  // Authoritative host state lives in a ref so it is NEVER accidentally rendered directly;
  // only the projected PlayerView for hostPlayerId goes into React state!
  const hostStateRef = useRef<HostGameState | null>(null);
  const hostPlayerIdRef = useRef<string | null>(null);
  const hostTransportRef = useRef<HostTransport | null>(null);
  const peerKeyToPlayerIdRef = useRef<Map<string, string>>(new Map());
  const playerIdToPeerKeyRef = useRef<Map<string, string>>(new Map());

  const clientTransportRef = useRef<ClientTransport | null>(null);
  const clientPlayerIdRef = useRef<string | null>(null);
  const clientNameRef = useRef<string>('');

  const cleanupTransports = useCallback(() => {
    if (hostTransportRef.current) {
      hostTransportRef.current.destroy();
      hostTransportRef.current = null;
    }
    if (clientTransportRef.current) {
      clientTransportRef.current.destroy();
      clientTransportRef.current = null;
    }
    peerKeyToPlayerIdRef.current.clear();
    playerIdToPeerKeyRef.current.clear();
    hostStateRef.current = null;
    hostPlayerIdRef.current = null;
    clientPlayerIdRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanupTransports();
    };
  }, [cleanupTransports]);

  // Auto-reconnect peer when returning from phone lock screen
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && clientTransportRef.current) {
        if (connectionState === 'reconnecting' || connectionState === 'error') {
          clientTransportRef.current.reconnect();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [connectionState]);

  const broadcastStateFromHost = useCallback(
    (nextState: HostGameState) => {
      hostStateRef.current = nextState;
      saveHostState(transportMode, nextState);

      const hostId = hostPlayerIdRef.current;
      if (hostId) {
        setView(projectPlayerView(nextState, hostId));
      }

      const transport = hostTransportRef.current;
      if (!transport) return;

      for (const [playerId, peerKey] of playerIdToPeerKeyRef.current.entries()) {
        if (nextState.players.some((p) => p.id === playerId)) {
          transport.sendToPeer(peerKey, {
            type: 'STATE_SYNC',
            view: projectPlayerView(nextState, playerId),
          });
        }
      }
    },
    [transportMode]
  );

  const mutateHostState = useCallback(
    (updater: (current: HostGameState) => HostGameState) => {
      const current = hostStateRef.current;
      if (!current) return;
      try {
        const next = updater(current);
        if (next !== current) {
          broadcastStateFromHost(next);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'action_failed');
      }
    },
    [broadcastStateFromHost]
  );

  const startHostWithState = useCallback(
    (initialState: HostGameState, hostId: string) => {
      cleanupTransports();
      setError(null);
      setConnectionState('connecting');

      hostPlayerIdRef.current = hostId;
      hostStateRef.current = initialState;

      const hostPlayer = initialState.players.find((p) => p.id === hostId);
      const session: SavedSession = {
        role: 'host',
        roomCode: initialState.roomCode,
        playerId: hostId,
        playerName: hostPlayer?.name ?? 'Captain',
        transportMode,
      };
      saveSession(session);
      setSavedSession(session);
      saveHostState(transportMode, initialState);
      setView(projectPlayerView(initialState, hostId));

      const transport: HostTransport =
        transportMode === 'local' ? new LocalHostTransport() : new PeerHostTransport();
      hostTransportRef.current = transport;

      transport.start(initialState.roomCode, {
        onReady: () => {
          setConnectionState('connected');
        },
        onMessage: (peerKey, msg) => {
          if (msg.type === 'PING') {
            transport.sendToPeer(peerKey, { type: 'PONG', ts: msg.ts });
            return;
          }

          if (msg.type === 'JOIN') {
            const current = hostStateRef.current;
            if (!current) return;
            const res = addOrReconnectPlayer(current, msg.playerId, msg.name);
            if (!res.accepted) {
              transport.sendToPeer(peerKey, {
                type: 'JOIN_REJECTED',
                reason: res.reason ?? 'join_rejected',
              });
              return;
            }

            // Map peerKey <-> playerId
            const oldPeerKey = playerIdToPeerKeyRef.current.get(msg.playerId);
            if (oldPeerKey && oldPeerKey !== peerKey) {
              peerKeyToPlayerIdRef.current.delete(oldPeerKey);
            }
            peerKeyToPlayerIdRef.current.set(peerKey, msg.playerId);
            playerIdToPeerKeyRef.current.set(msg.playerId, peerKey);

            hostStateRef.current = res.state;
            saveHostState(transportMode, res.state);

            // Send immediate JOIN_ACCEPTED to joining peer
            transport.sendToPeer(peerKey, {
              type: 'JOIN_ACCEPTED',
              playerId: msg.playerId,
              view: projectPlayerView(res.state, msg.playerId),
            });

            // Sync host & all other peers
            broadcastStateFromHost(res.state);
            return;
          }

          if (msg.type === 'ACTION') {
            const authenticatedPlayerId = peerKeyToPlayerIdRef.current.get(peerKey);
            if (!authenticatedPlayerId || authenticatedPlayerId !== msg.playerId) return;
            mutateHostState((curr) => applyClientAction(curr, authenticatedPlayerId, msg.action));
          }
        },
        onPeerDisconnect: (peerKey) => {
          const pid = peerKeyToPlayerIdRef.current.get(peerKey);
          if (!pid) return;
          peerKeyToPlayerIdRef.current.delete(peerKey);
          if (playerIdToPeerKeyRef.current.get(pid) === peerKey) {
            playerIdToPeerKeyRef.current.delete(pid);
          }
          mutateHostState((curr) => setPlayerConnected(curr, pid, false));
        },
        onError: (err) => {
          setError(err);
          setConnectionState('error');
        },
      });
    },
    [broadcastStateFromHost, cleanupTransports, mutateHostState, transportMode]
  );

  const hostRoom = useCallback(
    (hostName: string, voyageMode: VoyageMode = 'short', customRoomCode?: string) => {
      const code = (customRoomCode?.trim().toUpperCase() || generateRoomCode(4)).slice(0, 8);
      const hostId = generatePlayerId();
      const initial = createLobbyState(code, hostId, hostName, voyageMode);
      startHostWithState(initial, hostId);
    },
    [startHostWithState]
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string, existingPlayerId?: string) => {
      cleanupTransports();
      setError(null);
      const cleanCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const cleanName = playerName.trim() || 'Sailor';
      const playerId = existingPlayerId || generatePlayerId();

      clientPlayerIdRef.current = playerId;
      clientNameRef.current = cleanName;

      const session: SavedSession = {
        role: 'client',
        roomCode: cleanCode,
        playerId,
        playerName: cleanName,
        transportMode,
      };
      saveSession(session);
      setSavedSession(session);

      const transport: ClientTransport =
        transportMode === 'local' ? new LocalClientTransport() : new PeerClientTransport();
      clientTransportRef.current = transport;

      transport.connect(cleanCode, {
        onStateChange: (state) => {
          setConnectionState(state);
          if (state === 'connected') {
            transport.send({
              type: 'JOIN',
              playerId,
              name: cleanName,
            });
          }
        },
        onMessage: (msg) => {
          if (msg.type === 'JOIN_ACCEPTED') {
            setError(null);
            setView(msg.view);
          } else if (msg.type === 'STATE_SYNC') {
            setView(msg.view);
          } else if (msg.type === 'JOIN_REJECTED') {
            setError(msg.reason);
            setConnectionState('error');
            clearSession(transportMode);
            setSavedSession(null);
          } else if (msg.type === 'ROOM_CLOSED') {
            setError('room_closed');
            cleanupTransports();
            clearSession(transportMode);
            setSavedSession(null);
            setView(null);
            setConnectionState('disconnected');
          }
        },
        onError: (err) => {
          setError(err);
        },
      });
    },
    [cleanupTransports, transportMode]
  );

  const resumeSavedSession = useCallback(() => {
    const saved = loadSession(transportMode);
    if (!saved) return;
    if (saved.role === 'host') {
      const savedHostState = loadHostState(transportMode);
      if (savedHostState && savedHostState.roomCode === saved.roomCode) {
        // Mark non-host peers disconnected until they auto-reconnect
        const restored: HostGameState = {
          ...savedHostState,
          players: savedHostState.players.map((p) =>
            p.id === saved.playerId ? { ...p, connected: true } : { ...p, connected: false }
          ),
        };
        startHostWithState(restored, saved.playerId);
      } else {
        hostRoom(saved.playerName, 'short', saved.roomCode);
      }
    } else {
      joinRoom(saved.roomCode, saved.playerName, saved.playerId);
    }
  }, [hostRoom, joinRoom, startHostWithState, transportMode]);

  const discardSavedSession = useCallback(() => {
    clearSession(transportMode);
    setSavedSession(null);
  }, [transportMode]);

  const leaveRoom = useCallback(() => {
    if (hostTransportRef.current) {
      hostTransportRef.current.broadcastClose();
    }
    cleanupTransports();
    clearSession(transportMode);
    setSavedSession(null);
    setView(null);
    setError(null);
    setConnectionState('disconnected');
  }, [cleanupTransports, transportMode]);

  const dispatchPlayerAction = useCallback(
    (action: ClientAction) => {
      // If we are Host, execute directly on Host state
      if (hostStateRef.current && hostPlayerIdRef.current) {
        const actorId = hostPlayerIdRef.current;
        mutateHostState((curr) => applyClientAction(curr, actorId, action));
        return;
      }
      // Otherwise send over P2P DataChannel to Host
      if (clientTransportRef.current && clientPlayerIdRef.current) {
        clientTransportRef.current.send({
          type: 'ACTION',
          playerId: clientPlayerIdRef.current,
          action,
        });
      }
    },
    [mutateHostState]
  );

  const hostActions: HostActions = useMemo(
    () => ({
      setVoyageMode: (mode) => mutateHostState((s) => setVoyageMode(s, mode)),
      removePlayer: (pid) => mutateHostState((s) => removePlayerFromLobby(s, pid)),
      movePlayerSeat: (pid, dir) => mutateHostState((s) => movePlayerSeat(s, pid, dir)),
      startGame: () => mutateHostState((s) => startGame(s)),
      resetToLobby: () => mutateHostState((s) => resetToLobby(s)),
      setCurrentCaptain: (cid) => mutateHostState((s) => setCurrentCaptain(s, cid)),
      cancelActivePhase: () => mutateHostState((s) => cancelActivePhase(s)),
      startCabinSearch: (cid) => mutateHostState((s) => startCabinSearch(s, cid)),
      startFlogging: (cid) => mutateHostState((s) => startFlogging(s, cid)),
      startCutTongue: (cid) => mutateHostState((s) => startCutTongue(s, cid)),
      startFeedKraken: (cid) => mutateHostState((s) => startFeedKraken(s, cid)),
      markPlayerOverboard: (tid) => mutateHostState((s) => markPlayerOverboard(s, tid)),
      startCultRitualFromDeck: () => mutateHostState((s) => startCultRitualFromDeck(s)),
      startCultRitualManual: (rt) => mutateHostState((s) => startCultRitualManual(s, rt)),
      setEnlightenmentCommandTeam: (team) =>
        mutateHostState((s) => setEnlightenmentCommandTeam(s, team)),
      forceAdvanceRitual: () => mutateHostState((s) => forceAdvanceRitual(s)),
      triggerGameEnd: (faction, reason) =>
        mutateHostState((s) => triggerGameEnd(s, faction, reason)),
    }),
    [mutateHostState]
  );

  const playerActions: PlayerActions = useMemo(
    () => ({
      cabinSearchSelectTarget: (targetId) =>
        dispatchPlayerAction({ type: 'cabin_search_select_target', targetId }),
      cabinSearchComplete: () => dispatchPlayerAction({ type: 'cabin_search_complete' }),
      floggingSelectTarget: (targetId) =>
        dispatchPlayerAction({ type: 'flogging_select_target', targetId }),
      floggingPickCard: (cardIndex) =>
        dispatchPlayerAction({ type: 'flogging_pick_card', cardIndex }),
      floggingComplete: () => dispatchPlayerAction({ type: 'flogging_complete' }),
      cutTongueSelectTarget: (targetId) =>
        dispatchPlayerAction({ type: 'cut_tongue_select_target', targetId }),
      feedKrakenSelectTarget: (targetId) =>
        dispatchPlayerAction({ type: 'feed_kraken_select_target', targetId }),
      feedKrakenDismiss: () => dispatchPlayerAction({ type: 'feed_kraken_dismiss' }),
      submitRitual: (payload) => dispatchPlayerAction({ type: 'ritual_submit', payload }),
      acknowledgeRitual: () => dispatchPlayerAction({ type: 'ritual_acknowledge' }),
    }),
    [dispatchPlayerAction]
  );

  return {
    view,
    connectionState,
    error,
    transportMode,
    savedSession,
    clearError: () => setError(null),
    hostRoom,
    joinRoom,
    resumeSavedSession,
    discardSavedSession,
    leaveRoom,
    hostActions,
    playerActions,
  };
}
