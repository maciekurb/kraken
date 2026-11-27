export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type LogScope =
  | 'APP'
  | 'UI'
  | 'SESSION'
  | 'STORAGE'
  | 'PEER_HOST'
  | 'PEER_CLIENT'
  | 'LOCAL_NET'
  | 'ENGINE'
  | 'PEERJS'
  | 'WAKELOCK'
  | 'I18N'
  | 'GLOBAL';

export interface LogEntry {
  id: number;
  timestamp: string;
  elapsedMs: number;
  level: LogLevel;
  scope: LogScope;
  message: string;
  data?: unknown;
}

export interface DiagnosticContext {
  role?: 'host' | 'client' | 'none';
  transportMode?: string;
  roomCode?: string | null;
  playerId?: string | null;
  playerName?: string | null;
  peerId?: string | null;
  connectionState?: string;
  phase?: string | null;
  playerCount?: number;
  error?: string | null;
}

type LogListener = () => void;

const MAX_ENTRIES = 1200;
const STORAGE_KEY = 'ftk_debug_logs_v1';
const MAX_PERSISTED_ENTRIES = 250;

// Never leak hidden tabletop roles/factions into exported debug logs
const REDACTED_KEYS = new Set([
  'currentFaction',
  'originalFaction',
  'seenCurrentFaction',
  'seenOriginalFaction',
  'fivePlayerRemovedFaction',
  'revealedCurrentFaction',
  'revealedOriginalFaction',
  'enlightenedTeam',
  'cultLeaderChoice',
  'knownPirates',
  'knownCultists',
  'knownCultLeader',
  'myCabinSearches',
  'cabinSearchHistory',
  'knownConvertedIds',
]);

const startTime = Date.now();
const tabSessionId = `tab_${startTime.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

let nextId = 1;
let entries: LogEntry[] = [];
let diagnosticContext: DiagnosticContext = { role: 'none' };
const listeners = new Set<LogListener>();
let globalCaptureInitialized = false;

// Keep references to original console methods to prevent recursion when mirroring
const rawConsole = {
  debug: console.debug.bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function sanitizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return value.toString();
  if (type === 'function') return '[Function]';
  if (type === 'symbol') return String(value);

  if (value instanceof Error) {
    const extra: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };
    if ('type' in value && typeof (value as { type?: unknown }).type === 'string') {
      extra.type = (value as { type: string }).type;
    }
    if (value.stack) {
      extra.stack = value.stack.split('\n').slice(0, 6).join(' | ');
    }
    return extra;
  }

  if (depth >= 4) {
    return Array.isArray(value) ? `[Array(${value.length})]` : '[Object]';
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1, seen));
    }

    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>);
    for (const key of keys.slice(0, 40)) {
      if (REDACTED_KEYS.has(key)) {
        out[key] = '[REDACTED]';
      } else {
        try {
          out[key] = sanitizeValue((value as Record<string, unknown>)[key], depth + 1, seen);
        } catch {
          out[key] = '[Unreadable]';
        }
      }
    }
    if (keys.length > 40) {
      out._truncatedKeys = keys.length - 40;
    }
    return out;
  }

  return String(value);
}

export function safeStringify(data: unknown): string {
  if (data === undefined) return '';
  try {
    return JSON.stringify(sanitizeValue(data));
  } catch {
    return String(data);
  }
}

function formatTimeShort(iso: string): string {
  // Extract HH:MM:SS.mmm from ISO timestamp
  const idx = iso.indexOf('T');
  return idx >= 0 ? iso.slice(idx + 1, idx + 13) : iso;
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const tail = entries.slice(-MAX_PERSISTED_ENTRIES);
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tail));
    } catch {
      // ignore storage quota errors
    }
  }, 500);
}

function restorePersistedLogs(): void {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as LogEntry[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      entries = parsed.slice(-MAX_PERSISTED_ENTRIES);
      const maxId = entries.reduce((acc, item) => Math.max(acc, item.id || 0), 0);
      nextId = maxId + 1;
    }
  } catch {
    // ignore corrupt logs
  }
}

function writeToConsole(entry: LogEntry): void {
  const prefix = `[FTK ${formatTimeShort(entry.timestamp)} +${entry.elapsedMs}ms] [${entry.level}] [${entry.scope}]`;
  const fn =
    entry.level === 'ERROR'
      ? rawConsole.error
      : entry.level === 'WARN'
        ? rawConsole.warn
        : entry.level === 'DEBUG'
          ? rawConsole.debug
          : rawConsole.info;

  if (entry.data !== undefined) {
    fn(`${prefix} ${entry.message}`, entry.data);
  } else {
    fn(`${prefix} ${entry.message}`);
  }
}

export function log(
  level: LogLevel,
  scope: LogScope,
  message: string,
  data?: unknown,
  options?: { skipConsole?: boolean }
): LogEntry {
  const now = Date.now();
  const sanitized = data !== undefined ? sanitizeValue(data) : undefined;
  const entry: LogEntry = {
    id: nextId++,
    timestamp: new Date(now).toISOString(),
    elapsedMs: now - startTime,
    level,
    scope,
    message,
    ...(sanitized !== undefined ? { data: sanitized } : {}),
  };

  entries = entries.length >= MAX_ENTRIES ? [...entries.slice(-(MAX_ENTRIES - 1)), entry] : [...entries, entry];

  if (!options?.skipConsole) {
    writeToConsole(entry);
  }

  schedulePersist();
  notify();
  return entry;
}

export const logger = {
  debug: (scope: LogScope, message: string, data?: unknown) => log('DEBUG', scope, message, data),
  info: (scope: LogScope, message: string, data?: unknown) => log('INFO', scope, message, data),
  warn: (scope: LogScope, message: string, data?: unknown) => log('WARN', scope, message, data),
  error: (scope: LogScope, message: string, data?: unknown) => log('ERROR', scope, message, data),
};

export function updateDiagnosticContext(patch: Partial<DiagnosticContext>): void {
  diagnosticContext = { ...diagnosticContext, ...patch };
  notify();
}

export function getDiagnosticContext(): DiagnosticContext {
  return diagnosticContext;
}

export function getLogEntries(): readonly LogEntry[] {
  return entries;
}

export function clearLogs(): void {
  entries = [];
  if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  log('INFO', 'APP', 'Logs cleared by user');
}

export function subscribeLogs(listener: LogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function collectEnvironmentSnapshot(): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return { env: 'node' };
  }
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string; downlink?: number; rtt?: number };
  };
  return {
    tabSessionId,
    url: window.location.href,
    origin: window.location.origin,
    protocol: window.location.protocol,
    isSecureContext: window.isSecureContext,
    online: navigator.onLine,
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    hasRTCPeerConnection: typeof RTCPeerConnection !== 'undefined',
    hasBroadcastChannel: typeof BroadcastChannel !== 'undefined',
    hasCryptoRandomUUID: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function',
    hasServiceWorker: 'serviceWorker' in navigator,
    swControlled: 'serviceWorker' in navigator ? Boolean(navigator.serviceWorker.controller) : false,
    networkInfo: nav.connection
      ? {
          effectiveType: nav.connection.effectiveType,
          type: nav.connection.type,
          downlink: nav.connection.downlink,
          rtt: nav.connection.rtt,
        }
      : undefined,
  };
}

export function formatLogLine(entry: LogEntry): string {
  const base = `[${formatTimeShort(entry.timestamp)}] [+${entry.elapsedMs}ms] [${entry.level.padEnd(5, ' ')}] [${entry.scope}] ${entry.message}`;
  if (entry.data === undefined) return base;
  return `${base} | ${safeStringify(entry.data)}`;
}

export function formatLogsForExport(filteredEntries?: readonly LogEntry[]): string {
  const list = filteredEntries ?? entries;
  const env = collectEnvironmentSnapshot();
  const header = [
    '=== FEED THE KRAKEN COMPANION — DIAGNOSTIC LOG ===',
    `ExportedAt: ${new Date().toISOString()}`,
    `TabSession: ${tabSessionId}`,
    `UptimeMs:   ${Date.now() - startTime}`,
    `Context:    ${safeStringify(diagnosticContext)}`,
    `Env:        ${safeStringify(env)}`,
    `Entries:    ${list.length} (total buffered: ${entries.length})`,
    '==================================================',
  ].join('\n');

  const body = list.map(formatLogLine).join('\n');
  return `${header}\n${body}\n`;
}

export async function copyLogsToClipboard(text?: string): Promise<boolean> {
  const payload = text ?? formatLogsForExport();

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payload);
      return true;
    } catch {
      // Fallback below for non-HTTPS LAN / mobile WebViews
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, payload.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  return false;
}

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      return safeStringify(arg);
    })
    .join(' ');
}

export function initGlobalLogCapture(): void {
  if (globalCaptureInitialized || typeof window === 'undefined') return;
  globalCaptureInitialized = true;

  restorePersistedLogs();

  // Capture PeerJS internal debug logs & external console warnings/errors
  console.log = (...args: unknown[]) => {
    rawConsole.log(...args);
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('PeerJS:')) {
      log('DEBUG', 'PEERJS', formatConsoleArgs(args), undefined, { skipConsole: true });
    }
  };

  console.warn = (...args: unknown[]) => {
    rawConsole.warn(...args);
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('[FTK ')) return;
    const scope: LogScope =
      typeof first === 'string' && first.startsWith('PeerJS:') ? 'PEERJS' : 'GLOBAL';
    log('WARN', scope, formatConsoleArgs(args), undefined, { skipConsole: true });
  };

  console.error = (...args: unknown[]) => {
    rawConsole.error(...args);
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('[FTK ')) return;
    const scope: LogScope =
      typeof first === 'string' && first.startsWith('PeerJS:') ? 'PEERJS' : 'GLOBAL';
    log('ERROR', scope, formatConsoleArgs(args), undefined, { skipConsole: true });
  };

  window.addEventListener('error', (event) => {
    log('ERROR', 'GLOBAL', `Uncaught window error: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    log('ERROR', 'GLOBAL', 'Unhandled promise rejection', {
      reason: event.reason,
    });
  });

  window.addEventListener('online', () => {
    log('INFO', 'APP', 'Browser network status: ONLINE');
  });

  window.addEventListener('offline', () => {
    log('WARN', 'APP', 'Browser network status: OFFLINE');
  });

  document.addEventListener('visibilitychange', () => {
    log('DEBUG', 'APP', `Document visibility changed: ${document.visibilityState}`);
  });

  // Expose convenient DevTools helper on window
  const api = {
    dump: () => {
      const text = formatLogsForExport();
      rawConsole.log(text);
      return text;
    },
    copy: async () => {
      const ok = await copyLogsToClipboard();
      rawConsole.info(ok ? '[FTK] Logs copied to clipboard!' : '[FTK] Failed to copy logs.');
      return ok;
    },
    clear: () => clearLogs(),
    getEntries: () => [...entries],
    getContext: () => ({ ...diagnosticContext }),
  };

  (window as Window & { __FTK_LOGS__?: typeof api }).__FTK_LOGS__ = api;

  log('INFO', 'APP', 'Application started & global logger initialized', collectEnvironmentSnapshot());
}
