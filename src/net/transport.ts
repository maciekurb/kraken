import type {
  ClientToHostMessage,
  ConnectionState,
  HostToClientMessage,
  TransportMode,
} from './protocol';

export interface HostTransportCallbacks {
  onReady: (roomCode: string) => void;
  onMessage: (peerKey: string, msg: ClientToHostMessage) => void;
  onPeerDisconnect: (peerKey: string) => void;
  onError: (error: string) => void;
}

export interface HostTransport {
  readonly mode: TransportMode;
  start(roomCode: string, callbacks: HostTransportCallbacks): void;
  sendToPeer(peerKey: string, msg: HostToClientMessage): void;
  broadcastClose(): void;
  destroy(): void;
}

export interface ClientTransportCallbacks {
  onStateChange: (state: ConnectionState) => void;
  onMessage: (msg: HostToClientMessage) => void;
  onError: (error: string) => void;
}

export interface ClientTransport {
  readonly mode: TransportMode;
  connect(roomCode: string, callbacks: ClientTransportCallbacks): void;
  send(msg: ClientToHostMessage): void;
  reconnect(): void;
  destroy(): void;
}
