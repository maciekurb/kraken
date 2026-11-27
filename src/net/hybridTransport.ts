import { logger } from '../debug/logger';
import { MqttRelayClientTransport, MqttRelayHostTransport } from './mqttTransport';
import { PeerClientTransport, PeerHostTransport } from './peerTransport';
import type { ClientToHostMessage, HostToClientMessage } from './protocol';
import type {
  ClientTransport,
  ClientTransportCallbacks,
  HostTransport,
  HostTransportCallbacks,
} from './transport';

const RTC_PREFIX = 'rtc:';
const WSS_PREFIX = 'wss:';

/**
 * Hybrid Host Transport: listens simultaneously on direct WebRTC P2P (PeerJS)
 * AND Encrypted WSS Relay (MQTT-over-WSS). Each joining client is routed back
 * through whichever transport they connected on — so LAN WebRTC peers and
 * iOS Safari / VPN / CGNAT / uBlock peers coexist seamlessly in the same room.
 */
export class HybridHostTransport implements HostTransport {
  readonly mode = 'peerjs' as const;
  private rtc = new PeerHostTransport();
  private wss = new MqttRelayHostTransport();
  private readyNotified = false;
  private rtcFailed = false;
  private wssFailed = false;
  private destroyed = false;

  start(roomCode: string, callbacks: HostTransportCallbacks): void {
    this.destroyed = false;
    this.readyNotified = false;
    this.rtcFailed = false;
    this.wssFailed = false;

    logger.info('HYBRID_NET', 'Starting HybridHostTransport (WebRTC P2P + Encrypted WSS Relay)', {
      roomCode,
    });

    const markReady = (source: 'rtc' | 'wss', code: string) => {
      logger.info('HYBRID_NET', `Host transport channel ready: ${source.toUpperCase()}`, {
        roomCode: code,
      });
      if (!this.readyNotified && !this.destroyed) {
        this.readyNotified = true;
        callbacks.onReady(code);
      }
    };

    const reportErrorIfBothFailed = (source: 'rtc' | 'wss', err: string) => {
      if (source === 'rtc') this.rtcFailed = true;
      else this.wssFailed = true;

      if (this.rtcFailed && this.wssFailed && !this.destroyed) {
        logger.error('HYBRID_NET', 'BOTH Host transports (WebRTC and WSS Relay) failed', {
          lastError: err,
        });
        callbacks.onError(err);
      } else {
        logger.warn(
          'HYBRID_NET',
          `Host ${source.toUpperCase()} transport failed, continuing on backup channel`,
          { err }
        );
      }
    };

    this.rtc.start(roomCode, {
      onReady: (code) => markReady('rtc', code),
      onMessage: (peerKey, msg) => callbacks.onMessage(`${RTC_PREFIX}${peerKey}`, msg),
      onPeerDisconnect: (peerKey) => callbacks.onPeerDisconnect(`${RTC_PREFIX}${peerKey}`),
      onError: (err) => reportErrorIfBothFailed('rtc', err),
    });

    this.wss.start(roomCode, {
      onReady: (code) => markReady('wss', code),
      onMessage: (peerKey, msg) => callbacks.onMessage(`${WSS_PREFIX}${peerKey}`, msg),
      onPeerDisconnect: (peerKey) => callbacks.onPeerDisconnect(`${WSS_PREFIX}${peerKey}`),
      onError: (err) => reportErrorIfBothFailed('wss', err),
    });
  }

  sendToPeer(peerKey: string, msg: HostToClientMessage): void {
    if (peerKey.startsWith(RTC_PREFIX)) {
      this.rtc.sendToPeer(peerKey.slice(RTC_PREFIX.length), msg);
    } else if (peerKey.startsWith(WSS_PREFIX)) {
      this.wss.sendToPeer(peerKey.slice(WSS_PREFIX.length), msg);
    } else {
      logger.warn('HYBRID_NET', 'Unknown peerKey prefix in sendToPeer', { peerKey });
    }
  }

  broadcastClose(): void {
    this.rtc.broadcastClose();
    this.wss.broadcastClose();
  }

  destroy(): void {
    logger.info('HYBRID_NET', 'Destroying HybridHostTransport');
    this.destroyed = true;
    this.rtc.destroy();
    this.wss.destroy();
  }
}

/**
 * Hybrid Client Transport:
 * 1. Starts WebRTC P2P first for fast direct LAN connections.
 * 2. Immediately activates Encrypted WSS Relay if:
 *    - Browser gathers 0 ICE candidates (e.g., iOS Safari Private Relay / Chrome uBlock / VPN), OR
 *    - WebRTC hasn't opened within 2.5s (e.g., Host has UDP blocked or symmetric NAT / 5G CGNAT), OR
 *    - PeerJS signaling fails or reports peer-unavailable (in case Host is reachable via WSS).
 * 3. Locks onto whichever channel connects first and cleans up the other.
 */
export class HybridClientTransport implements ClientTransport {
  readonly mode = 'peerjs' as const;
  private rtc: PeerClientTransport | null = null;
  private wss: MqttRelayClientTransport | null = null;
  private active: 'none' | 'rtc' | 'wss' = 'none';
  private wssStarted = false;
  private rtcPeerUnavailable = false;
  private receivedAnyHostMsg = false;
  private lastJoinMsg: ClientToHostMessage | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private joinRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private switchBrokerTimer: ReturnType<typeof setTimeout> | null = null;
  private joinTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private switchedBrokerOnce = false;
  private roomCode = '';
  private callbacks: ClientTransportCallbacks | null = null;
  private destroyed = false;

  connect(roomCode: string, callbacks: ClientTransportCallbacks): void {
    this.destroyed = false;
    this.roomCode = roomCode.trim().toUpperCase();
    this.callbacks = callbacks;
    this.active = 'none';
    this.wssStarted = false;
    this.rtcPeerUnavailable = false;
    this.receivedAnyHostMsg = false;
    this.switchedBrokerOnce = false;
    this.lastJoinMsg = null;

    logger.info('HYBRID_NET', 'Starting HybridClientTransport.connect', {
      roomCode: this.roomCode,
    });
    callbacks.onStateChange('connecting');

    this.rtc = new PeerClientTransport({
      onIceBlocked: (reason) => {
        logger.warn('HYBRID_NET', 'WebRTC ICE blocked locally — switching to Encrypted WSS Relay immediately', {
          reason,
        });
        this.activateWssFallback(`rtc_ice_blocked:${reason}`);
      },
    });

    this.rtc.connect(this.roomCode, {
      onStateChange: (state) => {
        if (this.destroyed) return;
        if (this.active === 'wss') return;
        if (state === 'connected') {
          this.lockTransport('rtc');
          callbacks.onStateChange('connected');
          return;
        }
        if (this.active === 'rtc') {
          callbacks.onStateChange(state);
        }
      },
      onMessage: (msg) => {
        if (this.destroyed || this.active === 'wss') return;
        this.onHostReplyReceived();
        callbacks.onMessage(msg);
      },
      onError: (err) => {
        if (this.destroyed || this.active === 'wss') return;
        if (err === 'room_not_found') {
          this.rtcPeerUnavailable = true;
          logger.info(
            'HYBRID_NET',
            'PeerJS reported peer-unavailable — probing Encrypted WSS Relay before declaring room_not_found'
          );
          this.activateWssFallback('rtc_peer_unavailable');
        } else {
          this.activateWssFallback(`rtc_error:${err}`);
        }
      },
    });

    // If direct WebRTC hasn't opened within 2.5s (e.g., Host has UDP blocked or symmetric NAT),
    // automatically start Encrypted WSS Relay in parallel!
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      if (!this.destroyed && this.active === 'none') {
        logger.info(
          'HYBRID_NET',
          'WebRTC did not open within 2500ms — activating Encrypted WSS Relay fallback'
        );
        this.activateWssFallback('rtc_2500ms_timeout');
      }
    }, 2500);
  }

  private activateWssFallback(reason: string): void {
    if (this.destroyed || this.wssStarted || this.active === 'rtc' || !this.callbacks) return;
    this.wssStarted = true;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }

    logger.info('HYBRID_NET', 'Activating Encrypted WSS Relay client channel', {
      reason,
      roomCode: this.roomCode,
    });

    const wss = new MqttRelayClientTransport();
    this.wss = wss;

    wss.connect(this.roomCode, {
      onStateChange: (state) => {
        if (this.destroyed || this.active === 'rtc') return;
        if (state === 'connected') {
          this.lockTransport('wss');
          this.callbacks?.onStateChange('connected');
          this.armWssJoinWatchdog();
          return;
        }
        if (this.active === 'wss') {
          this.callbacks?.onStateChange(state);
        }
      },
      onMessage: (msg) => {
        if (this.destroyed || this.active === 'rtc') return;
        this.onHostReplyReceived();
        this.callbacks?.onMessage(msg);
      },
      onError: (err) => {
        if (this.destroyed || this.active === 'rtc') return;
        logger.error('HYBRID_NET', 'Encrypted WSS Relay reported error', { err });
        this.callbacks?.onError(err);
      },
    });
  }

  private lockTransport(winner: 'rtc' | 'wss'): void {
    if (this.active === winner) return;
    this.active = winner;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }

    logger.info('HYBRID_NET', `Locked active client transport -> ${winner.toUpperCase()}`, {
      roomCode: this.roomCode,
    });

    if (winner === 'rtc' && this.wss) {
      this.wss.destroy();
      this.wss = null;
    } else if (winner === 'wss' && this.rtc) {
      this.rtc.destroy();
      this.rtc = null;
    }
  }

  private armWssJoinWatchdog(): void {
    this.clearJoinTimers();
    if (this.receivedAnyHostMsg) return;

    // Resend JOIN once after 1.5s in case Host was finishing broker subscription
    this.joinRetryTimer = setTimeout(() => {
      this.joinRetryTimer = null;
      if (!this.destroyed && !this.receivedAnyHostMsg && this.active === 'wss' && this.lastJoinMsg) {
        logger.debug('HYBRID_NET', 'No Host reply yet on WSS Relay — resending JOIN once');
        this.wss?.send(this.lastJoinMsg);
      }
    }, 1500);

    // If still no reply after 3.2s, try the alternate WSS broker once (handles asymmetric port blocks)
    if (!this.switchedBrokerOnce) {
      this.switchBrokerTimer = setTimeout(() => {
        this.switchBrokerTimer = null;
        if (!this.destroyed && !this.receivedAnyHostMsg && this.active === 'wss') {
          this.switchedBrokerOnce = true;
          this.wss?.tryNextBroker();
        }
      }, 3200);
    }

    // If Host still hasn't replied after 7.5s on WSS Relay, declare room_not_found cleanly
    this.joinTimeoutTimer = setTimeout(() => {
      this.joinTimeoutTimer = null;
      if (!this.destroyed && !this.receivedAnyHostMsg && this.active === 'wss') {
        logger.error('HYBRID_NET', 'No reply from Host on Encrypted WSS Relay after 7500ms', {
          roomCode: this.roomCode,
          rtcPeerUnavailable: this.rtcPeerUnavailable,
        });
        this.callbacks?.onError('room_not_found');
        this.callbacks?.onStateChange('error');
      }
    }, 7500);
  }

  private onHostReplyReceived(): void {
    if (!this.receivedAnyHostMsg) {
      this.receivedAnyHostMsg = true;
      this.clearJoinTimers();
      logger.info('HYBRID_NET', `First Host reply received via ${this.active.toUpperCase()}!`);
    }
  }

  private clearJoinTimers(): void {
    if (this.joinRetryTimer) {
      clearTimeout(this.joinRetryTimer);
      this.joinRetryTimer = null;
    }
    if (this.switchBrokerTimer) {
      clearTimeout(this.switchBrokerTimer);
      this.switchBrokerTimer = null;
    }
    if (this.joinTimeoutTimer) {
      clearTimeout(this.joinTimeoutTimer);
      this.joinTimeoutTimer = null;
    }
  }

  send(msg: ClientToHostMessage): void {
    if (msg.type === 'JOIN') {
      this.lastJoinMsg = msg;
    }
    if (this.active === 'rtc') {
      this.rtc?.send(msg);
    } else if (this.active === 'wss') {
      this.wss?.send(msg);
    } else {
      logger.warn('HYBRID_NET', 'Dropped send(): no active client transport locked yet', {
        type: msg.type,
      });
    }
  }

  reconnect(): void {
    if (this.destroyed) return;
    logger.info('HYBRID_NET', 'HybridClientTransport.reconnect() called', { active: this.active });
    if (this.active === 'wss' && this.wss) {
      this.wss.reconnect();
    } else if (this.active === 'rtc' && this.rtc) {
      this.rtc.reconnect();
    } else if (this.callbacks) {
      this.destroy();
      this.connect(this.roomCode, this.callbacks);
    }
  }

  destroy(): void {
    logger.info('HYBRID_NET', 'Destroying HybridClientTransport', { active: this.active });
    this.destroyed = true;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    this.clearJoinTimers();
    this.rtc?.destroy();
    this.rtc = null;
    this.wss?.destroy();
    this.wss = null;
    this.active = 'none';
  }
}
