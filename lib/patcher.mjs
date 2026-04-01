import { readFileSync, writeFileSync, copyFileSync, statSync, chmodSync, realpathSync, unlinkSync, renameSync } from 'fs';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, basename } from 'path';
import { homedir } from 'os';
import { ORIGINAL_SALT } from './constants.mjs';

// Resolve the actual Claude Code binary path dynamically
export function findClaudeBinary() {
  // 1. Check if user specified a path via env var
  if (process.env.CLAUDE_BINARY) {
    const p = process.env.CLAUDE_BINARY;
    if (existsSync(p)) return realpathSync(p);
    throw new Error(`CLAUDE_BINARY="${p}" does not exist.`);
  }

  // 2. Try `which claude` to find it on PATH (works for any install method)
  try {
    const which = execSync('which claude 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (which && existsSync(which)) {
      return realpathSync(which);
    }
  } catch { /* ignore */ }

  // 3. Common known locations as fallback
  const candidates = [
    join(homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    join(homedir(), '.npm-global', 'bin', 'claude'),
    join(homedir(), '.volta', 'bin', 'claude'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        return realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
  }

  throw new Error(
    'Could not find Claude Code binary.\n' +
    '  Tried `which claude` and these paths:\n' +
    candidates.map(c => `    - ${c}`).join('\n') +
    '\n\n  Set CLAUDE_BINARY=/path/to/claude to specify manually.'
  );
}

// Find all byte offsets of a string in a buffer
function findAllOccurrences(buffer, searchStr) {
  const searchBuf = Buffer.from(searchStr, 'utf-8');
  const offsets = [];
  let pos = 0;
  while (pos < buffer.length) {
    const idx = buffer.indexOf(searchBuf, pos);
    if (idx === -1) break;
    offsets.push(idx);
    pos = idx + 1;
  }
  return offsets;
}

// Read the current salt from the binary (checks if patched or original)
export function getCurrentSalt(binaryPath) {
  const buf = readFileSync(binaryPath);
  const origOffsets = findAllOccurrences(buf, ORIGINAL_SALT);
  if (origOffsets.length === 3) {
    return { salt: ORIGINAL_SALT, patched: false, offsets: origOffsets };
  }
  return { salt: null, patched: true, offsets: origOffsets };
}

// Check if a specific salt is present in the binary
export function verifySalt(binaryPath, salt) {
  const buf = readFileSync(binaryPath);
  const offsets = findAllOccurrences(buf, salt);
  return { found: offsets.length, offsets };
}

// Check if the Claude binary is currently running
export function isClaudeRunning(binaryPath) {
  try {
    const name = basename(binaryPath);
    const out = execSync(`pgrep -f "${name}" 2>/dev/null || true`, { encoding: 'utf-8' });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

// Patch the binary: replace oldSalt with newSalt at all occurrences.
// Uses copy-patch-rename to handle ETXTBSY (binary currently running).
export function patchBinary(binaryPath, oldSalt, newSalt) {
  if (oldSalt.length !== newSalt.length) {
    throw new Error(
      `Salt length mismatch: old=${oldSalt.length}, new=${newSalt.length}. Must be ${ORIGINAL_SALT.length} chars.`
    );
  }

  const buf = readFileSync(binaryPath);
  const offsets = findAllOccurrences(buf, oldSalt);

  if (offsets.length === 0) {
    throw new Error(
      `Could not find salt "${oldSalt}" in binary. The binary may already be patched with a different salt, or Claude Code was updated.`
    );
  }

  // Create backup (read from original since it's still readable)
  const backupPath = binaryPath + '.anybuddy-bak';
  if (!existsSync(backupPath)) {
    copyFileSync(binaryPath, backupPath);
  }

  // Replace all occurrences in the buffer
  const newBuf = Buffer.from(newSalt, 'utf-8');
  for (const offset of offsets) {
    newBuf.copy(buf, offset);
  }

  // Write to a temp file then rename (avoids ETXTBSY on running binary).
  // On Linux, renaming over a running binary is allowed — the old inode
  // stays open for the running process, and the new file takes the path.
  const stats = statSync(binaryPath);
  const tmpPath = binaryPath + '.anybuddy-tmp';
  writeFileSync(tmpPath, buf);
  chmodSync(tmpPath, stats.mode);

  // Rename: unlink old (may fail if busy, so rename new on top)
  try {
    renameSync(tmpPath, binaryPath);
  } catch {
    // If rename fails, try unlink + rename
    try { unlinkSync(binaryPath); } catch { /* ignore */ }
    renameSync(tmpPath, binaryPath);
  }

  // Verify from the newly written file
  const verifyBuf = readFileSync(binaryPath);
  const verify = findAllOccurrences(verifyBuf, newSalt);
  return {
    replacements: offsets.length,
    verified: verify.length === offsets.length,
    backupPath,
  };
}

// Restore the binary from backup
export function restoreBinary(binaryPath) {
  const backupPath = binaryPath + '.anybuddy-bak';
  if (!existsSync(backupPath)) {
    throw new Error('No backup found. Cannot restore.');
  }
  const stats = statSync(backupPath);
  const tmpPath = binaryPath + '.anybuddy-tmp';
  copyFileSync(backupPath, tmpPath);
  chmodSync(tmpPath, stats.mode);
  try {
    renameSync(tmpPath, binaryPath);
  } catch {
    try { unlinkSync(binaryPath); } catch { /* ignore */ }
    renameSync(tmpPath, binaryPath);
  }
  return true;
}
