/**
 * Equipamentos industriais em pixel art 3/4 (puro).
 * (0,0) = canto superior esquerdo do footprint; y negativo = acima do chão.
 */
import type { Machine } from '../../types/world';
import { MAT, ramp, shade, type Ramp } from './core/color';
import { PixelBuf } from './core/pixbuf';
import { finish, sheet, type Sprite } from './sheet';

const S = 16;

/** Cilindro vertical: base elíptica no rodapé do footprint, topo elevado `hgt` px. */
function cylinder(b: PixelBuf, cx: number, baseY: number, rx: number, ry: number, hgt: number, body: Ramp, roof: Ramp) {
  for (let x = Math.floor(cx - rx); x < Math.ceil(cx + rx); x++) {
    const t = (x + 0.5 - cx) / rx;
    if (Math.abs(t) > 1) continue;
    const off = ry * Math.sqrt(1 - t * t);
    const c = t < -0.55 ? body.lt : t < -0.15 ? body.hi : t < 0.35 ? body.base : t < 0.75 ? body.dk : body.dd;
    for (let y = Math.round(baseY - hgt); y < Math.round(baseY + off); y++) b.set(x, y, c);
    // anéis do costado
    for (const k of [0.33, 0.66]) b.set(x, Math.round(baseY - hgt * k + off), shade(c, -0.12));
  }
  b.ellipse(cx, baseY - hgt, rx, ry, roof.dk);
  b.ellipse(cx, baseY - hgt - 1, rx - 1, ry - 0.5, roof.base);
  b.ellipse(cx - rx * 0.25, baseY - hgt - 2, rx * 0.55, ry * 0.5, roof.lt);
  b.ellipse(cx - rx * 0.32, baseY - hgt - 3, rx * 0.22, ry * 0.2, roof.hi);
}

function railingTop(b: PixelBuf, cx: number, cy: number, rx: number, ry: number) {
  for (let a = 0; a < Math.PI * 2; a += 0.22) {
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    b.set(x, y - 3, '#e3e6ea');
    if (Math.round(a * 10) % 4 === 0) b.vline(Math.round(x), Math.round(y - 3), Math.round(y), '#9aa3ad');
  }
}

function ladder(b: PixelBuf, x: number, y0: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    b.set(x, y, '#5a5f68');
    b.set(x + 3, y, '#5a5f68');
    if ((y - y0) % 3 === 0) b.hline(x, x + 3, y, '#7d838c');
  }
}

/** Espelha horizontalmente (a folha tem margens simétricas, então a âncora não muda). */
function mirrorX(s: Sprite): Sprite {
  const b = s.buf;
  const out = new PixelBuf(b.w, b.h);
  out.ox = b.ox;
  out.oy = b.oy;
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const i = (y * b.w + x) * 4;
      const j = (y * b.w + (b.w - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) out.data[j + k] = b.data[i + k];
    }
  return { buf: out, ax: s.ax, ay: s.ay };
}

/** Plataforma de carregamento deitada (leste-oeste) com o braço sobre a pista ao sul. */
function armSouth(wT: number, hT: number, frame = 0): Sprite {
  const w = wT * S;
  const h = hT * S;
  const s = sheet(wT, hT, 36, 6, 30);
  const b = s.buf;
  const yel = MAT.yellow;
  for (const [x, y] of [[2, 3], [w - 5, 3], [2, h - 2], [w - 5, h - 2]]) b.rect(x, y - 28, 3, 28, MAT.steel.dk);
  b.top(0, -30, w, h, ramp('#8f99a3', 0.08));
  for (let x = 2; x < w; x += 3) b.vline(x, -30, h - 31, 'rgba(60,66,76,0.35)');
  b.rect(0, -34, w, 2, yel.base);
  b.rect(0, h - 32, w, 2, yel.dk);
  b.vline(0, -34, h - 30, yel.lt);
  b.vline(w - 1, -34, h - 30, yel.dk);
  // braço articulado avançando sobre a pista (sul) e mangote descendo até o caminhão
  const ax = Math.round(w / 2);
  if (frame === 0) {
    // recolhido: braço deitado sobre a plataforma
    b.rect(ax - 12, h - 36, 24, 3, yel.base);
    b.hline(ax - 12, ax + 11, h - 36, yel.hi);
    b.rect(ax + 10, h - 34, 3, 5, MAT.rubber.base);
  } else {
    b.rect(ax - 1, h - 32, 3, 28, yel.base);
    b.vline(ax - 1, h - 32, h - 5, yel.hi);
    b.rect(ax - 3, h - 6, 7, 3, yel.dk);
    b.rect(ax - 1, h - 3, 3, 16, MAT.rubber.base);
    b.ellipse(ax, h + 14, 3, 2, MAT.steelDark.base);
    b.set(ax, h + (frame === 1 ? 1 : 7), '#5a3a22');
    b.rect(w - 4, -38, 3, 3, frame === 1 ? '#f5a524' : '#7a5212');
  }
  // escada lateral
  ladder(b, w - 8, -28, h - 2);
  return finish(s, { cx: w / 2, cy: h - 2, rx: w / 2 + 2, ry: 3 });
}

/**
 * Quadros de animação por equipamento (MachineSystem troca a textura):
 * misturador/reator/bomba/painel giram ou piscam quando em funcionamento; caldeira tem chama;
 * braço de carregamento: 0 = recolhido, 1–2 = abaixado carregando; bomba de diesel: 0 = parada, 1–2 = abastecendo.
 */
export function machineFrames(m: Machine): number {
  switch (m.kind) {
    case 'misturador':
    case 'reator':
    case 'painel':
      return 4;
    case 'caldeira':
    case 'braco-carregamento':
    case 'bomba-diesel':
      return 3;
    case 'bomba':
      return 2;
    default:
      return 1;
  }
}

export function machineSprite(m: Machine, frame = 0): Sprite {
  const { w: wT, h: hT } = m.rect;
  const w = wT * S;
  const h = hT * S;
  switch (m.kind) {
    case 'tanque-vertical': {
      const hgt = Math.round(w * 0.62 + 6);
      const s = sheet(wT, hT, hgt + 6, 4, 4);
      const b = s.buf;
      const rx = w / 2 - 1;
      const ry = h * 0.32;
      const baseY = h - ry - 1;
      const body = m.color ? ramp(m.color, 0.08) : ramp('#c5c9cd', 0.07);
      const roof = m.color ? ramp(shade(m.color, -0.1), 0.1) : ramp('#8a4b2d', 0.12);
      cylinder(b, w / 2, baseY, rx, ry, hgt, body, roof);
      ladder(b, Math.round(w * 0.22), Math.round(baseY - hgt + ry * 0.6), Math.round(baseY + ry * 0.7));
      if (w >= 48) railingTop(b, w / 2, baseY - hgt, rx - 1, ry - 0.5);
      // placa de identificação
      b.rect(w / 2 + 2, baseY - hgt * 0.5, 10, 6, '#f4f2ee');
      b.hline(w / 2 + 4, w / 2 + 9, baseY - hgt * 0.5 + 2, '#2b2f3a');
      b.hline(w / 2 + 4, w / 2 + 7, baseY - hgt * 0.5 + 4, '#c8463b');
      return finish(s, { cx: w / 2 + 3, cy: baseY + ry * 0.4, rx: rx + 2, ry: ry + 1, a: 0.32 });
    }
    case 'tanque-horizontal': {
      const s = sheet(wT, hT, 14, 4, 4);
      const b = s.buf;
      const body = m.color ? ramp(m.color, 0.1) : MAT.yellow;
      const along = w >= h;
      if (along) {
        for (const x of [5, w - 9]) b.rect(x, h - 8, 4, 8, MAT.steelDark.base);
        for (let y = -10; y < h - 6; y++) {
          const t = (y + 10) / (h + 4);
          const c = t < 0.2 ? body.hi : t < 0.45 ? body.lt : t < 0.75 ? body.base : body.dk;
          b.hline(3, w - 4, y, c);
        }
        b.ellipse(3, (h - 16) / 2, 3, (h + 4) / 2, body.dk);
        b.ellipse(w - 4, (h - 16) / 2, 3, (h + 4) / 2, body.base);
        for (let x = 12; x < w - 8; x += 14) b.vline(x, -9, h - 8, shade(body.base, -0.1));
        b.rect(w / 2 - 3, -12, 6, 3, MAT.steelDark.base);
      } else {
        for (let x = 1; x < w - 1; x++) {
          const t = x / w;
          const c = t < 0.25 ? body.lt : t < 0.55 ? body.hi : t < 0.8 ? body.base : body.dk;
          for (let y = -6; y < h - 4; y++) b.set(x, y, c);
        }
        b.ellipse(w / 2, -6, w / 2 - 1, 4, body.hi);
        b.ellipse(w / 2, h - 4, w / 2 - 1, 4, body.dk);
      }
      return finish(s, { cx: w / 2 + 2, cy: h - 2, rx: w / 2 + 1, ry: 4, a: 0.3 });
    }
    case 'reator':
    case 'misturador': {
      const hgt = 30;
      const s = sheet(wT, hT, hgt + 16, 4, 4);
      const b = s.buf;
      const rx = w / 2 - 3;
      const ry = h * 0.28;
      const baseY = h - ry - 3;
      // pés
      for (const x of [6, w - 8]) b.rect(x, baseY - 4, 3, ry + 6, MAT.steelDark.base);
      cylinder(b, w / 2, baseY - 4, rx, ry, hgt, ramp('#d3d8dc', 0.07), ramp('#b9c0c6', 0.07));
      // motor/agitador
      b.rect(w / 2 - 4, baseY - 4 - hgt - 12, 8, 9, m.kind === 'reator' ? '#2f6db5' : '#3f8f4a');
      b.hline(w / 2 - 4, w / 2 + 3, baseY - 4 - hgt - 12, '#9cc3ea');
      b.rect(w / 2 - 1, baseY - 4 - hgt - 3, 2, 3, MAT.steelDark.base);
      // tampa do ventilador do motor: pá girando (4 quadros)
      const fy = baseY - 4 - hgt - 14;
      b.ellipse(w / 2, fy, 4, 2, '#2b2f3a');
      const ang = (frame % 4) * (Math.PI / 4);
      const dx = Math.round(Math.cos(ang) * 3);
      const dy = Math.round(Math.sin(ang) * 1.5);
      b.line(w / 2 - dx, fy - dy, w / 2 + dx, fy + dy, '#c9d0d6');
      b.set(w / 2, fy, '#ffffff');
      // manômetro com ponteiro oscilando e bocal
      const gx = Math.round(w / 2 + rx * 0.5);
      const gy = Math.round(baseY - hgt * 0.5);
      b.ellipse(gx, gy, 2.5, 2.5, '#f4f2ee');
      b.set(gx + [-1, 0, 1, 0][frame % 4], gy - 1, '#c8463b');
      b.set(gx, gy, '#2b2f3a');
      b.rect(w / 2 - rx - 2, baseY - hgt * 0.4, 4, 3, MAT.steel.dk);
      if (m.kind === 'misturador') {
        // visor com o produto girando
        const vx = Math.round(w / 2 - rx * 0.45);
        const vy = Math.round(baseY - hgt * 0.62);
        b.rect(vx, vy, 6, 4, '#2b2f3a');
        b.rect(vx + 1, vy + 1, 4, 2, '#3a2416');
        b.set(vx + 1 + (frame % 4), vy + 1, '#8a5a32');
      } else {
        // válvula de alívio soltando um fio de vapor
        const sx = Math.round(w / 2 + rx * 0.6);
        const sy = baseY - 4 - hgt - 2;
        b.rect(sx, sy, 2, 3, MAT.steelDark.base);
        if (frame >= 2) for (let k = 0; k < frame; k++) b.set(sx + (k % 2), sy - 2 - k * 2, 'rgba(240,244,248,0.75)');
      }
      return finish(s, { cx: w / 2, cy: baseY + ry, rx: rx + 2, ry: ry + 1, a: 0.3 });
    }
    case 'caldeira': {
      const s = sheet(wT, hT, 30, 4, 4);
      const b = s.buf;
      const body = ramp('#9a3b34', 0.12);
      b.top(0, -18, w, 14, ramp('#8a9198', 0.08));
      b.front(0, -4, w, h + 2, body);
      // fornalha: chama tremulando (3 quadros)
      b.rect(6, 2, 10, 8, '#2b2f3a');
      const fl = [[8, 4, 6, 4], [7, 3, 8, 5], [9, 4, 5, 4]][frame % 3];
      b.rect(fl[0], fl[1], fl[2], fl[3], '#e3601e');
      b.rect(fl[0] + 1, fl[1] + 1, fl[2] - 2, fl[3] - 1, '#f6a13a');
      b.rect(fl[0] + 2, fl[1] + 2 - (frame % 2), Math.max(1, fl[2] - 4), 2, '#ffe39a');
      for (let x = 22; x < w - 4; x += 6) b.rect(x, 0, 3, 12, body.dk);
      b.rect(w - 12, -30, 6, 14, MAT.steelDark.base);
      b.vline(w - 12, -30, -17, MAT.steelDark.lt);
      return finish(s, { cx: w / 2, cy: h - 2, rx: w / 2 + 1, ry: 3 });
    }
    case 'painel': {
      const s = sheet(wT, hT, 18);
      const b = s.buf;
      b.top(0, -14, w, 6, ramp('#5d6470', 0.1));
      b.front(0, -8, w, h + 6, ramp('#4b525d', 0.1));
      b.rect(3, -12, w - 6, 9, '#14202c');
      // tendências na tela andando e LEDs alternando (4 quadros)
      for (let i = 0; i < w - 8; i += 3) b.vline(4 + i, -6 - ((i * 7 + frame * 5) % 5), -5, '#5ec27a');
      b.hline(4, w - 5, -11 + (frame % 3), 'rgba(120,200,255,0.5)');
      for (let x = 4; x < w - 3; x += 4) b.set(x, 2, ['#4fbf65', '#e8b928', '#d9534f', '#2b2f3a'][(x + frame) % 4]);
      return finish(s, { cx: w / 2, cy: h - 1, rx: w / 2, ry: 2 });
    }
    case 'braco-carregamento': {
      if (m.facing === 'S') return armSouth(wT, hT, frame);
      if (m.facing === 'E') return mirrorX(machineSprite({ ...m, facing: 'W' }, frame));
      const s = sheet(wT, hT, 36, 30, 4);
      const b = s.buf;
      const steel = MAT.steel;
      const yel = MAT.yellow;
      // colunas
      for (const [x, y] of [[2, 4], [w - 5, 4], [2, h - 4], [w - 5, h - 4]]) b.rect(x, y - 28, 3, 28, steel.dk);
      // plataforma superior com guarda-corpo amarelo
      b.top(0, -30, w, h, ramp('#8f99a3', 0.08));
      for (let y = -30; y < h - 30; y += 3) b.hline(1, w - 2, y, 'rgba(60,66,76,0.35)');
      b.rect(0, -34, w, 2, yel.base);
      b.rect(0, h - 32, w, 2, yel.dk);
      b.vline(0, -34, h - 30, yel.lt);
      b.vline(w - 1, -34, h - 30, yel.dk);
      // braço articulado: recolhido (quadro 0) ou estendido sobre a carreta (1–2)
      const ay = Math.round(h / 2) - 26;
      if (frame === 0) {
        b.rect(-3, ay - 14, 3, 16, yel.base);
        b.vline(-3, ay - 14, ay + 1, yel.hi);
        b.rect(-5, ay - 16, 6, 3, yel.dk);
        b.rect(-6, ay - 2, 3, 6, MAT.rubber.base);
      } else {
        b.rect(-24, ay, 26, 3, yel.base);
        b.hline(-24, 1, ay, yel.hi);
        b.rect(-24, ay + 3, 3, 14, MAT.rubber.base);
        b.ellipse(-22.5, ay + 18, 3, 2, MAT.steelDark.base);
        // produto passando (pulso no mangote) e lâmpada de operação
        b.set(-23, ay + 5 + (frame === 1 ? 0 : 6), '#5a3a22');
        b.set(-23, ay + 9 + (frame === 1 ? 0 : 6), '#5a3a22');
        b.rect(w - 4, -38, 3, 3, frame === 1 ? '#f5a524' : '#7a5212');
      }
      // escada
      ladder(b, w - 6, -28, h - 2);
      return finish(s, { cx: w / 2, cy: h - 2, rx: w / 2 + 2, ry: 3 });
    }
    case 'bomba-diesel': {
      const s = sheet(wT, hT, 20, 6, 4);
      const b = s.buf;
      // ilha (meio-fio)
      b.top(-3, 0, w + 6, h - 3, ramp('#c9c6bd', 0.06));
      b.front(-3, h - 3, w + 6, 3, ramp('#e6b52c', 0.1));
      const red = ramp('#c8342b', 0.12);
      b.top(1, -12, w - 2, 5, red);
      b.front(1, -7, w - 2, h + 2, ramp('#f1efe9', 0.05));
      b.rect(3, -4, w - 6, 5, '#1f2a36');
      // visor: apagado parado; números correndo abastecendo
      if (frame === 0) b.hline(4, w - 5, -2, '#3a5a44');
      else for (let x = 4; x < w - 4; x++) b.set(x, -2 - ((x + frame) % 2), '#7fe0a0');
      b.rect(1, h - 10, w - 2, 3, red.base);
      if (frame === 0) b.vline(w - 1, -2, 10, MAT.rubber.base);
      else {
        // mangueira esticada até o bocal do tanque da carreta (para baixo, na pista)
        b.line(w - 1, -2, w + 3, 16, MAT.rubber.base);
        b.rect(w + 2, 16, 3, 2, MAT.steelDark.base);
      }
      return finish(s, { cx: w / 2, cy: h - 2, rx: w / 2 + 2, ry: 2 });
    }
    case 'bomba': {
      const s = sheet(wT, hT, 10);
      const b = s.buf;
      // vibração de 1 px e ventoinha do motor girando (2 quadros)
      const j = frame % 2;
      b.top(1, 2, 14, 6, MAT.steelDark);
      b.ellipse(7, 3 - j, 5, 5, ramp('#2f6db5', 0.12).base);
      b.ellipse(6, 1 - j, 4, 3, ramp('#2f6db5', 0.12).lt);
      b.line(5, 1 - j + (j ? 2 : 0), 9, 5 - j - (j ? 2 : 0), '#9cc3ea');
      b.rect(10, -2, 5, 4, MAT.steel.base);
      b.rect(0, 8, 16, 5, MAT.steelDark.base);
      return finish(s, { cx: 8, cy: 14, rx: 8, ry: 2 });
    }
    case 'balanca': {
      const s = sheet(wT, hT, 26, 28, 4);
      const b = s.buf;
      const plate = ramp('#8e959c', 0.07);
      b.rect(0, 0, w, h, plate.base);
      for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) b.set(x, y + 1, plate.lt);
      for (let i = 0; i < h; i += 2) {
        const c = Math.floor(i / 6) % 2 ? '#e3b22a' : '#2b2b2b';
        b.rect(0, i, 2, 2, c);
        b.rect(w - 2, i, 2, 2, c);
      }
      for (let x = 0; x < w; x++) (b.set(x, 0, plate.hi), b.set(x, h - 1, plate.dd));
      // painel de leitura (poste ao lado)
      b.rect(-12, h / 2 - 22, 2, 24, MAT.steelDark.base);
      b.rect(-26, h / 2 - 29, 26, 10, '#1a1d24');
      b.rect(-25, h / 2 - 28, 24, 8, '#0f2b18');
      b.hline(-25, -2, h / 2 - 29, '#3b4048');
      return finish(s);
    }
  }
}
