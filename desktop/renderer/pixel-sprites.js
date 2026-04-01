// 像素精灵系统 — 基于 buddy-reveal 的 Canvas sprite 架构
// 颜色参照 spec 要求的 cactus 配色方案
'use strict';

// 调色板 — 每个物种一组颜色，目前只实现 cactus
// 索引映射: 0=透明 1=body 2=dark 3=light 4=beak/accent 5=eye 6=blush
var PIXEL_PALETTES = {
  cactus: {
    body:  '#5fa845',  // 浅绿（主体）
    dark:  '#2d5a1e',  // 深绿（轮廓/阴影）
    light: '#7bc464',  // 更浅绿（高光）
    beak:  '#a8d65c',  // 亮黄绿（刺）
    eye:   '#ffffff',  // 白色（白底黑瞳的"底"）
    blush: '#fda4af',
    feet:  '#2d5a1e',
  },
  // 未实现物种降级用 blob
  _default: {
    body:  '#7cdf64', dark:  '#4ba83d', light: '#b8f5a0',
    beak:  '#4ba83d', eye:   '#1a1a2e', blush: '#fda4af', feet: '#4ba83d',
  },
};

// 16×16 像素精灵数据（来自 buddy-reveal，cactus 物种）
var PIXEL_SPRITES = {
  cactus: [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,4,4,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,3,3,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,5,5,1,0,0,0,0,0,0,0],  // row 4: 眼睛
    [0,0,0,0,0,1,6,6,1,0,0,0,0,0,0,0],  // row 5: 腮红
    [0,0,1,1,0,1,4,1,0,1,1,0,0,0,0,0],  // row 6: 侧臂 + 刺
    [0,0,1,3,1,1,1,1,1,3,1,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,1,0,1,1,1,0,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,2,1,2,0,0,0,0,0,0,0,0],
    [0,0,0,0,2,2,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
};

// 眼睛所在行（用于精确定位眨眼区域）
var EYE_ROWS = { cactus: [4] };

// 三相眨眼的眼睛颜色序列
// blinkPhase 0=睁眼, 1=半闭, 2=闭眼
function getEyeColor(palette, blinkPhase) {
  if (blinkPhase === 0) return palette.eye;          // 白色（睁眼）
  if (blinkPhase === 1) return palette.light;        // 浅绿（半闭，用浅绿过渡）
  return palette.body;                               // 绿色（完全闭合，与身体同色）
}

/**
 * 绘制像素精灵
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} species
 * @param {number} pixelSize - 每个逻辑像素的 canvas 像素数
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} blinkPhase - 0/1/2
 */
function drawPixelSprite(ctx, species, pixelSize, offsetX, offsetY, blinkPhase) {
  var spriteData = PIXEL_SPRITES[species];
  if (!spriteData) return;
  var palette = PIXEL_PALETTES[species] || PIXEL_PALETTES._default;

  var colorMap = {
    1: palette.body,
    2: palette.dark,
    3: palette.light,
    4: palette.beak,
    5: getEyeColor(palette, blinkPhase),
    6: palette.blush,
    7: palette.feet || palette.dark,
  };

  for (var y = 0; y < 16; y++) {
    for (var x = 0; x < 16; x++) {
      var val = spriteData[y][x];
      if (val === 0) continue;
      ctx.fillStyle = colorMap[val] || palette.body;
      ctx.fillRect(
        Math.round(offsetX + x * pixelSize),
        Math.round(offsetY + y * pixelSize),
        pixelSize,
        pixelSize
      );
    }
  }
}
