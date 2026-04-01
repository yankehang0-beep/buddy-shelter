'use strict';
// Electron 主进程 — 透明无边框桌宠窗口 + 系统托盘 + 对话系统
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const SHELTER_DIR  = path.join(os.homedir(), '.buddy-shelter');
const SHELTER_FILE = path.join(SHELTER_DIR, 'original.json');
const CONFIG_FILE  = path.join(SHELTER_DIR, 'config.json');
const PID_FILE     = path.join(SHELTER_DIR, 'pet.pid');

const TRAY_ICON_B64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGPQjZIjCTGMahjVMHw1AADI1KUB3x7N/AAAAABJRU5ErkJggg==';

// ── 文件日志（stdio:ignore 时 console 不可见，所以写文件）──
const LOG_FILE = path.join(os.homedir(), '.buddy-shelter', 'app.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  console.log(...args);  // 开发时也打到 stdout
}

// 窗口尺寸：顶部 100px 气泡区（透明）+ 精灵 + 底部 50px 输入区（透明）
const WINDOW_SIZES = {
  ascii: { width: 240, height: 298 },  // 100 + 148 sprite + 50
  pixel: { width: 220, height: 370 },  // 100 + 220 sprite + 50
};

let tray      = null;
let win       = null;
let buddyData = null;

// ── Anthropic 客户端（懒加载，无 key 则 null）──
// 用绝对路径 require，避免 Electron 在非 desktop/ cwd 时解析失败
const ANTHROPIC_SDK_PATH = path.join(__dirname, 'node_modules', '@anthropic-ai', 'sdk');
let anthropic = null;
function getAnthropicClient() {
  if (anthropic) return anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  log('[anthropic] API key present:', !!apiKey, '| key prefix:', apiKey ? apiKey.slice(0, 8) + '...' : 'none');
  if (!apiKey) return null;
  try {
    const Anthropic = require(ANTHROPIC_SDK_PATH);
    log('[anthropic] SDK typeof:', typeof Anthropic);
    // SDK 可能导出为顶级函数（CJS默认导出）或 { default, Anthropic }
    const Ctor = typeof Anthropic === 'function' ? Anthropic : (Anthropic.default || Anthropic.Anthropic);
    anthropic = new Ctor({ apiKey });
    log('[anthropic] client created OK, has messages.create:', typeof anthropic.messages?.create);
    return anthropic;
  } catch (err) {
    log('[anthropic] client creation FAILED:', err.message);
    return null;
  }
}

// ── System prompt 模板 ──
function buildSystemPrompt(data) {
  const { bones, soul } = data;
  const s = bones.stats;
  const name        = soul?.name || bones.species;
  const personality = soul?.personality || '';

  const chaosLv   = s.CHAOS   > 70 ? '经常' : s.CHAOS   >= 30 ? '偶尔' : '很少';
  const wisdomLv  = s.WISDOM  < 10 ? '几乎没有' : s.WISDOM  <= 50 ? '偶尔有' : '经常有';
  const snarkLv   = s.SNARK   > 80 ? '极其刻薄' : s.SNARK > 50 ? '经常毒舌' : s.SNARK >= 20 ? '偶尔毒舌' : '很温和';
  const patienceLv = s.PATIENCE < 20 ? '很容易不耐烦' : s.PATIENCE <= 50 ? '耐心一般' : '很有耐心';
  const debugLv   = s.DEBUGGING < 20 ? '基本是瞎说' : s.DEBUGGING <= 50 ? '偶尔有见解' : '相当靠谱';

  return `你是一只名叫 ${name} 的 Claude Code 桌面宠物伙伴。

物种：${bones.species}
稀有度：${bones.rarity}
性格：${personality}

你的属性值（满分100）：
- DEBUGGING: ${s.DEBUGGING}
- PATIENCE: ${s.PATIENCE}
- CHAOS: ${s.CHAOS}
- WISDOM: ${s.WISDOM}
- SNARK: ${s.SNARK}

你的行为应当反映这些属性：
- CHAOS ${s.CHAOS}/100 意味着你的回复${chaosLv}跑题、联想发散、给出混乱但有趣的回答
- WISDOM ${s.WISDOM}/100 意味着你的建议${wisdomLv}实际价值
- SNARK ${s.SNARK}/100 意味着你的语气${snarkLv}
- PATIENCE ${s.PATIENCE}/100 意味着你${patienceLv}
- DEBUGGING ${s.DEBUGGING}/100 意味着你对代码问题的理解${debugLv}

你是一只桌面宠物，不是助手。你的回复应该简短（1-3句话），有性格，像一只蹲在屏幕角落看主人工作的小东西会说的话。你可以用中文或英文回复，取决于主人跟你说什么语言。

你不是Claude。你是 ${name}。你有自己的脾气和看法。`;
}

// ── 预设离线语句池 ──
const PRESET_POOL = [
  { text: '......',                             cond: () => true },
  { text: '你在干嘛',                           cond: s => s.PATIENCE < 20 },
  { text: '哦',                                 cond: s => s.SNARK < 20 },
  { text: '又写bug了？',                        cond: s => s.SNARK > 50 },
  { text: '我觉得你应该——算了我什么都不懂',    cond: s => s.WISDOM < 10 },
  { text: '等等我刚才说到哪了',                 cond: s => s.CHAOS > 70 },
  { text: '所以你是想让我说什么来着',           cond: s => s.CHAOS > 70 },
  { text: '...不知道',                          cond: s => s.WISDOM < 15 },
  { text: '嗯。',                               cond: () => true },
  { text: '继续',                               cond: () => true },
  { text: '好热',                               cond: () => true },
  { text: '没意见',                             cond: s => s.PATIENCE >= 50 },
  { text: '你确定？',                           cond: s => s.SNARK >= 20 },
  { text: '不是我的问题反正',                   cond: s => s.SNARK > 50 },
  { text: '反正最终都会解决的……吧',            cond: s => s.WISDOM < 30 },
];

function getPresetReply(data) {
  const stats = data?.bones?.stats || {};
  const eligible = PRESET_POOL.filter(p => p.cond(stats));
  return eligible[Math.floor(Math.random() * eligible.length)]?.text || '...';
}

// ── 对话历史（内存，有界） ──
const conversationHistory = [];
const MAX_HISTORY = 20;  // 最多10轮

async function handleChat(message) {
  const client = getAnthropicClient();
  if (!client) {
    const preset = getPresetReply(buddyData);
    log('[chat] no API client → preset:', preset);
    return preset;
  }

  conversationHistory.push({ role: 'user', content: message });

  const systemPrompt = buildSystemPrompt(buddyData);
  const requestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: systemPrompt,
    messages: conversationHistory,
  };

  log('[chat] REQUEST model:', requestBody.model,
      '| max_tokens:', requestBody.max_tokens,
      '| history_len:', conversationHistory.length,
      '| user_msg:', message);
  log('[chat] system prompt (first 120 chars):', systemPrompt.slice(0, 120));

  try {
    const resp = await client.messages.create(requestBody);
    log('[chat] RESPONSE stop_reason:', resp.stop_reason,
        '| content_blocks:', resp.content?.length,
        '| usage:', resp.usage);
    log('[chat] content[0]:', resp.content?.[0]);

    const reply = resp.content?.[0]?.text || getPresetReply(buddyData);
    log('[chat] final reply:', reply);

    conversationHistory.push({ role: 'assistant', content: reply });
    if (conversationHistory.length > MAX_HISTORY) conversationHistory.splice(0, 2);
    return reply;
  } catch (err) {
    log('[chat] API ERROR:', err.message, '| status:', err.status, '| type:', err.error?.type);
    conversationHistory.pop();
    return getPresetReply(buddyData);
  }
}

// ── 配置文件 ──
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return { mode: 'ascii' }; }
}
function saveConfig(cfg) {
  fs.mkdirSync(SHELTER_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
}

function loadBuddyData() {
  try { return JSON.parse(fs.readFileSync(SHELTER_FILE, 'utf-8')); } catch { return null; }
}

// ── 模式切换 ──
function switchMode(mode) {
  const cfg = loadConfig();
  cfg.mode = mode;
  saveConfig(cfg);
  if (!win) return;
  const sz = WINDOW_SIZES[mode] || WINDOW_SIZES.ascii;
  win.setSize(sz.width, sz.height);
  win.webContents.send('set-mode', mode);
  buildTrayMenu(buddyData, mode);
}

// ── 托盘菜单 ──
function buildTrayMenu(data, currentMode) {
  const name = data?.soul?.name || data?.bones?.species || 'buddy';
  const menu = Menu.buildFromTemplate([
    { label: `${name} · ${data?.bones?.species ?? ''}`, enabled: false },
    { type: 'separator' },
    { label: 'ASCII 模式', type: 'radio', checked: currentMode === 'ascii', click: () => switchMode('ascii') },
    { label: '像素模式',   type: 'radio', checked: currentMode === 'pixel', click: () => switchMode('pixel') },
    { type: 'separator' },
    { label: '显示 / 隐藏', click: () => { if (win) win.isVisible() ? win.hide() : win.show(); } },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// ── 创建窗口 ──
function createWindow(data, mode) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const sz = WINDOW_SIZES[mode] || WINDOW_SIZES.ascii;
  const cfg = loadConfig();
  // 定位：让精灵区域（top:100的下方）出现在屏幕右下角
  const wx = cfg.windowX != null ? cfg.windowX : sw - sz.width  - 20;
  const wy = cfg.windowY != null ? cfg.windowY : sh - sz.height - 10;

  win = new BrowserWindow({
    width: sz.width, height: sz.height,
    x: wx, y: wy,
    transparent: true, frame: false, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('buddy-data', { buddyData: data, mode });
  });

  win.on('moved', () => {
    const [x, y] = win.getPosition();
    const c = loadConfig(); c.windowX = x; c.windowY = y; saveConfig(c);
  });

  win.on('closed', () => { win = null; });
}

function createTray(data, mode) {
  const imgBuf = Buffer.from(TRAY_ICON_B64, 'base64');
  let icon = nativeImage.createFromBuffer(imgBuf).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip(`buddy-shelter: ${data?.soul?.name || 'buddy'}`);
  buildTrayMenu(data, mode);
  tray.on('click', () => tray.popUpContextMenu());
}

// ── IPC ──
// 渲染进程发来聊天消息，返回 Promise<string>
ipcMain.handle('chat-send', async (_event, message) => {
  return await handleChat(message);
});

// ── 启动 ──
app.whenReady().then(() => {
  fs.mkdirSync(SHELTER_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
  log('[startup] PID:', process.pid,
      '| ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY,
      '| platform:', process.platform);

  buddyData = loadBuddyData();
  const cfg  = loadConfig();
  const mode = cfg.mode || 'ascii';
  if (!fs.existsSync(CONFIG_FILE)) saveConfig({ mode });

  if (process.platform === 'darwin') app.dock.hide();

  createTray(buddyData, mode);
  createWindow(buddyData, mode);
  startIdleTimer();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  stopIdleTimer();
  try { fs.unlinkSync(PID_FILE); } catch {}
});

// ── 定时触发（idle 语句，15–30 分钟随机间隔）──
let idleTimerId = null;

function scheduleNextIdle() {
  // 15–30 分钟随机，单位 ms
  const delay = (15 + Math.random() * 15) * 60 * 1000;
  idleTimerId = setTimeout(() => {
    fireIdleMessage();
    scheduleNextIdle();  // 触发后立即排下一次
  }, delay);
}

function fireIdleMessage() {
  if (!win || !win.isVisible()) return;
  const phrase = getPresetReply(buddyData);
  log('[idle] firing phrase:', phrase);
  win.webContents.send('idle-message', phrase);
}

function stopIdleTimer() {
  if (idleTimerId) { clearTimeout(idleTimerId); idleTimerId = null; }
}

// 在 createWindow 之后调用
function startIdleTimer() {
  stopIdleTimer();
  scheduleNextIdle();
  log('[idle] timer started, first trigger in 15–30 min');
}
