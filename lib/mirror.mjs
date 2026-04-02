/**
 * buddy-shelter mirror mode
 *
 * Wraps `claude --dangerously-skip-permissions` in a pty, captures
 * buddy speech bubbles from terminal output, and broadcasts them to
 * any connected Electron desktop pet via a local WebSocket server.
 *
 * One-way flow (v0.2.0):
 *   pty stdout  →  regex extract bubble text  →  WS broadcast
 *
 * The WS server binds to a random available port and writes it to
 * ~/.buddy-shelter/mirror.port so Electron can connect.
 */

import { createRequire } from 'module';
import { createServer } from 'net';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { roll } from './generation.mjs';
import { ORIGINAL_SALT } from './constants.mjs';
import { loadPetConfig } from './config.mjs';

const require = createRequire(import.meta.url);

const SHELTER_DIR  = join(homedir(), '.buddy-shelter');
const PORT_FILE    = join(SHELTER_DIR, 'mirror.port');
const CURRENT_FILE = join(SHELTER_DIR, 'mirror-current.json');

// ─── Regex: extract buddy speech from Claude Code's terminal output ───────────
//
// Two formats are handled:
//
// 1. Inline (v2.1.89+):
//      (✦oo✦) "speech text"          ← quoted   → always speech
//      (✦oo✦) name                   ← unquoted → skip (name/header line)
//    Face part matches any eye combination: (·oo·) (×oo×) (◉oo◉) etc.
//
// 2. Box frame (fallback for older versions):
//      ╭──────────────────╮
//      │  <BuddyName>     │
//      │  <text here>     │
//      ╰──────────────────╯
//
// Pattern is tolerant of ANSI colour codes that Claude Code injects.
const ANSI = /\x1b\[[^A-Za-z]*[A-Za-z]|\r/g;

// Inline: (any-face) "quoted speech" — no line anchors so it matches across
// a buffer that may contain many pty-injected newlines between characters.
const INLINE_SCAN = /\([^)]+\)\s*"([^"\n]+)"/g;

// Box format (fallback for older Claude Code versions)
const BOX_LINE = /[│|]\s+(.+?)\s*[│|]/;

/**
 * Stateful stream parser: feed it raw pty chunks; get back bubble strings.
 *
 * Inline detection works on the raw accumulation buffer without splitting by
 * newline, because the pty can stream a single logical line character-by-
 * character with a \n after each character.  The buffer is scanned for
 * complete (face)"speech" patterns; only the unmatched tail is retained.
 *
 * Box detection still splits by newline (box-frame lines are never split).
 */
export function createBubbleParser() {
  let inlineBuf = '';   // accumulates stripped pty output for inline scan
  let boxBuf    = '';   // accumulates newline-delimited text for box scan
  let inBox     = false;
  let boxLines  = [];

  return function parse(chunk) {
    const stripped = chunk.replace(ANSI, '');

    // ── Inline scan ────────────────────────────────────────────────────────
    inlineBuf += stripped;
    const results = [];

    INLINE_SCAN.lastIndex = 0;
    let m;
    let consumed = 0;
    while ((m = INLINE_SCAN.exec(inlineBuf)) !== null) {
      const speech = m[1].trim();
      process.stderr.write(`[mirror:parser] inline-bubble: ${JSON.stringify(speech)}\n`);
      if (speech) results.push(speech);
      consumed = m.index + m[0].length;
    }
    // Keep only the unmatched tail; it may contain a partial match in progress.
    if (consumed > 0) inlineBuf = inlineBuf.slice(consumed);
    // Prevent unbounded growth when no face pattern is present.
    if (inlineBuf.length > 4000) {
      const fi = inlineBuf.lastIndexOf('(');
      inlineBuf = fi > 0 ? inlineBuf.slice(fi) : '';
    }

    // ── Box scan (fallback) ────────────────────────────────────────────────
    boxBuf += stripped;
    const rows = boxBuf.split('\n');
    boxBuf = rows.pop() ?? '';   // keep incomplete last line

    for (const row of rows) {
      const trimmed = row.trim();

      if (/^[╭┌]/.test(trimmed)) {
        process.stderr.write(`[mirror:parser] box-open: ${JSON.stringify(trimmed.slice(0, 30))}\n`);
        inBox = true; boxLines = [];
        continue;
      }

      if (inBox && /^[╰└]/.test(trimmed)) {
        inBox = false;
        const textLines = boxLines.filter(l => l.length > 0);
        process.stderr.write(`[mirror:parser] box-close, lines: ${JSON.stringify(textLines)}\n`);
        if (textLines.length >= 2) {
          const speech = textLines.slice(1).join(' ').trim();
          if (speech) { process.stderr.write(`[mirror:parser] box-bubble: ${JSON.stringify(speech)}\n`); results.push(speech); }
        } else if (textLines.length === 1) {
          process.stderr.write(`[mirror:parser] box-bubble (1-line): ${JSON.stringify(textLines[0])}\n`);
          results.push(textLines[0]);
        }
        boxLines = [];
        continue;
      }

      if (inBox) {
        const bm = BOX_LINE.exec(trimmed);
        if (bm) boxLines.push(bm[1].trim());
      }
    }

    return results;
  };
}

// ─── Find a free TCP port ─────────────────────────────────────────────────────

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// ─── Save current buddy data from ~/.claude.json ─────────────────────────────

function saveCurrentBuddy() {
  try {
    const { readFileSync } = require('fs');
    const claudePath = join(homedir(), '.claude.json');
    const raw = JSON.parse(readFileSync(claudePath, 'utf-8'));

    // Claude Code stores companion under oauthAccount or projects — extract
    const oauthAccounts = raw.oauthAccount || raw.oauthAccounts || {};
    // Find first account entry
    let accountData = null;
    for (const key of Object.keys(oauthAccounts)) {
      if (typeof oauthAccounts[key] === 'object') {
        accountData = oauthAccounts[key];
        break;
      }
    }

    const companion = accountData?.companion || raw.companion || null;
    if (!companion) return null;

    // Derive bones using the salt any-buddy patched into the binary.
    // ~/.claude-code-any-buddy.json stores the patched salt; fall back to
    // ORIGINAL_SALT only if the binary was never patched.
    const userId = raw.oauthAccount?.accountUuid ?? raw.userID ?? 'anon';
    const petConfig = loadPetConfig();
    const salt = petConfig?.salt ?? ORIGINAL_SALT;
    let bones = null;
    try {
      ({ bones } = roll(userId, salt));
    } catch { /* non-fatal: main.js falls back to original.json bones */ }

    const current = { companion: { ...companion, bones }, timestamp: Date.now() };
    mkdirSync(SHELTER_DIR, { recursive: true });
    writeFileSync(CURRENT_FILE, JSON.stringify(current, null, 2) + '\n');
    return current;
  } catch {
    return null;
  }
}

// ─── Main: start mirror session ───────────────────────────────────────────────

export async function startMirrorSession({ claudeBinary = 'claude' } = {}) {
  const pty = require('node-pty');
  const { WebSocketServer } = require('ws');

  mkdirSync(SHELTER_DIR, { recursive: true });

  // Snapshot current buddy for Electron
  saveCurrentBuddy();

  // Pick a free port and start WS server
  const port = await findFreePort();
  writeFileSync(PORT_FILE, String(port));

  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  const clients = new Set();

  function broadcast(payload) {
    const msg = JSON.stringify(payload);
    const open = [...clients].filter(ws => ws.readyState === 1).length;
    process.stderr.write(`[mirror:ws] broadcast — clients: ${clients.size} (open: ${open}) payload: ${msg.slice(0, 80)}\n`);
    for (const ws of clients) {
      if (ws.readyState === 1 /* OPEN */) ws.send(msg);
    }
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    process.stderr.write(`[mirror:ws] client connected, total: ${clients.size}\n`);
    ws.on('close', () => { clients.delete(ws); process.stderr.write(`[mirror:ws] client disconnected, total: ${clients.size}\n`); });
    ws.on('error', (e) => { clients.delete(ws); process.stderr.write(`[mirror:ws] client error: ${e.message}\n`); });
  });

  console.log(`  [mirror] WS server on ws://127.0.0.1:${port}`);

  // Spawn claude in a pty that inherits terminal size
  const cols = process.stdout.columns || 120;
  const rows = process.stdout.rows    || 30;

  const childEnv = { ...process.env };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;

  const ptyProc = pty.spawn('/bin/bash', ['-c', `'${claudeBinary}'`], {
    name: 'xterm-256color',
    cols, rows,
    cwd: process.cwd(),
    env: childEnv,
  });

  const parse = createBubbleParser();

  // Pipe pty stdout → terminal + bubble parser
  ptyProc.onData((data) => {
    process.stdout.write(data);
    const bubbles = parse(data);
    for (const text of bubbles) {
      broadcast({ type: 'bubble', text });
    }
  });

  // Pipe stdin → pty (raw mode so arrow keys / Ctrl-C work)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (data) => ptyProc.write(data.toString()));

  // Resize pty when terminal resizes
  process.stdout.on('resize', () => {
    ptyProc.resize(process.stdout.columns || 80, process.stdout.rows || 24);
  });

  // On exit, clean up port file
  ptyProc.onExit(({ exitCode }) => {
    try { require('fs').unlinkSync(PORT_FILE); } catch {}
    wss.close();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.exit(exitCode ?? 0);
  });
}
