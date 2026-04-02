// 渲染进程 — ASCII + 像素双模式 + 对话系统
'use strict';

// ── DOM ──
var asciiView   = document.getElementById('ascii-view');
var asciiPanel  = document.getElementById('ascii-panel');
var asciiSprite = document.querySelector('pre#ascii-sprite');
var asciiName   = document.getElementById('ascii-name');

var pixelView   = document.getElementById('pixel-view');
var pixelCanvas = document.getElementById('pixel-canvas');
var pixelName   = document.getElementById('pixel-name');
var pixelStats  = document.getElementById('pixel-stats');

var bubble      = document.getElementById('bubble');
var bubbleText  = document.getElementById('bubble-text');

var inputArea   = document.getElementById('input-area');
var chatInput   = document.getElementById('chat-input');
var chatClose   = document.getElementById('chat-close');

// 画布：内部 128×128（pixelSize=8），CSS 拉伸 160×160
var PIXEL_INTERNAL = 128;
var PIXEL_SIZE     = 8;
pixelCanvas.width  = PIXEL_INTERNAL;
pixelCanvas.height = PIXEL_INTERNAL;
var pixelCtx = pixelCanvas.getContext('2d');

// ── 状态 ──
var buddyData   = null;
var currentMode = 'ascii';
var isMirrorMode = false;
var bubbleDismissTimer = null;
var typewriterTimer    = null;
var bubbleVisible      = false;

// ── 工具 ──
function getRarityColor(rarity) {
  return ({ common:'#aaaaaa', uncommon:'#4caf50', rare:'#42a5f5', epic:'#ba68c8', legendary:'#ffd54f' })[rarity] || '#aaaaaa';
}

// ── ASCII 动画 ──
var BLINK_SEQ = [0,0,0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0,0];
var blinkIdx  = 0;
var asciiTimer = null;

function renderAsciiFrame(frame) {
  if (!buddyData) return;
  var bones = buddyData.bones;
  asciiSprite.style.color = getRarityColor(bones.rarity);
  asciiSprite.className   = bones.rarity || '';
  asciiSprite.textContent = renderSprite(bones, frame).join('\n');
}

function startAscii() {
  renderAsciiFrame(0);
  if (asciiTimer) clearInterval(asciiTimer);
  asciiTimer = setInterval(function() {
    renderAsciiFrame(BLINK_SEQ[blinkIdx++ % BLINK_SEQ.length]);
  }, 300);
}
function stopAscii() { if (asciiTimer) { clearInterval(asciiTimer); asciiTimer = null; } }

// ── 像素动画 ──
var pixelFrameRef = 0;
var pixelAnimId   = null;
var BLINK_CYCLE   = 170;

function getBlinkPhase(f) {
  var t = f % BLINK_CYCLE;
  if (t < 145) return 0;
  if (t < 151) return 1;
  if (t < 157) return 2;
  if (t < 163) return 1;
  return 0;
}

function renderPixelFrame() {
  if (!buddyData) return;
  var f   = pixelFrameRef;
  var bob = Math.sin(f * 0.05) * 2;
  var fidgetX = (f % 180 > 170) ? Math.sin(f * 0.5) : 0;
  pixelCtx.clearRect(0, 0, PIXEL_INTERNAL, PIXEL_INTERNAL);
  drawPixelSprite(pixelCtx, buddyData.bones.species, PIXEL_SIZE, Math.round(fidgetX), Math.round(bob), getBlinkPhase(f));
}

function pixelLoop() { pixelFrameRef++; renderPixelFrame(); pixelAnimId = requestAnimationFrame(pixelLoop); }
function startPixel() { renderPixelFrame(); if (!pixelAnimId) pixelAnimId = requestAnimationFrame(pixelLoop); }
function stopPixel()  { if (pixelAnimId) { cancelAnimationFrame(pixelAnimId); pixelAnimId = null; } }

// ── 模式切换 ──
function applyMode(mode) {
  currentMode = mode;
  if (mode === 'ascii') {
    asciiView.style.display = '';
    pixelView.style.display = 'none';
    stopPixel();
    if (buddyData) startAscii();
  } else {
    asciiView.style.display = 'none';
    pixelView.style.display = '';
    stopAscii();
    if (buddyData) startPixel();
  }
}

// ── 初始化 ──
function initBuddy(data) {
  buddyData = data;
  var bones = data.bones;
  var soul  = data.soul;
  var name  = (soul && soul.name) ? soul.name : bones.species;

  asciiName.textContent   = name + ' · ' + bones.species;
  pixelName.textContent   = name;
  pixelName.style.color   = getRarityColor(bones.rarity);
  if (bones.peakStat && bones.stats) {
    pixelStats.textContent = '↑' + bones.peakStat + ' ' + bones.stats[bones.peakStat] +
                             '  ↓' + bones.dumpStat + ' ' + bones.stats[bones.dumpStat];
  }
}

// ── 气泡 ──
function showBubble(text) {
  // 清除之前的计时器
  if (bubbleDismissTimer) { clearTimeout(bubbleDismissTimer); bubbleDismissTimer = null; }
  if (typewriterTimer)    { clearInterval(typewriterTimer);   typewriterTimer = null; }

  bubbleText.textContent = '';
  bubbleText.classList.add('typing');

  bubble.style.display = 'block';
  // 强制 reflow 再加 visible，触发 CSS transition
  bubble.getBoundingClientRect();
  bubble.classList.add('visible');
  bubbleVisible = true;

  // 打字机效果
  var i = 0;
  typewriterTimer = setInterval(function() {
    bubbleText.textContent += text[i++];
    if (i >= text.length) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
      bubbleText.classList.remove('typing');
      // 全部打完后 5 秒自动消失
      bubbleDismissTimer = setTimeout(hideBubble, 5000);
    }
  }, 38);
}

function hideBubble() {
  if (!bubbleVisible) return;
  if (bubbleDismissTimer) { clearTimeout(bubbleDismissTimer); bubbleDismissTimer = null; }
  if (typewriterTimer)    { clearInterval(typewriterTimer);   typewriterTimer = null; }
  bubble.classList.remove('visible');
  bubbleVisible = false;
  setTimeout(function() { bubble.style.display = 'none'; }, 260);
}

// ── 输入框 ──
function openInput() {
  if (bubbleVisible) hideBubble();
  inputArea.style.display = 'flex';
  chatInput.focus();
}

function closeInput() {
  inputArea.style.display = 'none';
  chatInput.value = '';
}

async function submitChat() {
  var msg = chatInput.value.trim();
  if (!msg) return;
  closeInput();

  // 先显示"思考中"气泡
  showBubble('...');

  try {
    var reply = await window.buddyBridge.sendChat(msg);
    // 拿到回复后重新显示
    showBubble(reply);
  } catch {
    showBubble(getOfflineReply());
  }
}

// 离线降级（渲染进程也有一份简单预设）
var OFFLINE = ['......', '哦', '嗯', '...', '好热', '继续'];
function getOfflineReply() { return OFFLINE[Math.floor(Math.random() * OFFLINE.length)]; }

// ── 事件绑定 ──

// 点击精灵区域打开输入框
// 用 mousedown/mouseup 区分"点击"与"拖动"
var mouseDownAt = null;
document.addEventListener('mousedown', function(e) {
  mouseDownAt = { x: e.screenX, y: e.screenY };
});
document.addEventListener('mouseup', function(e) {
  if (!mouseDownAt) return;
  var dx = Math.abs(e.screenX - mouseDownAt.x);
  var dy = Math.abs(e.screenY - mouseDownAt.y);
  mouseDownAt = null;
  if (dx > 5 || dy > 5) return;  // 是拖动，忽略

  // 点击在精灵区域内（排除气泡和输入框）
  var tgt = e.target;
  if (tgt === chatInput || tgt === chatClose) return;
  if (bubble.contains(tgt)) { hideBubble(); return; }
  if (inputArea.contains(tgt)) return;

  if (inputArea.style.display === 'none') {
    openInput();
  }
});

// Enter 发送，Escape 关闭
chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); submitChat(); }
  if (e.key === 'Escape') closeInput();
});

// 关闭按钮
chatClose.addEventListener('click', closeInput);

// ── IPC ──
window.buddyBridge.onBuddyData(function(payload) {
  initBuddy(payload.buddyData);
  applyMode(payload.mode || 'ascii');
});

window.buddyBridge.onSetMode(function(mode) {
  applyMode(mode);
});

// 检测 mirror 模式（port 非 null 即为 mirror）
window.buddyBridge.getMirrorPort().then(function(port) {
  isMirrorMode = port !== null;
});

// idle-message：idle 定时器 或 mirror WS bubble 都走这里
// mirror 模式下来自 Claude Code 的气泡优先级高，不受 inputOpen 拦截
window.buddyBridge.onIdleMessage(function(text) {
  console.log('[renderer] idle-message received:', text, '| bubbleVisible:', bubbleVisible, '| inputVisible:', inputArea.style.display, '| mirror:', isMirrorMode);
  if (bubbleVisible) { console.log('[renderer] skipped: bubble already visible'); return; }
  if (!isMirrorMode && inputArea.style.display !== 'none') { console.log('[renderer] skipped: input open'); return; }
  showBubble(text);
});
