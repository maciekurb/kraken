const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fnv1aHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export interface RoomCipher {
  readonly roomTopicId: string;
  encryptJson(payload: unknown): Promise<string>;
  decryptJson<T>(ciphertext: string): Promise<T | null>;
}

/**
 * Derives an opaque topic namespace and AES-256-GCM cipher from the room code
 * so messages relayed through public WSS brokers are not exposed in plaintext.
 */
export async function createRoomCipher(roomCode: string): Promise<RoomCipher> {
  const normalized = roomCode.trim().toUpperCase();
  const hasSubtle = typeof crypto !== 'undefined' && Boolean(crypto.subtle);

  if (!hasSubtle) {
    // Graceful fallback in non-subtle test contexts
    const fallbackId = fnv1aHex(`ftk-companion-v1-topic:${normalized}`);
    return {
      roomTopicId: fallbackId,
      async encryptJson(payload: unknown): Promise<string> {
        return `p1:${JSON.stringify(payload)}`;
      },
      async decryptJson<T>(raw: string): Promise<T | null> {
        if (!raw.startsWith('p1:')) return null;
        try {
          return JSON.parse(raw.slice(3)) as T;
        } catch {
          return null;
        }
      },
    };
  }

  const topicDigest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(`ftk-companion-v1-topic:${normalized}`)
  );
  const roomTopicId = bytesToHex(new Uint8Array(topicDigest)).slice(0, 20);

  const keyDigest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(`ftk-companion-v1-aes256:${normalized}`)
  );
  const aesKey = await crypto.subtle.importKey(
    'raw',
    keyDigest,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  return {
    roomTopicId,
    async encryptJson(payload: unknown): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plainBytes = textEncoder.encode(JSON.stringify(payload));
      const encrypted = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plainBytes)
      );
      const combined = new Uint8Array(iv.length + encrypted.length);
      combined.set(iv, 0);
      combined.set(encrypted, iv.length);
      return `e1:${bytesToBase64(combined)}`;
    },
    async decryptJson<T>(raw: string): Promise<T | null> {
      if (!raw.startsWith('e1:')) return null;
      try {
        const combined = base64ToBytes(raw.slice(3));
        if (combined.length <= 12) return null;
        const iv = combined.slice(0, 12);
        const cipherBytes = combined.slice(12);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipherBytes);
        return JSON.parse(textDecoder.decode(decrypted)) as T;
      } catch {
        return null;
      }
    },
  };
}
