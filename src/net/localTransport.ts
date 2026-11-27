import { logger } from '../debug/logger';
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
  private currentChannelName = '';

  start(roomCode: string, callbacks: HostTransportCallbacks): void {
    const code = roomCode.trim().toUpperCase();
    this.currentChannelName = channelName(code);
    logger.info('LOCAL_NET', 'Starting LocalHostTransport', {
      roomCode: code,
      channel: this.currentChannelName,
    });
    this.channel = new BroadcastChannel(this.currentChannelName);
    this.channel.onmessage = (ev: MessageEvent<WireEnvelope>) => {
      const data = ev.data;
      if (!data) return;
      if (data.dir === 'c2h') {
        logger.debug('LOCAL_NET', 'Host received c2h message', {
          from: data.from,
          type: data.msg.type,
        });
        callbacks.onMessage(data.from, data.msg);
      } else if (data.dir === 'c2h_disconnect') {
        logger.info('LOCAL_NET', 'Host received c2h_disconnect', { from: data.from });
        callbacks.onPeerDisconnect(data.from);
      }
    };
    setTimeout(() => {
      logger.info('LOCAL_NET', 'LocalHostTransport ready', { roomCode: code });
      callbacks.onReady(code);
    }, 10);
  }

  sendToPeer(peerKey: string, msg: HostToClientMessage): void {
    logger.debug('LOCAL_NET', 'Host sending h2c message', { to: peerKey, type: msg.type });
    this.channel?.postMessage({ dir: 'h2c', to: peerKey, msg } satisfies WireEnvelope);
  }

  broadcastClose(): void {
    logger.info('LOCAL_NET', 'Host broadcasting ROOM_CLOSED', { channel: this.currentChannelName });
    this.channel?.postMessage({
      dir: 'h2c_broadcast',
      msg: { type: 'ROOM_CLOSED' },
    } satisfies WireEnvelope);
  }

  destroy(): void {
    logger.info('LOCAL_NET', 'Destroying LocalHostTransport', { channel: this.currentChannelName });
    this.channel?.close();
    this.channel = null;
  }
}

export class LocalClientTransport implements ClientTransport {
  readonly mode = 'local' as const;
  private channel: BroadcastChannel | null = null;
  private clientKey = generatePlayerId();
  private callbacks: ClientTransportCallbacks | null = null;
  private currentChannelName = '';

  connect(roomCode: string, callbacks: ClientTransportCallbacks): void {
    this.callbacks = callbacks;
    this.currentChannelName = channelName(roomCode);
    logger.info('LOCAL_NET', 'Connecting LocalClientTransport', {
      roomCode,
      clientKey: this.clientKey,
      channel: this.currentChannelName,
    });
    callbacks.onStateChange('connecting');
    this.channel = new BroadcastChannel(this.currentChannelName);
    this.channel.onmessage = (ev: MessageEvent<WireEnvelope>) => {
      const data = ev.data;
      if (!data) return;
      if (data.dir === 'h2c' && data.to === this.clientKey) {
        logger.debug('LOCAL_NET', 'Client received h2c message', { type: data.msg.type });
        callbacks.onMessage(data.msg);
      } else if (data.dir === 'h2c_broadcast') {
        logger.debug('LOCAL_NET', 'Client received h2c_broadcast message', { type: data.msg.type });
        callbacks.onMessage(data.msg);
      }
    };
    setTimeout(() => {
      logger.info('LOCAL_NET', 'LocalClientTransport connected', { clientKey: this.clientKey });
      this.callbacks?.onStateChange('connected');
    }, 20);
  }

  send(msg: ClientToHostMessage): void {
    logger.debug('LOCAL_NET', 'Client sending c2h message', {
      from: this.clientKey,
      type: msg.type,
    });
    this.channel?.postMessage({
      dir: 'c2h',
      from: this.clientKey,
      msg,
    } satisfies WireEnvelope);
  }

  reconnect(): void {
    logger.info('LOCAL_NET', 'LocalClientTransport reconnect()', { clientKey: this.clientKey });
    this.callbacks?.onStateChange('connected');
  }

  destroy(): void {
    logger.info('LOCAL_NET', 'Destroying LocalClientTransport', { clientKey: this.clientKey });
    this.channel?.postMessage({
      dir: 'c2h_disconnect',
      from: this.clientKey,
    } satisfies WireEnvelope);
    this.channel?.close();
    this.channel = null;
  }
}
