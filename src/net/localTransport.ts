import {
  generatePlayerId,
  type ClientToHostMessage,
  type HostToClientMessage,
} from './protocol';
import type {
  ClientTransport,
  ClientTransportCallbacks,
  HostTransport,
  HostTransportCallbacks,
} from './transport';

type WireEnvelope =
  | { dir: 'c2h'; from: string; msg: ClientToHostMessage }
  | { dir: 'c2h_disconnect'; from: string }
  | { dir: 'h2c'; to: string; msg: HostToClientMessage }
  | { dir: 'h2c_broadcast'; msg: HostToClientMessage };

function channelName(roomCode: string): string {
  return `ftk-local-room-${roomCode.trim().toUpperCase()}`;
}

/**
 * Same-browser multi-tab BroadcastChannel transport.
 * Activated via `?transport=local` for offline demos and automated multi-player Playwright E2E tests.
 */
export class LocalHostTransport implements HostTransport {
  readonly mode = 'local' as const;
  private channel: BroadcastChannel | null = null;

  start(roomCode: string, callbacks: HostTransportCallbacks): void {
    const code = roomCode.trim().toUpperCase();
    this.channel = new BroadcastChannel(channelName(code));
    this.channel.onmessage = (ev: MessageEvent<WireEnvelope>) => {
      const data = ev.data;
      if (!data) return;
      if (data.dir === 'c2h') {
        callbacks.onMessage(data.from, data.msg);
      } else if (data.dir === 'c2h_disconnect') {
        callbacks.onPeerDisconnect(data.from);
      }
    };
    setTimeout(() => callbacks.onReady(code), 10);
  }

  sendToPeer(peerKey: string, msg: HostToClientMessage): void {
    this.channel?.postMessage({ dir: 'h2c', to: peerKey, msg } satisfies WireEnvelope);
  }

  broadcastClose(): void {
    this.channel?.postMessage({
      dir: 'h2c_broadcast',
      msg: { type: 'ROOM_CLOSED' },
    } satisfies WireEnvelope);
  }

  destroy(): void {
    this.channel?.close();
    this.channel = null;
  }
}

export class LocalClientTransport implements ClientTransport {
  readonly mode = 'local' as const;
  private channel: BroadcastChannel | null = null;
  private clientKey = generatePlayerId();
  private callbacks: ClientTransportCallbacks | null = null;

  connect(roomCode: string, callbacks: ClientTransportCallbacks): void {
    this.callbacks = callbacks;
    callbacks.onStateChange('connecting');
    this.channel = new BroadcastChannel(channelName(roomCode));
    this.channel.onmessage = (ev: MessageEvent<WireEnvelope>) => {
      const data = ev.data;
      if (!data) return;
      if (data.dir === 'h2c' && data.to === this.clientKey) {
        callbacks.onMessage(data.msg);
      } else if (data.dir === 'h2c_broadcast') {
        callbacks.onMessage(data.msg);
      }
    };
    setTimeout(() => {
      this.callbacks?.onStateChange('connected');
    }, 20);
  }

  send(msg: ClientToHostMessage): void {
    this.channel?.postMessage({
      dir: 'c2h',
      from: this.clientKey,
      msg,
    } satisfies WireEnvelope);
  }

  reconnect(): void {
    this.callbacks?.onStateChange('connected');
  }

  destroy(): void {
    this.channel?.postMessage({
      dir: 'c2h_disconnect',
      from: this.clientKey,
    } satisfies WireEnvelope);
    this.channel?.close();
    this.channel = null;
  }
}
