import Peer, { type DataConnection } from 'peerjs';
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
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  },
};

export class PeerHostTransport implements HostTransport {
  readonly mode = 'peerjs' as const;
  private peer: Peer | null = null;
  private connections = new Map<string, DataConnection>();
  private destroyed = false;

  start(roomCode: string, callbacks: HostTransportCallbacks): void {
    this.destroyed = false;
    const peerId = roomCodeToPeerId(roomCode);
    const peer = new Peer(peerId, PEER_CONFIG);
    this.peer = peer;

    peer.on('open', () => {
      if (!this.destroyed) {
        callbacks.onReady(roomCode.toUpperCase());
      }
    });

    peer.on('connection', (conn) => {
      const peerKey = conn.peer;
      this.connections.set(peerKey, conn);

      conn.on('data', (raw) => {
        if (this.destroyed) return;
        if (raw && typeof raw === 'object' && 'type' in raw) {
          callbacks.onMessage(peerKey, raw as ClientToHostMessage);
        }
      });

      conn.on('close', () => {
        if (this.connections.get(peerKey) === conn) {
          this.connections.delete(peerKey);
          callbacks.onPeerDisconnect(peerKey);
        }
      });

      conn.on('error', () => {
        if (this.connections.get(peerKey) === conn) {
          this.connections.delete(peerKey);
          callbacks.onPeerDisconnect(peerKey);
        }
      });
    });

    peer.on('disconnected', () => {
      if (!this.destroyed && peer && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          // ignore reconnect failure
        }
      }
    });

    peer.on('error', (err) => {
      if (this.destroyed) return;
      callbacks.onError(err.type || err.message || 'peer_error');
    });
  }

  sendToPeer(peerKey: string, msg: HostToClientMessage): void {
    const conn = this.connections.get(peerKey);
    if (conn && conn.open) {
      conn.send(msg);
    }
  }

  broadcastClose(): void {
    for (const conn of this.connections.values()) {
      if (conn.open) {
        try {
          conn.send({ type: 'ROOM_CLOSED' } satisfies HostToClientMessage);
        } catch {
          // ignore
        }
      }
    }
  }

  destroy(): void {
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
    this.openPeer();
  }

  private openPeer(): void {
    if (this.destroyed || !this.callbacks) return;
    this.callbacks.onStateChange(this.retryCount > 0 ? 'reconnecting' : 'connecting');

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }

    const peer = new Peer(PEER_CONFIG);
    this.peer = peer;

    peer.on('open', () => {
      if (this.destroyed) return;
      this.connectToHost();
    });

    peer.on('error', (err) => {
      if (this.destroyed || !this.callbacks) return;
      if (err.type === 'peer-unavailable') {
        this.callbacks.onError('room_not_found');
        this.callbacks.onStateChange('error');
        return;
      }
      this.scheduleReconnect();
    });

    peer.on('disconnected', () => {
      if (this.destroyed) return;
      this.scheduleReconnect();
    });
  }

  private connectToHost(): void {
    if (!this.peer || this.destroyed || !this.callbacks) return;
    const hostPeerId = roomCodeToPeerId(this.roomCode);
    const conn = this.peer.connect(hostPeerId, { reliable: true });
    this.conn = conn;

    const timeout = setTimeout(() => {
      if (!conn.open && !this.destroyed) {
        this.scheduleReconnect();
      }
    }, 9000);

    conn.on('open', () => {
      clearTimeout(timeout);
      if (this.destroyed || !this.callbacks) return;
      this.retryCount = 0;
      this.callbacks.onStateChange('connected');
      this.startHeartbeat();
    });

    conn.on('data', (raw) => {
      if (this.destroyed || !this.callbacks) return;
      if (raw && typeof raw === 'object' && 'type' in raw) {
        this.callbacks.onMessage(raw as HostToClientMessage);
      }
    });

    conn.on('close', () => {
      clearTimeout(timeout);
      this.stopHeartbeat();
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    });

    conn.on('error', () => {
      clearTimeout(timeout);
      this.stopHeartbeat();
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.conn && this.conn.open) {
        try {
          this.conn.send({ type: 'PING', ts: Date.now() } satisfies ClientToHostMessage);
        } catch {
          this.scheduleReconnect();
        }
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.callbacks || this.reconnectTimer) return;
    this.retryCount += 1;
    this.callbacks.onStateChange('reconnecting');
    const delay = Math.min(1500 * Math.pow(1.5, Math.min(this.retryCount, 5)), 10000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) {
        this.openPeer();
      }
    }, delay);
  }

  send(msg: ClientToHostMessage): void {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  reconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openPeer();
  }

  destroy(): void {
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
  }
}
