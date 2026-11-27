import Peer, { type DataConnection } from 'peerjs';
import { logger, updateDiagnosticContext, type LogScope } from '../debug/logger';
import {
  roomCodeToPeerId,
  type ClientToHostMessage,
  type HostToClientMessage,
} from './protocol';
import type {
  ClientTransport,
  ClientTransportCallbacks,
  HostTransport,
  HostTransportCallbacks,
} from './transport';

const PEER_CONFIG = {
  debug: 3,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  },
};

function summarizeMessage(msg: ClientToHostMessage | HostToClientMessage): Record<string, unknown> {
  switch (msg.type) {
    case 'JOIN':
      return { type: msg.type, playerId: msg.playerId, name: msg.name };
    case 'ACTION':
      return { type: msg.type, playerId: msg.playerId, actionType: msg.action.type };
    case 'PING':
    case 'PONG':
      return { type: msg.type, ts: msg.ts };
    case 'JOIN_ACCEPTED':
      return {
        type: msg.type,
        playerId: msg.playerId,
        roomCode: msg.view.roomCode,
        phase: msg.view.phase,
        playerCount: msg.view.players.length,
      };
    case 'JOIN_REJECTED':
      return { type: msg.type, reason: msg.reason };
    case 'STATE_SYNC':
      return {
        type: msg.type,
        roomCode: msg.view.roomCode,
        phase: msg.view.phase,
        activePhase: msg.view.activePhase?.type ?? null,
        playerCount: msg.view.players.length,
      };
    case 'ROOM_CLOSED':
      return { type: msg.type };
  }
}

function getConnSnapshot(conn: DataConnection | null): Record<string, unknown> {
  if (!conn) return { conn: null };
  const pc = conn.peerConnection;
  const dc = conn.dataChannel;
  return {
    remotePeer: conn.peer,
    connectionId: conn.connectionId,
    connOpen: conn.open,
    reliable: conn.reliable,
    serialization: conn.serialization,
    dcLabel: dc?.label,
    dcReadyState: dc?.readyState ?? 'none',
    iceConnectionState: pc?.iceConnectionState ?? 'none',
    iceGatheringState: pc?.iceGatheringState ?? 'none',
    pcConnectionState: pc?.connectionState ?? 'none',
    signalingState: pc?.signalingState ?? 'none',
  };
}

function attachRtcDiagnostics(scope: LogScope, tag: string, conn: DataConnection): void {
  logger.debug(scope, `${tag}: DataConnection created`, getConnSnapshot(conn));

  conn.on('iceStateChanged', (state) => {
    const level = state === 'failed' || state === 'disconnected' ? 'warn' : 'info';
    logger[level](scope, `${tag}: PeerJS iceStateChanged -> ${state}`, getConnSnapshot(conn));
  });

  const attachDcListeners = (dc: RTCDataChannel | undefined) => {
    if (!dc) return;
    logger.debug(scope, `${tag}: DataChannel present`, {
      label: dc.label,
      readyState: dc.readyState,
      ordered: dc.ordered,
      id: dc.id,
    });
    dc.addEventListener('open', () => {
      logger.info(scope, `${tag}: RTCDataChannel open`, { label: dc.label, readyState: dc.readyState });
    });
    dc.addEventListener('close', () => {
      logger.warn(scope, `${tag}: RTCDataChannel close`, { label: dc.label, readyState: dc.readyState });
    });
    dc.addEventListener('error', (ev) => {
      logger.error(scope, `${tag}: RTCDataChannel error`, {
        label: dc.label,
        readyState: dc.readyState,
        error: (ev as RTCErrorEvent).error ?? ev.type,
      });
    });
  };

  attachDcListeners(conn.dataChannel);

  const pc = conn.peerConnection;
  if (!pc) {
    logger.warn(scope, `${tag}: conn.peerConnection not yet initialized when attaching diagnostics`);
    return;
  }

  pc.addEventListener('iceconnectionstatechange', () => {
    const state = pc.iceConnectionState;
    const level = state === 'failed' ? 'error' : state === 'disconnected' || state === 'closed' ? 'warn' : 'info';
    logger[level](scope, `${tag}: RTCPeerConnection iceConnectionState -> ${state}`, getConnSnapshot(conn));
  });

  pc.addEventListener('connectionstatechange', () => {
    const state = pc.connectionState;
    const level = state === 'failed' ? 'error' : state === 'disconnected' || state === 'closed' ? 'warn' : 'info';
    logger[level](scope, `${tag}: RTCPeerConnection connectionState -> ${state}`, getConnSnapshot(conn));
  });

  pc.addEventListener('icegatheringstatechange', () => {
    logger.debug(scope, `${tag}: RTCPeerConnection iceGatheringState -> ${pc.iceGatheringState}`);
  });

  pc.addEventListener('signalingstatechange', () => {
    logger.debug(scope, `${tag}: RTCPeerConnection signalingState -> ${pc.signalingState}`);
  });

  pc.addEventListener('icecandidate', (ev) => {
    if (!ev.candidate) {
      logger.debug(scope, `${tag}: ICE candidate gathering complete`);
      return;
    }
    const c = ev.candidate;
    logger.debug(scope, `${tag}: Local ICE candidate`, {
      type: c.type,
      protocol: c.protocol,
      port: c.port,
      component: c.component,
      relatedPort: c.relatedPort,
    });
  });

  pc.addEventListener('icecandidateerror', (ev) => {
    const iceErr = ev as RTCPeerConnectionIceErrorEvent;
    logger.warn(scope, `${tag}: ICE candidate error`, {
      errorCode: iceErr.errorCode,
      errorText: iceErr.errorText,
      url: iceErr.url,
    });
  });

  pc.addEventListener('datachannel', (ev) => {
    logger.info(scope, `${tag}: RTCPeerConnection received remote datachannel`, {
      label: ev.channel.label,
      readyState: ev.channel.readyState,
    });
    attachDcListeners(ev.channel);
  });
}

export class PeerHostTransport implements HostTransport {
  readonly mode = 'peerjs' as const;
  private peer: Peer | null = null;
  private connections = new Map<string, DataConnection>();
  private destroyed = false;

  start(roomCode: string, callbacks: HostTransportCallbacks): void {
    this.destroyed = false;
    const peerId = roomCodeToPeerId(roomCode);
    logger.info('PEER_HOST', 'Starting PeerHostTransport', {
      roomCode,
      peerId,
      iceServers: PEER_CONFIG.config.iceServers,
    });

    const peer = new Peer(peerId, PEER_CONFIG);
    this.peer = peer;

    peer.on('open', (assignedId) => {
      logger.info('PEER_HOST', 'Host PeerJS signaling open', {
        assignedId,
        roomCode: roomCode.toUpperCase(),
        destroyed: this.destroyed,
      });
      updateDiagnosticContext({ peerId: assignedId });
      if (!this.destroyed) {
        callbacks.onReady(roomCode.toUpperCase());
      }
    });

    peer.on('connection', (conn) => {
      const peerKey = conn.peer;
      logger.info('PEER_HOST', 'Incoming DataConnection from client', {
        peerKey,
        connectionId: conn.connectionId,
        connOpen: conn.open,
        existingCount: this.connections.size,
      });
      this.connections.set(peerKey, conn);
      attachRtcDiagnostics('PEER_HOST', `host<-${peerKey.slice(-6)}`, conn);

      conn.on('open', () => {
        logger.info('PEER_HOST', 'Client DataConnection open', getConnSnapshot(conn));
      });

      conn.on('data', (raw) => {
        if (this.destroyed) {
          logger.debug('PEER_HOST', 'Ignoring data after destroy', { peerKey });
          return;
        }
        if (raw && typeof raw === 'object' && 'type' in raw) {
          const msg = raw as ClientToHostMessage;
          logger.debug('PEER_HOST', 'Received message from client', {
            peerKey,
            connOpen: conn.open,
            msg: summarizeMessage(msg),
          });
          callbacks.onMessage(peerKey, msg);
        } else {
          logger.warn('PEER_HOST', 'Received unrecognized payload from client', {
            peerKey,
            payloadType: typeof raw,
            raw,
          });
        }
      });

      conn.on('close', () => {
        logger.warn('PEER_HOST', 'Client DataConnection closed', getConnSnapshot(conn));
        if (this.connections.get(peerKey) === conn) {
          this.connections.delete(peerKey);
          callbacks.onPeerDisconnect(peerKey);
        }
      });

      conn.on('error', (err) => {
        logger.error('PEER_HOST', 'Client DataConnection error', {
          peerKey,
          error: err,
          snapshot: getConnSnapshot(conn),
        });
        if (this.connections.get(peerKey) === conn) {
          this.connections.delete(peerKey);
          callbacks.onPeerDisconnect(peerKey);
        }
      });
    });

    peer.on('disconnected', () => {
      logger.warn('PEER_HOST', 'Host PeerJS signaling disconnected', {
        destroyed: this.destroyed,
        peerDestroyed: peer.destroyed,
        activeConnections: this.connections.size,
      });
      if (!this.destroyed && peer && !peer.destroyed) {
        try {
          logger.info('PEER_HOST', 'Attempting Host PeerJS signaling reconnect');
          peer.reconnect();
        } catch (err) {
          logger.error('PEER_HOST', 'Host PeerJS reconnect threw error', err);
        }
      }
    });

    peer.on('close', () => {
      logger.warn('PEER_HOST', 'Host PeerJS peer closed', { destroyed: this.destroyed });
    });

    peer.on('error', (err) => {
      logger.error('PEER_HOST', 'Host PeerJS error event', {
        type: err.type,
        message: err.message,
        destroyed: this.destroyed,
        error: err,
      });
      if (this.destroyed) return;
      callbacks.onError(err.type || err.message || 'peer_error');
    });
  }

  sendToPeer(peerKey: string, msg: HostToClientMessage): void {
    const conn = this.connections.get(peerKey);
    if (conn && conn.open) {
      logger.debug('PEER_HOST', 'Sending message to client', {
        peerKey,
        msg: summarizeMessage(msg),
      });
      try {
        conn.send(msg);
      } catch (err) {
        logger.error('PEER_HOST', 'conn.send threw error', {
          peerKey,
          msg: summarizeMessage(msg),
          error: err,
        });
      }
    } else {
      logger.warn('PEER_HOST', 'Dropped sendToPeer because connection is missing or not open!', {
        peerKey,
        msg: summarizeMessage(msg),
        connExists: Boolean(conn),
        snapshot: getConnSnapshot(conn ?? null),
      });
    }
  }

  broadcastClose(): void {
    logger.info('PEER_HOST', 'Broadcasting ROOM_CLOSED to connected peers', {
      peerCount: this.connections.size,
    });
    for (const [peerKey, conn] of this.connections.entries()) {
      if (conn.open) {
        try {
          conn.send({ type: 'ROOM_CLOSED' } satisfies HostToClientMessage);
        } catch (err) {
          logger.warn('PEER_HOST', 'Failed sending ROOM_CLOSED to peer', { peerKey, error: err });
        }
      }
    }
  }

  destroy(): void {
    logger.info('PEER_HOST', 'Destroying PeerHostTransport', {
      openConnections: this.connections.size,
    });
    this.destroyed = true;
    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    this.connections.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
    updateDiagnosticContext({ peerId: null });
  }
}

export class PeerClientTransport implements ClientTransport {
  readonly mode = 'peerjs' as const;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private roomCode = '';
  private callbacks: ClientTransportCallbacks | null = null;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private retryCount = 0;

  connect(roomCode: string, callbacks: ClientTransportCallbacks): void {
    this.destroyed = false;
    this.roomCode = roomCode.trim().toUpperCase();
    this.callbacks = callbacks;
    this.retryCount = 0;
    logger.info('PEER_CLIENT', 'Starting PeerClientTransport.connect', {
      roomCode: this.roomCode,
      targetHostPeerId: roomCodeToPeerId(this.roomCode),
      iceServers: PEER_CONFIG.config.iceServers,
    });
    this.openPeer();
  }

  private openPeer(): void {
    if (this.destroyed || !this.callbacks) {
      logger.debug('PEER_CLIENT', 'openPeer skipped (destroyed or no callbacks)');
      return;
    }
    const nextState = this.retryCount > 0 ? 'reconnecting' : 'connecting';
    logger.info('PEER_CLIENT', 'Opening client PeerJS instance', {
      retryCount: this.retryCount,
      state: nextState,
      roomCode: this.roomCode,
    });
    this.callbacks.onStateChange(nextState);

    if (this.peer) {
      logger.debug('PEER_CLIENT', 'Destroying previous client Peer instance before recreating');
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }

    const peer = new Peer(PEER_CONFIG);
    this.peer = peer;

    peer.on('open', (assignedId) => {
      logger.info('PEER_CLIENT', 'Client PeerJS signaling open', {
        assignedId,
        destroyed: this.destroyed,
      });
      updateDiagnosticContext({ peerId: assignedId });
      if (this.destroyed) return;
      this.connectToHost();
    });

    peer.on('error', (err) => {
      logger.error('PEER_CLIENT', 'Client PeerJS error event', {
        type: err.type,
        message: err.message,
        roomCode: this.roomCode,
        retryCount: this.retryCount,
        destroyed: this.destroyed,
        error: err,
      });
      if (this.destroyed || !this.callbacks) return;
      if (err.type === 'peer-unavailable') {
        this.callbacks.onError('room_not_found');
        this.callbacks.onStateChange('error');
        return;
      }
      this.scheduleReconnect(`peer_error:${err.type || err.message || 'unknown'}`);
    });

    peer.on('disconnected', () => {
      logger.warn('PEER_CLIENT', 'Client PeerJS signaling disconnected', {
        destroyed: this.destroyed,
        connOpen: this.conn?.open ?? false,
      });
      if (this.destroyed) return;
      this.scheduleReconnect('peer_disconnected');
    });

    peer.on('close', () => {
      logger.warn('PEER_CLIENT', 'Client PeerJS peer closed', { destroyed: this.destroyed });
    });
  }

  private connectToHost(): void {
    if (!this.peer || this.destroyed || !this.callbacks) return;
    const hostPeerId = roomCodeToPeerId(this.roomCode);
    logger.info('PEER_CLIENT', 'Calling peer.connect() to host', {
      hostPeerId,
      localPeerId: this.peer.id,
      reliable: true,
    });
    const conn = this.peer.connect(hostPeerId, { reliable: true });
    this.conn = conn;
    attachRtcDiagnostics('PEER_CLIENT', `client->${this.roomCode}`, conn);

    const connectStartedAt = Date.now();
    const timeout = setTimeout(() => {
      if (!conn.open && !this.destroyed) {
        logger.error('PEER_CLIENT', 'Connection to host TIMED OUT after 9000ms before conn.open', {
          elapsedMs: Date.now() - connectStartedAt,
          hostPeerId,
          peerOpen: this.peer?.open,
          peerDisconnected: this.peer?.disconnected,
          snapshot: getConnSnapshot(conn),
        });
        this.scheduleReconnect('connect_timeout_9000ms');
      }
    }, 9000);

    conn.on('open', () => {
      clearTimeout(timeout);
      logger.info('PEER_CLIENT', 'Client DataConnection OPEN to host!', {
        elapsedMs: Date.now() - connectStartedAt,
        snapshot: getConnSnapshot(conn),
      });
      if (this.destroyed || !this.callbacks) return;
      this.retryCount = 0;
      this.callbacks.onStateChange('connected');
      this.startHeartbeat();
    });

    conn.on('data', (raw) => {
      if (this.destroyed || !this.callbacks) return;
      if (raw && typeof raw === 'object' && 'type' in raw) {
        const msg = raw as HostToClientMessage;
        if (msg.type === 'PONG') {
          logger.debug('PEER_CLIENT', 'Received PONG from host', {
            rttMs: Date.now() - msg.ts,
          });
        } else {
          logger.debug('PEER_CLIENT', 'Received message from host', summarizeMessage(msg));
        }
        this.callbacks.onMessage(msg);
      } else {
        logger.warn('PEER_CLIENT', 'Received unrecognized payload from host', {
          payloadType: typeof raw,
          raw,
        });
      }
    });

    conn.on('close', () => {
      clearTimeout(timeout);
      this.stopHeartbeat();
      logger.warn('PEER_CLIENT', 'Client DataConnection closed', getConnSnapshot(conn));
      if (!this.destroyed) {
        this.scheduleReconnect('conn_close');
      }
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      this.stopHeartbeat();
      logger.error('PEER_CLIENT', 'Client DataConnection error', {
        error: err,
        snapshot: getConnSnapshot(conn),
      });
      if (!this.destroyed) {
        this.scheduleReconnect('conn_error');
      }
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.conn && this.conn.open) {
        const ts = Date.now();
        logger.debug('PEER_CLIENT', 'Sending heartbeat PING', { ts });
        try {
          this.conn.send({ type: 'PING', ts } satisfies ClientToHostMessage);
        } catch (err) {
          logger.error('PEER_CLIENT', 'Heartbeat PING send failed', err);
          this.scheduleReconnect('heartbeat_send_error');
        }
      } else {
        logger.warn('PEER_CLIENT', 'Heartbeat skipped: conn not open', getConnSnapshot(this.conn));
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(reason = 'unknown'): void {
    if (this.destroyed || !this.callbacks) return;
    if (this.reconnectTimer) {
      logger.debug('PEER_CLIENT', 'scheduleReconnect ignored (timer already pending)', { reason });
      return;
    }
    this.retryCount += 1;
    const delay = Math.min(1500 * Math.pow(1.5, Math.min(this.retryCount, 5)), 10000);
    logger.warn('PEER_CLIENT', 'Scheduling client reconnect', {
      reason,
      retryCount: this.retryCount,
      delayMs: Math.round(delay),
    });
    this.callbacks.onStateChange('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) {
        this.openPeer();
      }
    }, delay);
  }

  send(msg: ClientToHostMessage): void {
    if (this.conn && this.conn.open) {
      logger.debug('PEER_CLIENT', 'Sending message to host', summarizeMessage(msg));
      try {
        this.conn.send(msg);
      } catch (err) {
        logger.error('PEER_CLIENT', 'Client conn.send threw error', {
          msg: summarizeMessage(msg),
          error: err,
        });
      }
    } else {
      logger.warn('PEER_CLIENT', 'Dropped send() because connection is missing or not open!', {
        msg: summarizeMessage(msg),
        snapshot: getConnSnapshot(this.conn),
      });
    }
  }

  reconnect(): void {
    logger.info('PEER_CLIENT', 'Manual reconnect() invoked', { destroyed: this.destroyed });
    if (this.destroyed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openPeer();
  }

  destroy(): void {
    logger.info('PEER_CLIENT', 'Destroying PeerClientTransport', {
      roomCode: this.roomCode,
      retryCount: this.retryCount,
    });
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        // ignore
      }
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
    updateDiagnosticContext({ peerId: null });
  }
}
