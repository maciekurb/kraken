import { logger } from '../debug/logger';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type MqttIncomingPacket =
  | { type: 'CONNACK'; returnCode: number }
  | { type: 'SUBACK'; packetId: number; returnCodes: number[] }
  | { type: 'PUBLISH'; topic: string; payload: Uint8Array; qos: number }
  | { type: 'PINGRESP' };

export function encodeRemainingLength(length: number): Uint8Array {
  const bytes: number[] = [];
  let x = length;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) {
      encodedByte |= 0x80;
    }
    bytes.push(encodedByte);
  } while (x > 0);
  return new Uint8Array(bytes);
}

export function decodeRemainingLength(
  buffer: Uint8Array,
  offset: number
): { value: number; bytesRead: number } | null {
  let multiplier = 1;
  let value = 0;
  let bytesRead = 0;
  while (offset + bytesRead < buffer.length) {
    const encodedByte = buffer[offset + bytesRead];
    bytesRead += 1;
    value += (encodedByte & 127) * multiplier;
    if ((encodedByte & 128) === 0) {
      return { value, bytesRead };
    }
    multiplier *= 128;
    if (bytesRead >= 4) {
      throw new Error('Malformed MQTT remaining length');
    }
  }
  return null;
}

function encodeUtf8String(str: string): Uint8Array {
  const bytes = textEncoder.encode(str);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function encodeMqttConnect(clientId: string, keepAliveSec = 30): Uint8Array {
  const protoName = encodeUtf8String('MQTT');
  const clientIdField = encodeUtf8String(clientId);
  const variableHeader = concatBytes([
    protoName,
    new Uint8Array([
      4, // Protocol Level 4 = MQTT 3.1.1
      0x02, // Clean Session
      (keepAliveSec >> 8) & 0xff,
      keepAliveSec & 0xff,
    ]),
  ]);
  const body = concatBytes([variableHeader, clientIdField]);
  const remLen = encodeRemainingLength(body.length);
  return concatBytes([new Uint8Array([0x10]), remLen, body]);
}

export function encodeMqttSubscribe(packetId: number, topics: string[]): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff])];
  for (const topic of topics) {
    parts.push(encodeUtf8String(topic));
    parts.push(new Uint8Array([0x00])); // QoS 0
  }
  const body = concatBytes(parts);
  const remLen = encodeRemainingLength(body.length);
  return concatBytes([new Uint8Array([0x82]), remLen, body]);
}

export function encodeMqttPublish(topic: string, payload: Uint8Array | string): Uint8Array {
  const topicField = encodeUtf8String(topic);
  const payloadBytes = typeof payload === 'string' ? textEncoder.encode(payload) : payload;
  const body = concatBytes([topicField, payloadBytes]);
  const remLen = encodeRemainingLength(body.length);
  return concatBytes([new Uint8Array([0x30]), remLen, body]); // PUBLISH QoS 0
}

export function encodeMqttPingReq(): Uint8Array {
  return new Uint8Array([0xc0, 0x00]);
}

export function encodeMqttDisconnect(): Uint8Array {
  return new Uint8Array([0xe0, 0x00]);
}

export function decodeMqttPackets(buffer: Uint8Array): {
  packets: MqttIncomingPacket[];
  remaining: Uint8Array;
} {
  const packets: MqttIncomingPacket[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 2 > buffer.length) break;
    const headerByte = buffer[offset];
    const packetType = (headerByte >> 4) & 0x0f;
    const remInfo = decodeRemainingLength(buffer, offset + 1);
    if (!remInfo) break;

    const totalLen = 1 + remInfo.bytesRead + remInfo.value;
    if (offset + totalLen > buffer.length) break;

    const payloadStart = offset + 1 + remInfo.bytesRead;
    const payloadEnd = offset + totalLen;

    if (packetType === 2 && remInfo.value >= 2) {
      // CONNACK
      packets.push({ type: 'CONNACK', returnCode: buffer[payloadStart + 1] });
    } else if (packetType === 9 && remInfo.value >= 2) {
      // SUBACK
      const packetId = (buffer[payloadStart] << 8) | buffer[payloadStart + 1];
      const returnCodes = Array.from(buffer.slice(payloadStart + 2, payloadEnd));
      packets.push({ type: 'SUBACK', packetId, returnCodes });
    } else if (packetType === 3) {
      // PUBLISH
      const qos = (headerByte >> 1) & 0x03;
      const topicLen = (buffer[payloadStart] << 8) | buffer[payloadStart + 1];
      const topicStart = payloadStart + 2;
      const topicEnd = topicStart + topicLen;
      const topic = textDecoder.decode(buffer.slice(topicStart, topicEnd));
      const dataStart = qos > 0 ? topicEnd + 2 : topicEnd;
      const payload = buffer.slice(dataStart, payloadEnd);
      packets.push({ type: 'PUBLISH', topic, payload, qos });
    } else if (packetType === 13) {
      // PINGRESP
      packets.push({ type: 'PINGRESP' });
    }

    offset += totalLen;
  }

  return {
    packets,
    remaining: offset < buffer.length ? buffer.slice(offset) : new Uint8Array(0),
  };
}

export interface MqttWsCallbacks {
  onReady: () => void;
  onMessage: (topic: string, payloadText: string) => void;
  onClose: (reason: string) => void;
  onError: (reason: string) => void;
}

/**
 * Minimal MQTT 3.1.1 over WSS client for browser environments.
 * Waits for CONNACK + SUBACK before firing onReady so no early replies are missed.
 */
export class MqttWsClient {
  private ws: WebSocket | null = null;
  private buffer = new Uint8Array(0);
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private ready = false;
  private nextPacketId = 1;
  private subscribedTopics: string[];
  private url: string;
  private clientId: string;
  private callbacks: MqttWsCallbacks;

  constructor(url: string, clientId: string, topics: string[], callbacks: MqttWsCallbacks) {
    this.url = url;
    this.clientId = clientId;
    this.subscribedTopics = topics;
    this.callbacks = callbacks;
  }

  get isReady(): boolean {
    return this.ready && !this.destroyed && this.ws?.readyState === WebSocket.OPEN;
  }

  connect(timeoutMs = 5000): void {
    this.destroyed = false;
    this.ready = false;
    this.buffer = new Uint8Array(0);

    logger.info('WSS_RELAY', 'Opening MQTT-over-WSS connection', {
      url: this.url,
      clientId: this.clientId,
      topics: this.subscribedTopics.length,
    });

    try {
      const ws = new WebSocket(this.url, 'mqtt');
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      this.connectTimer = setTimeout(() => {
        if (!this.ready && !this.destroyed) {
          logger.warn('WSS_RELAY', 'MQTT-over-WSS connect timed out', {
            url: this.url,
            readyState: ws.readyState,
          });
          this.closeInternal('connect_timeout');
          this.callbacks.onError('wss_connect_timeout');
        }
      }, timeoutMs);

      ws.onopen = () => {
        if (this.destroyed || this.ws !== ws) return;
        logger.debug('WSS_RELAY', 'WebSocket open — sending MQTT CONNECT', { url: this.url });
        ws.send(encodeMqttConnect(this.clientId, 30));
      };

      ws.onmessage = (ev) => {
        if (this.destroyed || this.ws !== ws) return;
        if (!(ev.data instanceof ArrayBuffer)) return;
        const chunk = new Uint8Array(ev.data);
        const combined = this.buffer.length > 0 ? concatBytes([this.buffer, chunk]) : chunk;
        try {
          const decoded = decodeMqttPackets(combined);
          this.buffer = new Uint8Array(decoded.remaining);
          for (const pkt of decoded.packets) {
            this.handlePacket(pkt);
          }
        } catch (err) {
          logger.error('WSS_RELAY', 'Failed decoding MQTT packet', { url: this.url, error: err });
        }
      };

      ws.onerror = () => {
        if (this.destroyed || this.ws !== ws) return;
        logger.warn('WSS_RELAY', 'WebSocket error event', { url: this.url, ready: this.ready });
        if (!this.ready) {
          this.clearTimers();
          this.callbacks.onError('wss_socket_error');
        }
      };

      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.clearTimers();
        const wasReady = this.ready;
        this.ready = false;
        this.ws = null;
        if (!this.destroyed) {
          logger.warn('WSS_RELAY', 'WebSocket closed', {
            url: this.url,
            code: ev.code,
            reason: ev.reason,
            wasReady,
          });
          this.callbacks.onClose(`ws_close_${ev.code}`);
        }
      };
    } catch (err) {
      logger.error('WSS_RELAY', 'Failed constructing WebSocket', { url: this.url, error: err });
      this.callbacks.onError('wss_construct_failed');
    }
  }

  private handlePacket(pkt: MqttIncomingPacket): void {
    if (pkt.type === 'CONNACK') {
      if (pkt.returnCode !== 0) {
        logger.error('WSS_RELAY', 'MQTT CONNACK rejected', {
          url: this.url,
          returnCode: pkt.returnCode,
        });
        this.closeInternal(`connack_${pkt.returnCode}`);
        this.callbacks.onError(`mqtt_connack_${pkt.returnCode}`);
        return;
      }
      logger.debug('WSS_RELAY', 'MQTT CONNACK ok — subscribing to room topics', {
        url: this.url,
        topics: this.subscribedTopics.length,
      });
      const pid = this.nextPacketId++;
      this.ws?.send(encodeMqttSubscribe(pid, this.subscribedTopics));
      return;
    }

    if (pkt.type === 'SUBACK') {
      if (!this.ready) {
        this.ready = true;
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
        this.startKeepAlive();
        logger.info('WSS_RELAY', 'MQTT-over-WSS ready (SUBACK received)', {
          url: this.url,
          returnCodes: pkt.returnCodes,
        });
        this.callbacks.onReady();
      }
      return;
    }

    if (pkt.type === 'PUBLISH') {
      const text = textDecoder.decode(pkt.payload);
      this.callbacks.onMessage(pkt.topic, text);
      return;
    }

    // PINGRESP ignored silently
  }

  private startKeepAlive(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(encodeMqttPingReq());
        } catch {
          // ignore
        }
      }
    }, 22000);
  }

  private clearTimers(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  publish(topic: string, payloadText: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.ready) {
      return false;
    }
    try {
      this.ws.send(encodeMqttPublish(topic, payloadText));
      return true;
    } catch (err) {
      logger.error('WSS_RELAY', 'MQTT publish failed', { url: this.url, error: err });
      return false;
    }
  }

  private closeInternal(reason: string): void {
    this.clearTimers();
    this.ready = false;
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      try {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(encodeMqttDisconnect());
        }
        sock.close(1000, reason);
      } catch {
        // ignore
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.closeInternal('client_destroy');
  }
}
