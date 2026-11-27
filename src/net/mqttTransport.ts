import { logger } from '../debug/logger';
import { MqttWsClient } from './mqttClient';
import {
  generatePlayerId,
  type ClientToHostMessage,
  type HostToClientMessage,
} from './protocol';
import { createRoomCipher, type RoomCipher } from './roomCrypto';
import type {
  ClientTransport,
  ClientTransportCallbacks,
  HostTransport,
  HostTransportCallbacks,
} from './transport';

export const WSS_BROKERS = [
  'wss://test.mosquitto.org:8081',
  'wss://broker.emqx.io:8084/mqtt',
] as const;

type RelayC2HEnvelope =
  | { kind: 'msg'; from: string; msg: ClientToHostMessage }
  | { kind: 'disconnect'; from: string };

type RelayH2CEnvelope = { kind: 'msg'; msg: HostToClientMessage };

function c2hTopic(roomTopicId: string): string {
  return `ftk/v1/${roomTopicId}/c2h`;
}

function h2cTopic(roomTopicId: string, clientKey: string): string {
  return `ftk/v1/${roomTopicId}/h2c/${clientKey}`;
}

function h2cBroadcastTopic(roomTopicId: string): string {
  return `ftk/v1/${roomTopicId}/h2c/all`;
}

/**
 * Encrypted WSS Relay Host Transport.
 * Connects to all redundant WSS brokers concurrently so a client reaching ANY
 * working broker seamlessly reaches the Host with zero broker-mismatch risk.
 */
export class MqttRelayHostTransport implements HostTransport {
  readonly mode = 'peerjs' as const;
  private brokers: Array<MqttWsClient | null> = [];
  private reconnectTimers: Array<ReturnType<typeof setTimeout> | null> = [];
  private cipher: RoomCipher | null = null;
  private peerToBroker = new Map<string, number>();
  private peerLastSeen = new Map<string, number>();
  private livenessTimer: ReturnType<typeof setInterval> | null = null;
  private readyNotified = false;
  private destroyed = false;
  private callbacks: HostTransportCallbacks | null = null;
  private roomCode = '';

  start(roomCode: string, callbacks: HostTransportCallbacks): void {
    this.destroyed = false;
    this.readyNotified = false;
    this.callbacks = callbacks;
    this.roomCode = roomCode.trim().toUpperCase();
    this.brokers = WSS_BROKERS.map(() => null);
    this.reconnectTimers = WSS_BROKERS.map(() => null);

    logger.info('WSS_RELAY', 'Starting MqttRelayHostTransport', {
      roomCode: this.roomCode,
      brokers: WSS_BROKERS,
    });

    void createRoomCipher(this.roomCode).then((cipher) => {
      if (this.destroyed) return;
      this.cipher = cipher;

      let failedCount = 0;
      const openBroker = (idx: number) => {
        if (this.destroyed) return;
        const url = WSS_BROKERS[idx];
        const clientId = `ftk_h_${idx}_${Math.random().toString(36).slice(2, 10)}`;
        const client = new MqttWsClient(url, clientId, [c2hTopic(cipher.roomTopicId)], {
          onReady: () => {
            if (this.destroyed) return;
            logger.info('WSS_RELAY', `Host connected to WSS broker #${idx}`, {
              url,
              roomCode: this.roomCode,
            });
            if (!this.readyNotified) {
              this.readyNotified = true;
              this.callbacks?.onReady(this.roomCode);
            }
          },
          onMessage: (_topic, payloadText) => {
            if (this.destroyed || !this.cipher) return;
            void this.cipher.decryptJson<RelayC2HEnvelope>(payloadText).then((env) => {
              if (!env || this.destroyed) return;
              if (env.kind === 'msg') {
                const peerKey = env.from;
                this.peerToBroker.set(peerKey, idx);
                this.peerLastSeen.set(peerKey, Date.now());
                logger.debug('WSS_RELAY', `Host received ${env.msg.type} via broker #${idx}`, {
                  peerKey,
                });
                this.callbacks?.onMessage(peerKey, env.msg);
              } else if (env.kind === 'disconnect') {
                const peerKey = env.from;
                logger.info('WSS_RELAY', `Host received disconnect via broker #${idx}`, { peerKey });
                this.peerToBroker.delete(peerKey);
                this.peerLastSeen.delete(peerKey);
                this.callbacks?.onPeerDisconnect(peerKey);
              }
            });
          },
          onClose: (reason) => {
            if (this.destroyed) return;
            logger.warn('WSS_RELAY', `Host WSS broker #${idx} closed — scheduling reconnect`, {
              url,
              reason,
            });
            this.brokers[idx] = null;
            this.scheduleBrokerReconnect(idx, openBroker);
          },
          onError: (reason) => {
            if (this.destroyed) return;
            failedCount += 1;
            logger.warn('WSS_RELAY', `Host WSS broker #${idx} error`, { url, reason });
            this.brokers[idx] = null;
            this.scheduleBrokerReconnect(idx, openBroker);
            if (!this.readyNotified && failedCount >= WSS_BROKERS.length) {
              this.callbacks?.onError('wss_all_brokers_failed');
            }
          },
        });

        this.brokers[idx] = client;
        client.connect(5000);
      };

      for (let i = 0; i < WSS_BROKERS.length; i++) {
        openBroker(i);
      }

      // Mark silent WSS peers disconnected after 50s without PING/activity
      this.livenessTimer = setInterval(() => {
        if (this.destroyed) return;
        const now = Date.now();
        for (const [peerKey, lastSeen] of this.peerLastSeen.entries()) {
          if (now - lastSeen > 50000) {
            logger.warn('WSS_RELAY', 'WSS peer timed out (no heartbeat for 50s)', { peerKey });
            this.peerLastSeen.delete(peerKey);
            this.peerToBroker.delete(peerKey);
            this.callbacks?.onPeerDisconnect(peerKey);
          }
        }
      }, 15000);
    });
  }

  private scheduleBrokerReconnect(idx: number, openBroker: (i: number) => void): void {
    if (this.destroyed || this.reconnectTimers[idx]) return;
    this.reconnectTimers[idx] = setTimeout(() => {
      this.reconnectTimers[idx] = null;
      if (!this.destroyed) {
        openBroker(idx);
      }
    }, 4000);
  }

  sendToPeer(peerKey: string, msg: HostToClientMessage): void {
    const cipher = this.cipher;
    if (!cipher || this.destroyed) return;

    const preferredIdx = this.peerToBroker.get(peerKey) ?? 0;
    const client =
      this.brokers[preferredIdx]?.isReady
        ? this.brokers[preferredIdx]
        : this.brokers.find((b) => b?.isReady) ?? null;

    if (!client) {
      logger.warn('WSS_RELAY', 'Dropped Host sendToPeer: no ready WSS broker', {
        peerKey,
        type: msg.type,
      });
      return;
    }

    void cipher.encryptJson({ kind: 'msg', msg } satisfies RelayH2CEnvelope).then((encrypted) => {
      if (this.destroyed) return;
      const ok = client.publish(h2cTopic(cipher.roomTopicId, peerKey), encrypted);
      if (!ok) {
        logger.warn('WSS_RELAY', 'Host WSS publish returned false', { peerKey, type: msg.type });
      }
    });
  }

  broadcastClose(): void {
    const cipher = this.cipher;
    if (!cipher) return;
    logger.info('WSS_RELAY', 'Host broadcasting ROOM_CLOSED over WSS relay');
    void cipher
      .encryptJson({ kind: 'msg', msg: { type: 'ROOM_CLOSED' } } satisfies RelayH2CEnvelope)
      .then((encrypted) => {
        for (const broker of this.brokers) {
          if (broker?.isReady) {
            broker.publish(h2cBroadcastTopic(cipher.roomTopicId), encrypted);
          }
        }
      });
  }

  destroy(): void {
    logger.info('WSS_RELAY', 'Destroying MqttRelayHostTransport');
    this.destroyed = true;
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = null;
    }
    for (let i = 0; i < this.reconnectTimers.length; i++) {
      if (this.reconnectTimers[i]) {
        clearTimeout(this.reconnectTimers[i]!);
        this.reconnectTimers[i] = null;
      }
    }
    for (const broker of this.brokers) {
      broker?.destroy();
    }
    this.brokers = [];
    this.peerToBroker.clear();
    this.peerLastSeen.clear();
  }
}

/**
 * Encrypted WSS Relay Client Transport.
 * Cycles through redundant WSS brokers automatically and subscribes to its private
 * response topic before transitioning to 'connected'.
 */
export class MqttRelayClientTransport implements ClientTransport {
  readonly mode = 'peerjs' as const;
  private client: MqttWsClient | null = null;
  private cipher: RoomCipher | null = null;
  private clientKey = generatePlayerId();
  private roomCode = '';
  private callbacks: ClientTransportCallbacks | null = null;
  private brokerIndex = 0;
  private retryCount = 0;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  connect(roomCode: string, callbacks: ClientTransportCallbacks): void {
    this.destroyed = false;
    this.roomCode = roomCode.trim().toUpperCase();
    this.callbacks = callbacks;
    this.brokerIndex = 0;
    this.retryCount = 0;

    logger.info('WSS_RELAY', 'Starting MqttRelayClientTransport', {
      roomCode: this.roomCode,
      clientKey: this.clientKey,
      brokers: WSS_BROKERS,
    });

    callbacks.onStateChange('connecting');

    void createRoomCipher(this.roomCode).then((cipher) => {
      if (this.destroyed) return;
      this.cipher = cipher;
      this.openBroker();
    });
  }

  private openBroker(): void {
    if (this.destroyed || !this.cipher || !this.callbacks) return;
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }

    const cipher = this.cipher;
    const url = WSS_BROKERS[this.brokerIndex % WSS_BROKERS.length];
    const clientId = `ftk_c_${Math.random().toString(36).slice(2, 10)}`;
    const topics = [
      h2cTopic(cipher.roomTopicId, this.clientKey),
      h2cBroadcastTopic(cipher.roomTopicId),
    ];

    const client = new MqttWsClient(url, clientId, topics, {
      onReady: () => {
        if (this.destroyed || this.client !== client) return;
        this.retryCount = 0;
        logger.info('WSS_RELAY', 'Client connected to WSS relay broker!', {
          url,
          roomCode: this.roomCode,
          clientKey: this.clientKey,
        });
        this.callbacks?.onStateChange('connected');
        this.startHeartbeat();
      },
      onMessage: (_topic, payloadText) => {
        if (this.destroyed || this.client !== client || !this.cipher) return;
        void this.cipher.decryptJson<RelayH2CEnvelope>(payloadText).then((env) => {
          if (!env || this.destroyed) return;
          if (env.kind === 'msg') {
            if (env.msg.type === 'PONG') {
              logger.debug('WSS_RELAY', 'Client received PONG over WSS relay', {
                rttMs: Date.now() - env.msg.ts,
              });
            } else {
              logger.debug('WSS_RELAY', `Client received ${env.msg.type} over WSS relay`);
            }
            this.callbacks?.onMessage(env.msg);
          }
        });
      },
      onClose: (reason) => {
        if (this.destroyed || this.client !== client) return;
        this.stopHeartbeat();
        this.brokerIndex = (this.brokerIndex + 1) % WSS_BROKERS.length;
        this.scheduleReconnect(`close:${reason}`);
      },
      onError: (reason) => {
        if (this.destroyed || this.client !== client) return;
        this.stopHeartbeat();
        this.brokerIndex = (this.brokerIndex + 1) % WSS_BROKERS.length;
        this.scheduleReconnect(`error:${reason}`);
      },
    });

    this.client = client;
    client.connect(4500);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.client?.isReady) {
        this.send({ type: 'PING', ts: Date.now() });
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(reason: string): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.retryCount += 1;
    // Try the alternate broker immediately on first failure, then back off
    const delay =
      this.retryCount === 1
        ? 250
        : Math.min(1500 * Math.pow(1.5, Math.min(this.retryCount - 1, 5)), 8000);
    logger.warn('WSS_RELAY', 'Scheduling WSS relay client reconnect', {
      reason,
      retryCount: this.retryCount,
      nextBroker: WSS_BROKERS[this.brokerIndex % WSS_BROKERS.length],
      delayMs: Math.round(delay),
    });
    this.callbacks?.onStateChange('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) {
        this.openBroker();
      }
    }, delay);
  }

  send(msg: ClientToHostMessage): void {
    const cipher = this.cipher;
    const client = this.client;
    if (!cipher || !client || !client.isReady || this.destroyed) {
      logger.warn('WSS_RELAY', 'Dropped Client send(): WSS relay not ready', { type: msg.type });
      return;
    }
    void cipher
      .encryptJson({ kind: 'msg', from: this.clientKey, msg } satisfies RelayC2HEnvelope)
      .then((encrypted) => {
        if (this.destroyed || this.client !== client) return;
        client.publish(c2hTopic(cipher.roomTopicId), encrypted);
      });
  }

  reconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openBroker();
  }

  tryNextBroker(): void {
    if (this.destroyed || WSS_BROKERS.length < 2) return;
    this.brokerIndex = (this.brokerIndex + 1) % WSS_BROKERS.length;
    logger.info('WSS_RELAY', 'Switching client to alternate WSS broker', {
      nextBroker: WSS_BROKERS[this.brokerIndex],
    });
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openBroker();
  }

  destroy(): void {
    logger.info('WSS_RELAY', 'Destroying MqttRelayClientTransport');
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client?.isReady && this.cipher) {
      const sock = this.client;
      const cipher = this.cipher;
      this.client = null;
      void cipher
        .encryptJson({ kind: 'disconnect', from: this.clientKey } satisfies RelayC2HEnvelope)
        .then((encrypted) => {
          sock.publish(c2hTopic(cipher.roomTopicId), encrypted);
          setTimeout(() => sock.destroy(), 50);
        })
        .catch(() => sock.destroy());
      return;
    }
    this.client?.destroy();
    this.client = null;
  }
}
