import { describe, expect, it } from 'vitest';
import { generateRoomCode, roomCodeToPeerId } from './protocol';

describe('P2P Protocol Helpers', () => {
  it('generates unambiguous 4-character room codes', () => {
    for (let i = 0; i < 30; i++) {
      const code = generateRoomCode(4);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    }
  });

  it('normalizes room codes into PeerJS IDs', () => {
    expect(roomCodeToPeerId(' ab-4k ')).toBe('ftk-companion-v1-AB4K');
  });
});
