/**
 * Móveis, natureza e mobiliário urbano em pixel art 3/4 (puro).
 * Convenção: (0,0) = canto superior esquerdo do footprint; y negativo = acima do chão.
 */
import type { TreeKind } from '../../types/world';
import type { PropType } from '../world/interiors';
import { MAT, mix, ramp, shade, type Ramp } from './core/color';
import { PixelBuf, rng } from './core/pixbuf';
import { finish, sheet, type Sprite } from './sheet';

const S = 16;

function monitor(b: PixelBuf, x: number, y: number, on = true) {
  b.rect(x + 3, y + 7, 2, 3, MAT.steelDark.base);
  b.rect(x + 1, y + 9, 6, 1, MAT.steelDark.dk);
  b.rect(x, y, 8, 7, '#23262f');
  b.rect(x + 1, y + 1, 6, 5, on ? '#4f86c6' : '#2b3442');
  if (on) {
    b.hline(x + 2, x + 5, y + 2, '#a8d2f2');
    b.hline(x + 2, x + 4, y + 4, '#7fb0e0');
  }
}

function plantPot(b: PixelBuf, cx: number, base: number, size: number, seed: number) {
  const r = rng(seed);
  const pot = ramp(['#c0663f', '#e9e4da', '#5d6470'][seed % 3], 0.12);
  b.rect(cx - 4, base - 7, 8, 7, pot.base);
  b.hline(cx - 4, cx + 3, base - 7, pot.lt);
  b.vline(cx + 3, base - 7, base - 1, pot.dk);
  b.rect(cx - 3, base - 8, 6, 1, '#5a3b26');
  const leaf = MAT.leaf;
  for (let i = 0; i < 9 + size * 4; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * (4 + size * 2);
    const x = cx + Math.cos(a) * d;
    const y = base - 11 - size * 3 + Math.sin(a) * d * 0.8;
    b.ellipse(x, y, 2.6, 2, i % 3 === 0 ? leaf.dk : i % 3 === 1 ? leaf.base : leaf.lt);
  }
  b.set(cx - 1, base - 15 - size * 3, leaf.hi);
}

function chairBack(b: PixelBuf, cx: number, y: number, c: Ramp) {
  // cadeira de escritório vista por trás (pessoa senta de costas para a câmera)
  b.rect(cx - 2, y + 9, 4, 2, MAT.steelDark.dk);
  b.rect(cx - 4, y + 11, 8, 1, MAT.rubber.base);
  b.round(cx - 5, y, 10, 9, c.base);
  b.hline(cx - 4, cx + 3, y + 1, c.lt);
  b.hline(cx - 4, cx + 3, y + 8, c.dk);
}

const CHAIR_COLORS = () => [MAT.fabricBlue, ramp('#3b4152', 0.14), MAT.fabricGreen, ramp('#8a3b3b', 0.12)];

/** Cadeira vista de frente (encosto ao norte, assento visível): a pessoa senta olhando para a câmera. */
export function chairFrontSprite(variant: number): Sprite {
  const s = sheet(1, 1, 12);
  const b = s.buf;
  const c = CHAIR_COLORS()[variant % 4];
  // encosto (atrás)
  b.rect(3, -8, 10, 9, c.dk);
  b.rect(4, -7, 8, 7, c.base);
  b.hline(4, 11, -7, c.lt);
  // assento
  b.rect(2, 2, 12, 6, c.base);
  b.hline(2, 13, 2, c.lt);
  b.hline(2, 13, 7, c.dk);
  // pés
  b.rect(3, 8, 2, 5, MAT.steelDark.base);
  b.rect(11, 8, 2, 5, MAT.steelDark.dk);
  return finish(s, { cx: 8, cy: 14, rx: 6, ry: 2 });
}

/** Tipo usado na chave de textura (a cadeira virada para o sul tem sprite próprio). */
export function propKeyType(p: { type: PropType; face?: string }): string {
  return p.type === 'chair' && p.face === 'S' ? 'chairS' : p.type;
}

export function propSprite(type: PropType, wT: number, hT: number, variant: number): Sprite {
  const w = wT * S;
  const h = hT * S;
  switch (type) {
    case 'desk': {
      const s = sheet(wT, hT, 12, 4, 10);
      const b = s.buf;
      const top = variant % 3 === 0 ? MAT.white : MAT.oak;
      b.rect(1, 6, 2, 10, MAT.steel.dk);
      b.rect(w - 3, 6, 2, 10, MAT.steel.dk);
      b.front(w - 12, 6, 10, 9, ramp('#d9d6cf', 0.06));
      b.hline(w - 9, w - 6, 9, '#8d8a83');
      b.top(0, -4, w, 10, top);
      b.hline(0, w - 1, 6, top.dk);
      monitor(b, 4, -11, true);
      if (w >= 32) monitor(b, 16, -11, variant % 2 === 0);
      // teclado com teclas, mouse e mousepad
      b.rect(6, 1, 10, 3, '#2b2f3a');
      for (let x = 7; x < 15; x += 2) b.set(x, 2, '#5a6070');
      b.rect(17, 1, 4, 3, '#3b4f6b');
      b.rect(18, 1, 2, 2, '#d5dbe0');
      // papéis, caneca, porta-canetas / luminária
      b.rect(w - 10, -2, 5, 4, '#f4f2ec');
      b.hline(w - 9, w - 7, -1, '#a3a8b0');
      b.rect(w - 4, -1, 3, 3, ['#d9534f', '#3f74c8', '#f2c14e', '#4f9a52'][variant % 4]);
      b.set(w - 4, -1, '#ffffff');
      if (variant % 2) {
        b.vline(1, -12, -2, '#3b4152');
        b.rect(1, -13, 5, 2, '#3b4152');
        b.rect(3, -11, 3, 1, '#ffe7a3');
      } else {
        b.rect(1, -4, 3, 4, '#5d6470');
        b.set(1, -6, '#c8463b');
        b.set(2, -7, '#3f74c8');
      }
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2 + 1, ry: 3 });
    }
    case 'chair': {
      const s = sheet(1, 1, 4);
      chairBack(s.buf, 8, 3, [MAT.fabricBlue, ramp('#3b4152', 0.14), MAT.fabricGreen, ramp('#8a3b3b', 0.12)][variant % 4]);
      return finish(s, { cx: 8, cy: 14, rx: 5, ry: 2 });
    }
    case 'plant': {
      const s = sheet(1, 1, 18);
      plantPot(s.buf, 8, 15, 1, variant);
      return finish(s, { cx: 8, cy: 15, rx: 5, ry: 2 });
    }
    case 'shelf': {
      const s = sheet(wT, hT, 22);
      const b = s.buf;
      const wood = MAT.walnut;
      b.top(0, -22, w, 4, wood);
      b.front(0, -18, w, 32, wood);
      const r = rng(variant + 5);
      for (let row = 0; row < 3; row++) {
        const y = -16 + row * 10;
        b.rect(2, y, w - 4, 8, wood.dd);
        for (let x = 3; x < w - 3; ) {
          const bw = 2 + Math.floor(r() * 2);
          const bh = 5 + Math.floor(r() * 3);
          b.rect(x, y + 8 - bh, bw, bh, ['#c8463b', '#3f74c8', '#e8b928', '#4f9a52', '#eae6dc', '#8d66cf'][Math.floor(r() * 6)]);
          x += bw + (r() < 0.2 ? 2 : 0);
        }
        b.hline(2, w - 3, y + 8, wood.lt);
      }
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'cabinet':
    case 'locker': {
      const s = sheet(1, 1, 16);
      const b = s.buf;
      const m = type === 'locker' ? ramp(['#5b7fa8', '#7b8794', '#4f8a6c'][variant % 3], 0.1) : ramp('#9aa3ad', 0.09);
      b.top(1, -16, 14, 4, m);
      b.front(1, -12, 14, 27, m);
      if (type === 'locker') {
        b.vline(8, -11, 13, m.dk);
        for (let y = -9; y < -5; y += 2) (b.hline(3, 6, y, m.dk), b.hline(10, 13, y, m.dk));
        b.set(6, 2, m.hi);
        b.set(10, 2, m.hi);
      } else for (let y = -6; y < 14; y += 7) (b.hline(2, 13, y, m.dk), b.hline(6, 9, y + 3, m.hi));
      return finish(s, { cx: 8, cy: 15, rx: 7, ry: 2 });
    }
    case 'cooler': {
      const s = sheet(1, 1, 18);
      const b = s.buf;
      b.ellipse(8, -14, 4, 3, '#9fd0ea');
      b.rect(4, -16, 8, 6, 'rgba(160,210,236,0.85)');
      b.hline(5, 10, -15, '#d9f0fb');
      b.front(3, -10, 10, 25, MAT.white);
      b.rect(5, -6, 2, 2, '#3f74c8');
      b.rect(9, -6, 2, 2, '#c8463b');
      return finish(s, { cx: 8, cy: 15, rx: 6, ry: 2 });
    }
    case 'printer': {
      const s = sheet(1, 1, 8);
      const b = s.buf;
      b.front(1, 2, 14, 13, ramp('#d8d6d0', 0.06));
      b.top(1, -6, 14, 8, ramp('#e9e7e2', 0.05));
      b.rect(3, -4, 10, 3, '#2b2f3a');
      b.rect(4, -5, 8, 2, '#f8f8f6');
      b.set(12, 5, '#4fbf65');
      return finish(s, { cx: 8, cy: 15, rx: 7, ry: 2 });
    }
    case 'sofa': {
      const s = sheet(wT, hT, 10);
      const b = s.buf;
      const f = MAT.fabricGreen;
      b.top(0, -10, w, 8, f);
      b.front(0, -2, w, 16, f);
      for (let x = 2; x < w - 2; x += Math.floor((w - 4) / 3)) b.round(x, 0, Math.floor((w - 4) / 3) - 1, 7, f.lt);
      b.rect(0, -6, 3, 18, f.dk);
      b.rect(w - 3, -6, 3, 18, f.dk);
      b.rect(5, -6, 5, 4, '#e8b928');
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2 + 1, ry: 3 });
    }
    case 'coffeetable': {
      const s = sheet(1, 1, 4);
      const b = s.buf;
      b.top(1, 2, 14, 8, MAT.oak);
      b.front(1, 10, 14, 3, MAT.oak);
      b.rect(4, 4, 3, 3, '#f5f3ee');
      return finish(s, { cx: 8, cy: 14, rx: 7, ry: 2 });
    }
    case 'tvstand': {
      const s = sheet(wT, hT, 6);
      const b = s.buf;
      b.top(0, -2, w, 6, MAT.walnut);
      b.front(0, 4, w, 10, MAT.walnut);
      b.rect(4, 6, 8, 6, MAT.walnut.dd);
      b.rect(w - 14, 6, 10, 6, MAT.walnut.dd);
      b.rect(6, -6, 10, 4, '#2b2f3a');
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'fridge': {
      const s = sheet(1, 1, 18);
      const b = s.buf;
      const m = ramp('#e8eaec', 0.05);
      b.top(1, -18, 14, 4, m);
      b.front(1, -14, 14, 29, m);
      b.hline(2, 13, -4, m.dk);
      b.vline(12, -12, -6, MAT.steel.dk);
      b.vline(12, -2, 6, MAT.steel.dk);
      b.rect(4, -12, 3, 2, '#f2c14e');
      return finish(s, { cx: 8, cy: 15, rx: 7, ry: 2 });
    }
    case 'counter': {
      const s = sheet(wT, hT, 6);
      const b = s.buf;
      b.top(0, -2, w, 7, ramp('#d8d3c8', 0.06));
      b.front(0, 5, w, 10, ramp('#8a6446', 0.1));
      for (let x = 15; x < w; x += 16) b.vline(x, 6, 14, '#6b4c34');
      b.rect(4, -1, 8, 4, '#b8c4cc');
      b.rect(6, 0, 4, 2, '#7f9cad');
      b.rect(w - 12, -4, 6, 5, '#2b2f3a');
      b.rect(w - 11, -3, 4, 2, '#c8463b');
      b.rect(20 % w, -1, 3, 3, '#f5f3ee');
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'bin': {
      const s = sheet(1, 1, 6);
      const b = s.buf;
      const m = ramp(['#5d6470', '#3f74c8', '#4f9a52', '#c8463b'][variant % 4], 0.1);
      b.ellipse(8, 7, 4, 2, m.dk);
      b.rect(4, 7, 8, 7, m.base);
      b.vline(4, 7, 13, m.lt);
      b.vline(11, 7, 13, m.dk);
      b.ellipse(8, 7, 3, 1.4, '#2b2f3a');
      b.set(7, 6, '#f4f2ec');
      b.set(9, 6, '#e9e4d6');
      return finish(s, { cx: 8, cy: 14, rx: 5, ry: 2 });
    }
    case 'coatrack': {
      const s = sheet(1, 1, 26);
      const b = s.buf;
      b.ellipse(8, 13, 4, 1.5, MAT.walnut.dk);
      b.rect(7, -22, 2, 35, MAT.walnut.base);
      b.vline(7, -22, 12, MAT.walnut.lt);
      for (const [x, y] of [[4, -21], [11, -21], [4, -16], [11, -16]]) b.rect(x, y, 2, 1, MAT.walnut.dk);
      // casaco e capacete pendurados
      const coat = ramp(['#3d4a5c', '#8a3b3b', '#4f6b8a', '#5c5040'][variant % 4], 0.1);
      b.rect(9, -20, 5, 13, coat.base);
      b.vline(13, -20, -8, coat.dk);
      b.hline(9, 13, -20, coat.lt);
      b.ellipse(4, -21, 3, 2, '#f4f5f6');
      b.hline(1, 7, -19, '#c9ccd1');
      return finish(s, { cx: 8, cy: 14, rx: 4, ry: 1.5 });
    }
    case 'meetingtable': {
      // mesa sem cadeiras embutidas (as cadeiras são props separados, cada uma um assento)
      const s = sheet(wT, hT, 8);
      const b = s.buf;
      const top = variant % 2 ? MAT.white : MAT.oak;
      b.top(0, -2, w, h - 2, top);
      b.front(0, h - 4, w, 4, top);
      b.rect(2, h, 2, 4, top.dd);
      b.rect(w - 4, h, 2, 4, top.dd);
      for (let x = 6; x < w - 6; x += 16) {
        b.rect(x, 1, 6, 4, '#f5f3ee');
        b.rect(x + 8, 2, 3, 3, ['#c8463b', '#3f74c8', '#4f8a6c'][(x + variant) % 3]);
      }
      return finish(s, { cx: w / 2, cy: h, rx: w / 2 + 1, ry: 2 });
    }
    case 'server': {
      const s = sheet(1, 1, 20);
      const b = s.buf;
      const m = ramp('#2b2f3a', 0.1);
      b.top(1, -20, 14, 4, m);
      b.front(1, -16, 14, 31, m);
      for (let y = -14; y < 12; y += 4) {
        b.hline(3, 12, y, '#11141b');
        b.set(4, y + 1, (y + variant) % 8 === 0 ? '#5ef08a' : '#3fa8f0');
        b.set(6, y + 1, '#5ef08a');
      }
      return finish(s, { cx: 8, cy: 15, rx: 7, ry: 2 });
    }
    case 'labbench': {
      const s = sheet(wT, hT, 14);
      const b = s.buf;
      b.top(0, -2, w, 8, ramp('#e6eaed', 0.05));
      b.front(0, 6, w, 9, ramp('#8fa3b3', 0.08));
      for (let x = 15; x < w; x += 16) b.vline(x, 7, 14, '#6f8291');
      // vidrarias
      b.rect(4, -8, 3, 7, 'rgba(160,210,236,0.9)');
      b.rect(4, -4, 3, 3, '#5ec27a');
      b.ellipse(13, -2, 3, 2, 'rgba(160,210,236,0.9)');
      b.rect(12, -8, 2, 5, 'rgba(160,210,236,0.9)');
      b.rect(w - 12, -9, 8, 8, '#d8d6d0');
      b.rect(w - 11, -8, 6, 4, '#2b3442');
      b.hline(w - 10, w - 7, -6, '#5ef08a');
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'hood': {
      const s = sheet(wT, hT, 26);
      const b = s.buf;
      const m = ramp('#d9dde2', 0.06);
      b.top(0, -26, w, 5, m);
      b.front(0, -21, w, 36, m);
      b.rect(3, -18, w - 6, 16, 'rgba(150,200,226,0.75)');
      b.hline(3, w - 4, -18, '#eef7fb');
      b.rect(3, -2, w - 6, 3, '#b9c0c6');
      b.rect(6, -12, 3, 8, 'rgba(255,255,255,0.5)');
      b.set(w - 6, 6, '#e8b928');
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'stove': {
      const s = sheet(wT, hT, 8);
      const b = s.buf;
      b.top(0, -4, w, 9, ramp('#cfd3d6', 0.05));
      b.front(0, 5, w, 10, ramp('#b9bec2', 0.06));
      for (let i = 0; i < Math.max(2, wT * 2); i++) {
        const cx = 5 + i * 7;
        if (cx > w - 4) break;
        b.ellipse(cx, 0, 3, 2, '#2b2f3a');
        b.ellipse(cx, 0, 1.5, 1, '#d9534f');
      }
      b.rect(3, 8, w - 6, 5, '#2b2f3a');
      b.hline(4, w - 5, 9, '#5d6470');
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'sink': {
      const s = sheet(wT, hT, 10);
      const b = s.buf;
      b.top(0, -2, w, 8, ramp('#e9e7e2', 0.05));
      b.front(0, 6, w, 9, ramp('#d8d3c8', 0.06));
      for (let x = 3; x + 8 <= w; x += 12) {
        b.rect(x, -1, 8, 5, '#9fb6c4');
        b.rect(x + 1, 0, 6, 3, '#c9dbe6');
        b.rect(x + 3, -6, 2, 5, MAT.steel.base);
        b.hline(x + 3, x + 5, -6, MAT.steel.hi);
      }
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'table': {
      const s = sheet(wT, hT, 8, 8, 8);
      const b = s.buf;
      // cadeiras ao redor
      const ch = MAT.fabricBlue;
      for (let x = 6; x < w - 4; x += 10) b.round(x, -6, 7, 6, ch.base);
      b.top(0, -2, w, h - 4, MAT.oak);
      b.front(0, h - 6, w, 4, MAT.oak);
      b.rect(2, h - 2, 2, 4, MAT.oak.dd);
      b.rect(w - 4, h - 2, 2, 4, MAT.oak.dd);
      for (let x = 6; x < w - 4; x += 10) b.round(x, h, 7, 6, ch.lt);
      b.rect(6, 2, 6, 4, '#f5f3ee');
      b.rect(w - 10, 4, 3, 3, '#c8463b');
      return finish(s, { cx: w / 2, cy: h, rx: w / 2 + 2, ry: 3 });
    }
    case 'bench': {
      const s = sheet(wT, hT, 6);
      const b = s.buf;
      b.top(0, 2, w, 6, MAT.oak);
      b.front(0, 8, w, 3, MAT.oak);
      b.rect(2, 11, 2, 4, MAT.steelDark.base);
      b.rect(w - 4, 11, 2, 4, MAT.steelDark.base);
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'toolbench': {
      const s = sheet(wT, hT, 10);
      const b = s.buf;
      b.top(0, -4, w, 9, ramp('#9a6f45', 0.1));
      b.front(0, 5, w, 10, ramp('#c8463b', 0.1));
      for (let x = 2; x < w - 4; x += 8) (b.rect(x, 7, 6, 3, '#a6362e'), b.hline(x + 2, x + 3, 8, '#e0e0e0'));
      b.rect(3, -2, 6, 3, '#5a5f68');
      b.rect(12, -3, 2, 5, '#e8b928');
      b.rect(w - 10, -6, 7, 5, MAT.steel.base);
      b.hline(w - 10, w - 4, -6, MAT.steel.hi);
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'tires': {
      const s = sheet(1, 1, 12);
      const b = s.buf;
      for (let i = 0; i < 3; i++) {
        const y = 10 - i * 6;
        b.ellipse(8, y, 7, 4, MAT.rubber.base);
        b.ellipse(8, y - 1, 7, 3.5, MAT.rubber.lt);
        b.ellipse(8, y - 1, 3, 1.5, MAT.rubber.dd);
      }
      return finish(s, { cx: 8, cy: 14, rx: 7, ry: 2 });
    }
    case 'compressor': {
      const s = sheet(1, 1, 10);
      const b = s.buf;
      b.ellipse(8, 9, 7, 5, ramp('#c8463b', 0.1).base);
      b.ellipse(8, 7, 7, 4, ramp('#c8463b', 0.1).lt);
      b.rect(4, -3, 8, 6, MAT.steelDark.base);
      b.ellipse(11, -1, 2, 2, '#f5f3ee');
      return finish(s, { cx: 8, cy: 14, rx: 7, ry: 2 });
    }
    case 'drums': {
      const s = sheet(1, 1, 12);
      const b = s.buf;
      const colors = ['#2f6db5', '#c8463b', '#3f8f4a', '#e8b928'];
      for (const [dx, dy, ci] of [[4, 6, variant], [11, 6, variant + 1], [7.5, 13, variant + 2]] as const) {
        const m = ramp(colors[ci % 4], 0.12);
        b.rect(dx - 3.5, dy - 9, 7, 8, m.base);
        b.vline(dx - 3, dy - 9, dy - 2, m.lt);
        b.hline(dx - 3, dx + 3, dy - 5, m.dk);
        b.ellipse(dx, dy - 9, 3.5, 2, m.lt);
        b.set(dx + 1, dy - 10, m.dd);
      }
      return finish(s, { cx: 8, cy: 14, rx: 8, ry: 3 });
    }
    case 'pallet':
    case 'boxes': {
      const s = sheet(1, 1, 12);
      const b = s.buf;
      const wood = ramp('#b8915e', 0.1);
      if (type === 'pallet') {
        b.top(1, 9, 14, 3, wood);
        b.front(1, 12, 14, 3, wood);
        for (const x of [2, 7, 12]) b.rect(x, 12, 2, 3, wood.dd);
      }
      const box = ramp('#c9a06a', 0.1);
      b.top(2, -4, 12, 6, box);
      b.front(2, 2, 12, 8, box);
      b.vline(8, -4, 9, '#a07c4e');
      b.hline(3, 13, -1, '#e3c58f');
      if (variant % 2) {
        b.top(4, -10, 8, 4, box);
        b.front(4, -6, 8, 3, box);
      }
      return finish(s, { cx: 8, cy: 14, rx: 7, ry: 2 });
    }
    case 'rack': {
      const s = sheet(wT, hT, 28);
      const b = s.buf;
      const beam = ramp('#e07a25', 0.1);
      const post = ramp('#2f5d9a', 0.1);
      const r = rng(variant * 7 + 1);
      for (let lvl = 0; lvl < 3; lvl++) {
        const y = 10 - lvl * 13;
        for (let x = 2; x < w - 8; x += 12) {
          if (r() < 0.15) continue;
          const box = ramp(['#c9a06a', '#b5bdc4', '#3f74c8'][Math.floor(r() * 3)], 0.1);
          b.top(x, y - 10, 10, 4, box);
          b.front(x, y - 6, 10, 6, box);
        }
        b.rect(0, y, w, 2, beam.base);
        b.hline(0, w - 1, y, beam.lt);
      }
      for (const x of [0, w - 2]) b.rect(x, -28, 2, 44, post.base);
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    case 'forklift': {
      const s = sheet(1, 2, 14);
      const b = s.buf;
      const body = MAT.yellow;
      b.rect(2, 22, 3, 8, MAT.rubber.base);
      b.rect(11, 22, 3, 8, MAT.rubber.base);
      b.top(2, 6, 12, 10, body);
      b.front(2, 16, 12, 10, body);
      b.rect(3, -8, 2, 16, MAT.steelDark.base);
      b.rect(11, -8, 2, 16, MAT.steelDark.base);
      b.hline(3, 12, -8, MAT.steelDark.lt);
      b.rect(4, 8, 8, 5, '#2b2f3a');
      b.rect(5, 2, 2, 4, MAT.steel.base);
      b.rect(9, 2, 2, 4, MAT.steel.base);
      return finish(s, { cx: 8, cy: 30, rx: 8, ry: 3 });
    }
    case 'gatedesk': {
      const s = sheet(wT, hT, 12);
      const b = s.buf;
      b.top(0, -4, w, 10, ramp('#d8d3c8', 0.06));
      b.front(0, 6, w, 9, ramp('#5d6470', 0.1));
      monitor(b, 3, -11, true);
      monitor(b, 13, -11, true);
      b.rect(w - 9, -2, 6, 4, '#2b2f3a');
      b.set(w - 7, -1, '#4fbf65');
      return finish(s, { cx: w / 2, cy: 15, rx: w / 2, ry: 2 });
    }
    default: {
      const s = sheet(wT, hT, 4);
      s.buf.rect(0, 0, w, h, 'rgba(0,0,0,0)');
      return s;
    }
  }
}

/* ------------------------------------------------------------------ natureza */

/**
 * Quadro de vento: inclina a copa (cisalhamento crescente para o alto), tronco parado.
 * `amount` = deslocamento (px) no topo.
 */
export function swayed(s: Sprite, amount: number): Sprite {
  const src = s.buf;
  const out = new PixelBuf(src.w, src.h);
  out.ox = src.ox;
  out.oy = src.oy;
  const cut = Math.max(1, s.ay - 2);
  for (let y = 0; y < src.h; y++) {
    const sh = y < cut ? Math.round((amount * (cut - y)) / cut) : 0;
    for (let x = 0; x < src.w; x++) {
      const sx = x - sh;
      if (sx < 0 || sx >= src.w) continue;
      const i = (y * src.w + sx) * 4;
      const j = (y * src.w + x) * 4;
      for (let k = 0; k < 4; k++) out.data[j + k] = src.data[i + k];
    }
  }
  return { buf: out, ax: s.ax, ay: s.ay };
}

export function treeSprite(kind: TreeKind, variant: number): Sprite {
  const r = rng(variant * 13 + 7);
  if (kind === 'pine') {
    const s = sheet(1, 1, 44, 10, 4);
    const b = s.buf;
    b.rect(6, 4, 4, 11, MAT.bark.base);
    b.vline(6, 4, 14, MAT.bark.lt);
    const p = MAT.pine;
    for (let i = 0; i < 4; i++) {
      const y = 6 - i * 10;
      const half = 13 - i * 3;
      for (let yy = 0; yy < 12; yy++) {
        const hw = Math.round((half * yy) / 12);
        b.hline(8 - hw, 8 + hw, y - 12 + yy, yy > 9 ? p.dk : p.base);
        b.set(8 - hw, y - 12 + yy, p.lt);
      }
    }
    for (let i = 0; i < 18; i++) b.set(2 + r() * 12, -30 + r() * 34, r() < 0.5 ? p.hi : p.dd);
    return finish(s, { cx: 8, cy: 14, rx: 10, ry: 4, a: 0.3 });
  }
  if (kind === 'bush') {
    const s = sheet(1, 1, 8);
    const b = s.buf;
    const l = MAT.leaf;
    b.ellipse(8, 9, 8, 6, l.dk);
    b.ellipse(7, 7, 7, 5, l.base);
    b.ellipse(6, 5, 4, 3, l.lt);
    for (let i = 0; i < 8; i++) b.set(2 + r() * 12, 3 + r() * 9, r() < 0.5 ? l.hi : l.dd);
    if (variant % 3 === 0) for (let i = 0; i < 4; i++) b.set(3 + r() * 10, 3 + r() * 7, '#f4e3f0');
    return finish(s, { cx: 8, cy: 14, rx: 8, ry: 3 });
  }
  const s = sheet(1, 1, 40, 12, 4);
  const b = s.buf;
  b.rect(6, -2, 4, 17, MAT.bark.base);
  b.vline(6, -2, 14, MAT.bark.lt);
  b.vline(9, -2, 14, MAT.bark.dk);
  const l = variant % 2 ? MAT.leaf : ramp('#5a9a3c', 0.13);
  b.ellipse(8, -14, 15, 13, l.dk);
  b.ellipse(7, -16, 14, 12, l.base);
  b.ellipse(4, -20, 8, 7, l.lt);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 12;
    b.ellipse(8 + Math.cos(a) * d, -15 + Math.sin(a) * d * 0.85, 2, 1.6, r() < 0.4 ? l.hi : r() < 0.7 ? l.lt : l.dd);
  }
  return finish(s, { cx: 9, cy: 13, rx: 13, ry: 5, a: 0.3 });
}

export function hedgeSprite(wT: number, hT: number): Sprite {
  const s = sheet(wT, hT, 8);
  const b = s.buf;
  const w = wT * S;
  const h = hT * S;
  const l = MAT.leafDark;
  b.rect(0, -6, w, h, l.lt);
  b.rect(0, h - 6, w, 8, l.base);
  b.hline(0, w - 1, h + 1, l.dk);
  const r = rng(w * 7 + h);
  for (let i = 0; i < (w * h) / 10; i++) b.set(r() * w, -6 + r() * (h + 6), r() < 0.5 ? l.hi : l.dk);
  return finish(s, { cx: w / 2, cy: h, rx: w / 2 + 1, ry: 3 });
}

export function lampSprite(): Sprite {
  const s = sheet(1, 1, 42, 6, 4);
  const b = s.buf;
  const m = MAT.steelDark;
  b.rect(6, 10, 4, 4, m.dk);
  b.rect(7, -32, 2, 43, m.base);
  b.vline(7, -32, 10, m.lt);
  b.rect(4, -36, 9, 4, m.dk);
  b.rect(5, -32, 7, 2, '#fff2c4');
  return finish(s, { cx: 8, cy: 13, rx: 4, ry: 2 });
}

export function parkBenchSprite(): Sprite {
  const s = sheet(2, 1, 10);
  const b = s.buf;
  b.rect(2, 10, 2, 5, MAT.steelDark.base);
  b.rect(28, 10, 2, 5, MAT.steelDark.base);
  b.rect(0, -4, 32, 4, MAT.oak.base);
  b.hline(0, 31, -4, MAT.oak.lt);
  b.top(0, 2, 32, 6, MAT.oak);
  b.front(0, 8, 32, 3, MAT.oak);
  return finish(s, { cx: 16, cy: 14, rx: 16, ry: 2 });
}

export function signSprite(text: string): Sprite {
  const wT = Math.max(4, Math.ceil(text.length * 0.45));
  const s = sheet(wT, 1, 30);
  const b = s.buf;
  const w = wT * S;
  b.rect(4, -6, 3, 20, MAT.steelDark.base);
  b.rect(w - 7, -6, 3, 20, MAT.steelDark.base);
  b.rect(0, -28, w, 22, '#20242e');
  b.rect(2, -26, w - 4, 18, '#2a2f3b');
  b.rect(2, -26, w - 4, 4, '#f2b632');
  return finish(s, { cx: w / 2, cy: 14, rx: w / 2, ry: 2 });
}

export function chimneySprite(): Sprite {
  const s = sheet(2, 2, 54, 6, 2);
  const b = s.buf;
  const m = ramp('#8d949b', 0.1);
  for (let y = -50; y < 28; y++) {
    for (let x = 6; x < 26; x++) {
      const t = (x - 6) / 20;
      b.set(x, y, t < 0.3 ? m.lt : t < 0.75 ? m.base : m.dk);
    }
  }
  for (const y of [-44, -40]) b.rect(6, y, 20, 3, y === -44 ? '#c8463b' : '#f4f2ee');
  b.ellipse(16, -50, 10, 4, m.dk);
  b.ellipse(16, -50, 7, 2.5, '#2a2d34');
  return finish(s);
}

export function canopyRoof(wT: number, hT: number): Sprite {
  const s = sheet(wT, hT, 30, 4, 4);
  const b = s.buf;
  const w = wT * S;
  const h = hT * S;
  const roof = ramp('#e9ecef', 0.05);
  b.rect(0, -28, w, h - 8, 'rgba(236,238,241,0.78)');
  for (let x = 0; x < w; x += 6) b.vline(x, -28, h - 37, 'rgba(200,205,210,0.6)');
  b.rect(0, h - 36, w, 6, '#6b4fa0');
  b.hline(0, w - 1, h - 36, mix('#6b4fa0', '#ffffff', 0.4));
  b.rect(0, h - 30, w, 2, shade('#6b4fa0', -0.4));
  b.hline(0, w - 1, -28, roof.hi);
  for (const x of [6, w - 10]) for (const y of [h - 28, 0]) b.rect(x, y, 4, 28, 'rgba(120,126,134,0.9)');
  return s;
}
