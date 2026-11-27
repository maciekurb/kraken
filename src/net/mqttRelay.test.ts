import { describe, expect, it } from 'vitest';
import {
  decodeMqttPackets,
  decodeRemainingLength,
  encodeMqttConnect,
  encodeMqttDisconnect,
  encodeMqttPingReq,
  encodeMqttPublish,
  encodeMqttSubscribe,
  encodeRemainingLength,
} from './mqttClient';
import { createRoomCipher } from './roomCrypto';

describe('MQTT 3.1.1 Wire Codec', () => {
  it('encodes and decodes remaining length across 1-byte and multi-byte boundaries', () => {
    for (const n of [0, 1, 127, 128, 255, 16383, 16384, 65535]) {
      const encoded = encodeRemainingLength(n);
      const decoded = decodeRemainingLength(encoded, 0);
      expect(decoded).toEqual({ value: n, bytesRead: encoded.length });
    }
  });

  it('encodes CONNECT, SUBSCRIBE, PINGREQ, and DISCONNECT packets', () => {
    const conn = encodeMqttConnect('ftk_test_1', 30);
    expect(conn[0]).toBe(0x10);
    expect(new TextDecoder().decode(conn.slice(4, 8))).toBe('MQTT');

    const sub = encodeMqttSubscribe(7, ['ftk/v1/abc/c2h', 'ftk/v1/abc/all']);
    expect(sub[0]).toBe(0x82);

    expect(Array.from(encodeMqttPingReq())).toEqual([0xc0, 0x00]);
    expect(Array.from(encodeMqttDisconnect())).toEqual([0xe0, 0x00]);
  });

  it('decodes CONNACK, SUBACK, PUBLISH (including >128B payloads), PINGRESP, and partial chunks', () => {
    const largePayload = JSON.stringify({ type: 'STATE_SYNC', pad: 'x'.repeat(400) });
    const pub = encodeMqttPublish('ftk/v1/room/h2c/client1', largePayload);
    const connack = new Uint8Array([0x20, 0x02, 0x00, 0x00]);
    const suback = new Uint8Array([0x90, 0x03, 0x00, 0x01, 0x00]);
    const pingresp = new Uint8Array([0xd0, 0x00]);

    const combined = new Uint8Array(connack.length + suback.length + pub.length + pingresp.length);
    let offset = 0;
    for (const part of [connack, suback, pub, pingresp]) {
      combined.set(part, offset);
      offset += part.length;
    }

    // Split right in the middle of the PUBLISH packet to verify streaming reassembly
    const splitAt = connack.length + suback.length + 12;
    const first = decodeMqttPackets(combined.slice(0, splitAt));
    expect(first.packets).toEqual([
      { type: 'CONNACK', returnCode: 0 },
      { type: 'SUBACK', packetId: 1, returnCodes: [0] },
    ]);
    expect(first.remaining.length).toBe(12);

    const rest = new Uint8Array(first.remaining.length + (combined.length - splitAt));
    rest.set(first.remaining, 0);
    rest.set(combined.slice(splitAt), first.remaining.length);
    const second = decodeMqttPackets(rest);
    expect(second.remaining.length).toBe(0);
    expect(second.packets).toHaveLength(2);
    expect(second.packets[0]).toMatchObject({
      type: 'PUBLISH',
      topic: 'ftk/v1/room/h2c/client1',
      qos: 0,
    });
    if (second.packets[0].type === 'PUBLISH') {
      expect(new TextDecoder().decode(second.packets[0].payload)).toBe(largePayload);
    }
    expect(second.packets[1]).toEqual({ type: 'PINGRESP' });
  });
});

describe('Room Cipher (AES-256-GCM)', () => {
  it('encrypts and decrypts payloads for the same room code and rejects wrong room codes', async () => {
    const hostCipher = await createRoomCipher('sgu5');
    const clientCipher = await createRoomCipher(' SGU5 ');
    const wrongCipher = await createRoomCipher('ABCD');

    expect(hostCipher.roomTopicId).toBe(clientCipher.roomTopicId);
    expect(hostCipher.roomTopicId).not.toBe(wrongCipher.roomTopicId);
    expect(hostCipher.roomTopicId).not.toContain('SGU5');

    const payload = { kind: 'msg', msg: { type: 'JOIN', playerId: 'p1', name: 'Maciek' } };
    const encrypted = await clientCipher.encryptJson(payload);
    expect(encrypted).not.toContain('Maciek');
    expect(encrypted).not.toContain('JOIN');

    const decrypted = await hostCipher.decryptJson<typeof payload>(encrypted);
    expect(decrypted).toEqual(payload);

    const wrongDecrypted = await wrongCipher.decryptJson(encrypted);
    expect(wrongDecrypted).toBeNull();
  });
});
