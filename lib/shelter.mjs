// buddy-shelter: 原始buddy数据备份与读取模块
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// 备份文件路径
const SHELTER_DIR = join(homedir(), '.buddy-shelter');
const SHELTER_FILE = join(SHELTER_DIR, 'original.json');

// 从 ~/.claude.json 读取 companion 的 soul 信息（名字、性格、孵化日期）
export function readSoul() {
  const paths = [
    join(homedir(), '.claude.json'),
    join(homedir(), '.claude', '.config.json'),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const config = JSON.parse(readFileSync(p, 'utf-8'));
        const companion = config.companion;
        if (!companion) return null;
        return {
          name: companion.name ?? null,
          personality: companion.personality ?? null,
          hatchDate: companion.hatchDate ?? null,
        };
      } catch {
        continue;
      }
    }
  }
  return null;
}

// 将原始buddy数据写入 ~/.buddy-shelter/original.json
// 首次运行时保存，之后不覆盖——soul 在首次 hatch 时生成，之后不变
export function saveOriginalBuddy(userId, bones) {
  // 确保目录存在
  if (!existsSync(SHELTER_DIR)) {
    mkdirSync(SHELTER_DIR, { recursive: true });
  }

  // 已存在有效备份（非测试数据）则不覆盖，保护原始 soul 不被后续运行覆盖
  if (existsSync(SHELTER_FILE)) {
    try {
      const existing = JSON.parse(readFileSync(SHELTER_FILE, 'utf-8'));
      if (existing.userId && existing.userId !== 'anon') return existing;
    } catch {
      // 文件损坏则重新写入
    }
  }

  // 计算 peakStat 和 dumpStat
  const statEntries = Object.entries(bones.stats).sort((a, b) => b[1] - a[1]);
  const peakStat = statEntries[0]?.[0] ?? null;
  const dumpStat = statEntries[statEntries.length - 1]?.[0] ?? null;

  const soul = readSoul();

  const data = {
    userId,
    capturedAt: new Date().toISOString(),
    bones: {
      species: bones.species,
      rarity: bones.rarity,
      eye: bones.eye,
      hat: bones.hat,
      shiny: bones.shiny,
      stats: bones.stats,
      peakStat,
      dumpStat,
    },
    soul: soul ?? {
      name: null,
      personality: null,
      hatchDate: null,
    },
  };

  writeFileSync(SHELTER_FILE, JSON.stringify(data, null, 2) + '\n');
  return data;
}

// 读取已备份的原始buddy数据
export function loadOriginalBuddy() {
  if (!existsSync(SHELTER_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SHELTER_FILE, 'utf-8'));
  } catch {
    return null;
  }
}
