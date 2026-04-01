#!/usr/bin/env node
// Renders rarity, eye, and hat options for README screenshots
import chalk from 'chalk';
import { EYES, HATS, RARITIES, RARITY_STARS, RARITY_WEIGHTS } from '../lib/constants.mjs';
import { renderSprite } from '../lib/sprites.mjs';

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

// ─── Rarities ───
console.log();
console.log(chalk.bold('  Rarities'));
console.log(chalk.dim('  ─'.repeat(30)));
console.log();

for (const r of RARITIES) {
  const color = RARITY_CHALK[r];
  const pct = RARITY_WEIGHTS[r];
  console.log(color(`    ${RARITY_STARS[r].padEnd(6)}  ${r.padEnd(12)}  (normally ${pct}%)`));
}
console.log();

// ─── Eyes ───
console.log(chalk.bold('  Eye Styles'));
console.log(chalk.dim('  ─'.repeat(30)));
console.log();

const COL_WIDTH = 20;
let eyeLine = '    ';
for (const e of EYES) {
  const cat = renderSprite({ species: 'cat', eye: e, hat: 'none', rarity: 'common' }, 0);
  eyeLine += padRight(chalk.cyan(`  ${e}  `), COL_WIDTH);
}
console.log(eyeLine);

// Show the cat with each eye style
const maxEyeLines = 4;
for (let i = 0; i < maxEyeLines; i++) {
  let line = '    ';
  for (const e of EYES) {
    const cat = renderSprite({ species: 'cat', eye: e, hat: 'none', rarity: 'common' }, 0);
    line += padRight(chalk.cyan(cat[i] ?? ''), COL_WIDTH);
  }
  console.log(line);
}
console.log();

// ─── Hats ───
console.log(chalk.bold('  Hats (uncommon+ only)'));
console.log(chalk.dim('  ─'.repeat(30)));
console.log();

const hatSpecies = 'dragon';
const COLS = 4;
const hatList = HATS.filter(h => h !== 'none');

for (let row = 0; row < Math.ceil(hatList.length / COLS); row++) {
  const batch = hatList.slice(row * COLS, (row + 1) * COLS);
  const sprites = batch.map(h =>
    renderSprite({ species: hatSpecies, eye: '✦', hat: h, rarity: 'rare' }, 0)
  );
  const maxLines = Math.max(...sprites.map(s => s.length));

  let nameLine = '  ';
  for (const h of batch) {
    nameLine += padRight(chalk.bold(h), COL_WIDTH);
  }
  console.log(nameLine);

  for (let i = 0; i < maxLines; i++) {
    let line = '  ';
    for (let j = 0; j < batch.length; j++) {
      line += padRight(chalk.blue(sprites[j]?.[i] ?? ''), COL_WIDTH);
    }
    console.log(line);
  }
  console.log();
}
