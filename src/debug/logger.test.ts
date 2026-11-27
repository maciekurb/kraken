import { describe, expect, it } from 'vitest';
import {
  clearLogs,
  formatLogLine,
  formatLogsForExport,
  getLogEntries,
  logger,
  updateDiagnosticContext,
} from './logger';

describe('Diagnostic Logger', () => {
  it('records structured logs and formats export text with diagnostic header', () => {
    clearLogs();
    updateDiagnosticContext({
      role: 'client',
      roomCode: 'AB12',
      transportMode: 'peerjs',
      connectionState: 'connecting',
    });

    const entry = logger.info('PEER_CLIENT', 'Testing join attempt', {
      roomCode: 'AB12',
      attempt: 1,
    });

    const all = getLogEntries();
    expect(all.some((e) => e.id === entry.id)).toBe(true);
    expect(formatLogLine(entry)).toContain('[INFO ] [PEER_CLIENT] Testing join attempt');

    const dump = formatLogsForExport();
    expect(dump).toContain('FEED THE KRAKEN COMPANION — DIAGNOSTIC LOG');
    expect(dump).toContain('"roomCode":"AB12"');
    expect(dump).toContain('Testing join attempt');
  });

  it('redacts hidden faction fields from logged payloads', () => {
    clearLogs();
    const entry = logger.debug('ENGINE', 'State snapshot', {
      playerName: 'Alice',
      currentFaction: 'cult_leader',
      originalFaction: 'pirate',
      nested: {
        seenCurrentFaction: 'sailor',
        safeField: 42,
      },
    });

    const formatted = formatLogLine(entry);
    expect(formatted).toContain('"playerName":"Alice"');
    expect(formatted).toContain('"safeField":42');
    expect(formatted).not.toContain('cult_leader');
    expect(formatted).not.toContain('pirate');
    expect(formatted).not.toContain('sailor');
    expect(formatted).toContain('[REDACTED]');
  });

  it('safely serializes Error instances and circular objects', () => {
    clearLogs();
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    const err = new Error('Peer unavailable');
    const entry = logger.error('PEER_CLIENT', 'Connection failed', { err, circular });

    const formatted = formatLogLine(entry);
    expect(formatted).toContain('Peer unavailable');
    expect(formatted).toContain('[Circular]');
  });
});
