#!/usr/bin/env node
// Renders all species in a grid for README screenshots
import chalk from 'chalk';
import { SPECIES, EYES, HATS, RARITIES, RARITY_STARS, RARITY_WEIGHTS } from '../lib/constants.mjs';
import { renderSprite, renderFace } from '../lib/sprites.mjs';

const RARITY_CHALK = {
  common: chalk.gray,
  uncommon: chalk.green,
  rare: chalk.blue,
  epic: chalk.magenta,
  legendary: chalk.yellow,
};

function padRight(str, len) {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - visible.length));
}

// ─── Hero banner ───
console.log();
console.log(chalk.bold.cyan('  claude-code-any-buddy'));
console.log(chalk.dim('  Pick any Claude Code companion pet you want'));
console.log();

// ─── All species gallery (3 per row) ───
console.log(chalk.bold('  All 18 Species'));
console.log(chalk.dim('  ─'.repeat(30)));
console.log();

const COL_WIDTH = 24;
const COLS = 3;

for (let row = 0; row < Math.ceil(SPECIES.length / COLS); row++) {
  const batch = SPECIES.slice(row * COLS, (row + 1) * COLS);
  const sprites = batch.map(s => renderSprite({ species: s, eye: '·', hat: 'none', rarity: 'common' }, 0));
  const maxLines = Math.max(...sprites.map(s => s.length));

  // Species names
  let nameLine = '  ';
  for (const s of batch) {
    nameLine += padRight(chalk.bold(s), COL_WIDTH);
  }
  console.log(nameLine);

  // Sprite lines
  for (let i = 0; i < maxLines; i++) {
    let line = '  ';
    for (let j = 0; j < batch.length; j++) {
      const spriteLine = sprites[j]?.[i] ?? '';
      line += padRight(chalk.cyan(spriteLine), COL_WIDTH);
    }
    console.log(line);
  }
  console.log();
}
