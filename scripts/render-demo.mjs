#!/usr/bin/env node
// Renders a mock demo of the full flow for README screenshot
import chalk from 'chalk';
import { renderSprite } from '../lib/sprites.mjs';

const RARITY_CHALK = {
  common: chalk.gray,
  uncommon: chalk.green,
  rare: chalk.blue,
  epic: chalk.magenta,
  legendary: chalk.yellow,
};

console.log();
console.log(chalk.bold.cyan('  claude-code-any-buddy'));
console.log(chalk.dim('  Pick any Claude Code companion pet'));
console.log();
console.log(chalk.dim('  User ID: d6242b55-d9f9-43...\n'));

// Current pet
const currentSprite = renderSprite({ species: 'mushroom', eye: '°', hat: 'crown', rarity: 'uncommon' }, 0);
console.log(chalk.green('  Your current default pet: mushroom ★★'));
console.log(chalk.green('  Rarity: uncommon  Eyes: °  Hat: crown  Shiny: no'));
console.log();
for (const line of currentSprite) console.log(chalk.green('    ' + line));
console.log();

// Selection
console.log(chalk.bold('  Choose your new pet:\n'));
console.log(chalk.green('  ✔ ') + chalk.bold('Species ') + chalk.cyan('dragon'));
console.log(chalk.green('  ✔ ') + chalk.bold('Eyes    ') + chalk.cyan('✦'));
console.log(chalk.green('  ✔ ') + chalk.bold('Rarity  ') + chalk.cyan('legendary ★★★★★ (normally 1%)'));
console.log(chalk.green('  ✔ ') + chalk.bold('Hat     ') + chalk.cyan('wizard'));
console.log();

// New pet preview
const newSprite = renderSprite({ species: 'dragon', eye: '✦', hat: 'wizard', rarity: 'legendary' }, 0);
console.log(chalk.yellow('  Your selection: dragon ★★★★★'));
console.log(chalk.yellow('  Rarity: legendary  Eyes: ✦  Hat: wizard  Shiny: no'));
console.log();
for (const line of newSprite) console.log(chalk.yellow('    ' + line));
console.log();

console.log(chalk.green('  ✔ ') + 'Find a matching salt and apply? ' + chalk.cyan('Yes'));
console.log(chalk.dim('  Searching for matching salt...'));
console.log(chalk.green('  Found salt "VZ-ROzXwLZNVAYK" in 40,488 attempts (22ms)'));
console.log();
console.log(chalk.green('  ✔ ') + 'Patch binary? ' + chalk.cyan('Yes'));
console.log(chalk.green('  Patched! 3 replacements, verified: true'));
console.log(chalk.dim('  Backup: ~/.local/share/claude/versions/2.1.89.anybuddy-bak'));
console.log();
console.log(chalk.green('  ✔ ') + 'Install SessionStart hook to auto-re-apply after updates? ' + chalk.cyan('Yes'));
console.log(chalk.green('  Hook installed in ~/.claude/settings.json'));
console.log();
console.log(chalk.bold.green('  Done! Launch Claude Code and run /buddy to see your new pet.'));
console.log();
