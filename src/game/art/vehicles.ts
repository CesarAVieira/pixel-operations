/**
 * Veículos vistos de cima 3/4 (puro). Âncora = centro do footprint no chão.
 * E/W compartilham o desenho (W = espelho horizontal); N e S são desenhados à parte
 * porque na vista 3/4 vemos a face sul (frente da cabine quando vai para o sul).
 *
 * Carretas-tanque em aço inox polido (como na foto de satélite da frota), com passarela,
 * bocas de visita, escada, faixa refletiva vermelha/branca, para-lamas e luzes de posição.
 * `frame` (0/1) gira os aros das rodas nas vistas laterais.
 */
import type { GridDir, VehicleKind } from '../../types/world';
import { MAT, mix, ramp, shade, type Ramp } from './core/color';
import { PixelBuf } from './core/pixbuf';
import type { Sprite } from './sheet';

export const VEHICLE_SIZE: Record<VehicleKind, { len: number; wid: number }> = {
  'carreta-tanque': { len: 82, wid: 26 },
  caminhao: { len: 70, wid: 26 },
  carro: { len: 42, wid: 22 },
};

export const VEHICLE_FRAMES = 2;
const GLASS = ramp('#35607f', 0.14);
const UP = 18; // espaço acima para a altura do veículo
const TAPE = (x: number) => (Math.floor(x / 4) % 2 ? '#d22f2a' : '#f2f2ee');

function wheelSide(b: PixelBuf, x: number, y: number, frame: number) {
  b.ellipse(x, y - 1, 4.4, 3.6, MAT.rubber.dd);
  b.ellipse(x, y - 1, 3.6, 3, MAT.rubber.base);
  b.ellipse(x, y - 1, 2, 1.7, '#9aa2aa');
  // raios do aro (giram entre os quadros)
  if (frame % 2) {
    b.set(x - 1, y - 2, '#d5dbe0');
    b.set(x + 1, y, '#5f666e');
  } else {
    b.set(x + 1, y - 2, '#d5dbe0');
    b.set(x - 1, y, '#5f666e');
  }
  b.set(x, y - 1, '#3b4048');
}

function wheelEnd(b: PixelBuf, x: number, y: number) {
  b.rect(x - 2, y - 5, 4, 7, MAT.rubber.base);
  b.vline(x - 2, y - 5, y + 1, MAT.rubber.lt);
}

/** Tanque de inox deitado ao longo de x (vista 3/4): faixas de reflexo fortes, como metal polido. */
function steelTankX(b: PixelBuf, x0: number, x1: number, y0: number, y1: number) {
  const h = y1 - y0;
  const band = (t: number) =>
    t < 0.08 ? '#8b949c' : t < 0.2 ? '#e9eef2' : t < 0.27 ? '#ffffff' : t < 0.42 ? '#cfd6dc' : t < 0.58 ? '#b4bdc5' : t < 0.7 ? '#9aa5ae' : t < 0.8 ? '#aab7c2' : t < 0.9 ? '#87929c' : '#6f7a84';
  for (let y = y0; y < y1; y++) b.hline(x0 + 3, x1 - 4, y, band((y - y0) / h));
  // tampos (calotas) nas pontas
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / h;
    const half = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    const w = Math.round(3 * half);
    for (let k = 0; k <= w; k++) {
      b.set(x0 + 3 - k, y, shade(band(t), -0.12));
      b.set(x1 - 4 + k, y, shade(band(t), 0.04));
    }
  }
  // anéis de reforço
  for (let x = x0 + 12; x < x1 - 8; x += 13) {
    b.vline(x, y0 + 1, y1 - 2, 'rgba(70,80,90,0.35)');
    b.vline(x + 1, y0 + 2, y1 - 3, 'rgba(255,255,255,0.35)');
  }
  // passarela, guarda-corpo rebatido e bocas de visita
  b.hline(x0 + 6, x1 - 8, y0 + 2, '#7c858e');
  for (let x = x0 + 9; x < x1 - 10; x += 14) {
    b.ellipse(x + 2, y0 + 2, 2.6, 1.6, '#6b737c');
    b.ellipse(x + 2, y0 + 1.6, 1.6, 0.9, '#c3cad0');
  }
  b.hline(x0 + 6, x1 - 8, y0 - 1, '#e8b928');
  for (let x = x0 + 6; x < x1 - 8; x += 9) b.vline(x, y0 - 1, y0 + 1, '#b38a17');
}

/** Tanque de inox ao longo de y (vista N/S, de cima). */
function steelTankY(b: PixelBuf, x0: number, x1: number, y0: number, y1: number) {
  const w = x1 - x0;
  for (let x = x0; x < x1; x++) {
    const t = (x - x0) / w;
    const c = t < 0.12 ? '#8b949c' : t < 0.3 ? '#cfd6dc' : t < 0.4 ? '#ffffff' : t < 0.55 ? '#e3e8ec' : t < 0.75 ? '#b4bdc5' : t < 0.9 ? '#9aa5ae' : '#7b858e';
    b.vline(x, y0 + 2, y1 - 2, c);
  }
  for (let y = y0 + 10; y < y1 - 6; y += 13) b.hline(x0 + 1, x1 - 2, y, 'rgba(70,80,90,0.35)');
  b.vline(Math.round((x0 + x1) / 2), y0 + 4, y1 - 6, '#7c858e');
  for (let y = y0 + 8; y < y1 - 8; y += 14) {
    b.ellipse((x0 + x1) / 2, y, 2.4, 2, '#6b737c');
    b.ellipse((x0 + x1) / 2 - 0.5, y - 0.5, 1.3, 1, '#c3cad0');
  }
}

/** Cabine do cavalo mecânico vista de lado (frente para a direita), começando em cx0. */
function cabSide(b: PixelBuf, cx0: number, D: number, cab: Ramp) {
  const w = 17;
  b.top(cx0, -6, w, D - 12, cab);
  b.front(cx0, D - 18, w, 13, cab);
  // defletor de ar no teto
  b.top(cx0 + 1, -9, 9, 4, ramp(shade(cab.base, -0.06), 0.1));
  // para-brisa (visto de cima) e janela lateral
  b.rect(cx0 + w - 5, -5, 4, D - 14, GLASS.lt);
  b.vline(cx0 + w - 2, -5, D - 20, GLASS.hi);
  b.rect(cx0 + 5, D - 16, 8, 6, GLASS.base);
  b.hline(cx0 + 5, cx0 + 12, D - 16, GLASS.hi);
  b.set(cx0 + 5, D - 11, GLASS.dk);
  // porta, maçaneta, degrau
  b.vline(cx0 + 4, D - 17, D - 7, cab.dd);
  b.set(cx0 + 10, D - 9, '#d5dbe0');
  b.rect(cx0 + 5, D - 6, 6, 1, '#2b2f3a');
  // grade, para-choque, farol, pisca
  b.rect(cx0 + w - 1, D - 15, 2, 7, '#2b2f3a');
  b.rect(cx0 + w - 2, D - 7, 4, 2, '#c3cad0');
  b.rect(cx0 + w, D - 10, 2, 2, '#fff4c2');
  b.set(cx0 + w, D - 12, '#f5a524');
  // retrovisor
  b.rect(cx0 + w - 6, D - 21, 2, 4, MAT.steelDark.base);
  b.set(cx0 + w - 6, D - 21, MAT.steelDark.lt);
  // escapamento cromado atrás da cabine
  b.rect(cx0 - 2, -12, 2, D - 14, '#c9d0d6');
  b.vline(cx0 - 2, -12, D - 27, '#ffffff');
  b.rect(cx0 - 2, -13, 2, 1, '#2b2f3a');
  // tanque de combustível sob a cabine
  b.rect(cx0 + 2, D - 9, 9, 4, '#c3cad0');
  b.hline(cx0 + 2, cx0 + 10, D - 9, '#ffffff');
}

export function vehicleSprite(kind: VehicleKind, color: string, dir: GridDir, frame = 0): Sprite {
  const { len, wid } = VEHICLE_SIZE[kind];
  const horizontal = dir === 'E' || dir === 'W';
  const W = (horizontal ? len : wid) + 10;
  const H = (horizontal ? wid : len) + UP + 10;
  const b = new PixelBuf(W, H);
  b.ox = 5;
  b.oy = UP;
  const cab = ramp(color, 0.12);

  if (horizontal) {
    // desenho para E; W é espelhado no final
    const L = len;
    const D = wid;
    b.shadow(L / 2 + 2, D - 2, L / 2 + 3, 5, 0.3);
    if (kind === 'carro') {
      const body = ramp(color, 0.1);
      b.top(1, 3, L - 2, D - 11, body);
      b.front(1, D - 8, L - 2, 7, body);
      b.hline(2, L - 3, D - 8, body.lt);
      // teto e vidros
      b.top(11, -2, L - 21, D - 9, ramp(mix(color, '#ffffff', 0.12), 0.1));
      b.rect(L - 13, -1, 4, D - 11, GLASS.lt);
      b.vline(L - 10, -1, D - 13, GLASS.hi);
      b.rect(10, -1, 3, D - 11, GLASS.base);
      b.rect(12, D - 7, L - 24, 4, GLASS.base);
      b.hline(12, L - 13, D - 7, GLASS.hi);
      b.vline(Math.round(L / 2) - 1, D - 7, D - 4, body.dk);
      b.vline(Math.round(L / 2) - 1, D - 3, D - 2, body.dd);
      b.set(Math.round(L / 2) + 3, D - 3, '#d5dbe0');
      // faróis, lanternas, retrovisor, para-choques
      b.rect(L - 3, D - 7, 2, 2, '#fff4c2');
      b.rect(1, D - 7, 2, 2, '#c4231c');
      b.rect(L - 15, D - 9, 2, 2, body.dd);
      b.hline(1, 4, D - 2, '#3b4048');
      b.hline(L - 5, L - 2, D - 2, '#3b4048');
      for (const x of [8, L - 9]) wheelSide(b, x, D, frame);
    } else {
      const cabW = 17;
      const cx0 = L - cabW;
      // chassi e para-lamas
      b.rect(2, D - 9, L - 4, 4, MAT.rubber.base);
      b.hline(2, L - 3, D - 9, MAT.rubber.lt);
      const axles = kind === 'carreta-tanque' ? [7, 14, 21, cx0 - 9, cx0 - 2, L - 7] : [10, 17, L - 8];
      if (kind === 'carreta-tanque') {
        steelTankX(b, 0, cx0 - 4, -8, D - 7);
        // faixa refletiva e luzes de posição
        for (let x = 2; x < cx0 - 6; x++) b.set(x, D - 8, TAPE(x));
        for (let x = 6; x < cx0 - 8; x += 14) b.set(x, D - 7, '#f5a524');
        // escada traseira
        b.vline(1, -6, D - 9, '#6b737c');
        b.vline(3, -6, D - 9, '#6b737c');
        for (let y = -4; y < D - 9; y += 3) b.hline(1, 3, y, '#9aa2aa');
        // lanterna traseira
        b.rect(0, D - 11, 2, 3, '#c4231c');
      } else {
        // baú de carga
        const box = ramp(shade(color, 0.04), 0.1);
        b.top(1, -8, cx0 - 4, D - 9, box);
        b.front(1, D - 17, cx0 - 4, 9, ramp(mix(color, '#d9d4c8', 0.4), 0.08));
        for (let x = 6; x < cx0 - 5; x += 7) b.vline(x, D - 16, D - 9, 'rgba(40,40,50,0.25)');
        for (let x = 2; x < cx0 - 4; x++) b.set(x, D - 9, TAPE(x));
        b.rect(0, D - 12, 2, 3, '#c4231c');
      }
      // para-lamas
      for (const x of axles) b.rect(x - 5, D - 9, 10, 2, '#1d2027');
      for (const x of axles) wheelSide(b, x, D, frame);
      cabSide(b, cx0, D, cab);
    }
  } else {
    const D = len;
    const Wd = wid;
    const south = dir === 'S';
    b.shadow(Wd / 2 + 2, D - 3, Wd / 2 + 3, 6, 0.3);
    if (kind === 'carro') {
      const body = ramp(color, 0.1);
      wheelEnd(b, 1, D - 4);
      wheelEnd(b, Wd - 1, D - 4);
      wheelEnd(b, 1, 10);
      wheelEnd(b, Wd - 1, 10);
      b.top(1, 0, Wd - 2, D - 8, body);
      b.front(1, D - 8, Wd - 2, 7, body);
      b.top(3, south ? 9 : 13, Wd - 6, D - 26, ramp(mix(color, '#ffffff', 0.12), 0.1));
      if (south) {
        b.rect(3, D - 18, Wd - 6, 5, GLASS.lt);
        b.hline(4, Wd - 5, D - 18, GLASS.hi);
        b.rect(3, 6, Wd - 6, 3, GLASS.base);
        b.rect(3, D - 6, 3, 2, '#fff4c2');
        b.rect(Wd - 6, D - 6, 3, 2, '#fff4c2');
        b.rect(7, D - 5, Wd - 14, 2, '#3b4048');
      } else {
        b.rect(3, 8, Wd - 6, 5, GLASS.lt);
        b.hline(4, Wd - 5, 8, GLASS.hi);
        b.rect(3, D - 15, Wd - 6, 3, GLASS.base);
        b.rect(3, D - 6, 3, 2, '#c4231c');
        b.rect(Wd - 6, D - 6, 3, 2, '#c4231c');
        b.rect(8, D - 5, Wd - 16, 2, '#f2f2ee');
      }
    } else {
      const cabL = 18;
      for (const y of south ? [10, 17, 24, D - 6] : [6, D - 22, D - 15, D - 8]) {
        wheelEnd(b, 0, y);
        wheelEnd(b, Wd, y);
      }
      if (south) {
        // cabine embaixo (frente visível), carga acima
        const cy0 = D - cabL;
        if (kind === 'carreta-tanque') steelTankY(b, 1, Wd - 1, -10, cy0 - 1);
        else {
          b.top(1, -10, Wd - 2, cy0 - 1, ramp(shade(color, 0.05), 0.1));
          for (let y = -6; y < cy0 - 4; y += 7) b.hline(2, Wd - 3, y, 'rgba(40,40,50,0.25)');
        }
        b.top(1, cy0 - 8, Wd - 2, 10, cab);
        b.top(4, cy0 - 10, Wd - 8, 4, ramp(shade(cab.base, -0.06), 0.1));
        b.front(1, cy0 + 2, Wd - 2, cabL - 4, cab);
        b.rect(3, cy0 + 3, Wd - 6, 6, GLASS.base);
        b.hline(4, Wd - 5, cy0 + 4, GLASS.hi);
        b.vline(Math.round(Wd / 2), cy0 + 3, cy0 + 8, GLASS.dk);
        b.rect(5, D - 7, Wd - 10, 3, '#2b2f3a');
        for (let x = 6; x < Wd - 6; x += 2) b.set(x, D - 6, '#5f666e');
        b.rect(2, D - 7, 3, 2, '#fff4c2');
        b.rect(Wd - 5, D - 7, 3, 2, '#fff4c2');
        b.set(2, D - 9, '#f5a524');
        b.set(Wd - 3, D - 9, '#f5a524');
        b.rect(2, D - 3, Wd - 4, 2, '#c3cad0');
        b.rect(-1, cy0 + 1, 2, 4, MAT.steelDark.base);
        b.rect(Wd - 1, cy0 + 1, 2, 4, MAT.steelDark.base);
      } else {
        // cabine em cima (vemos o teto), traseira embaixo
        b.top(1, -10, Wd - 2, cabL - 2, cab);
        b.top(4, -12, Wd - 8, 5, ramp(shade(cab.base, -0.06), 0.1));
        b.rect(3, -9, Wd - 6, 3, GLASS.lt);
        if (kind === 'carreta-tanque') {
          steelTankY(b, 1, Wd - 1, cabL - 10, D - 9);
          // tampo traseiro, escada e para-choque com faixa refletiva
          b.ellipse(Wd / 2, D - 9, Wd / 2 - 1, 5, '#a4aeb7');
          b.ellipse(Wd / 2 - 1, D - 10, Wd / 2 - 4, 3, '#dfe5ea');
          b.vline(Math.round(Wd / 2) - 2, D - 14, D - 4, '#5f666e');
          b.vline(Math.round(Wd / 2) + 2, D - 14, D - 4, '#5f666e');
          for (let y = D - 13; y < D - 4; y += 3) b.hline(Math.round(Wd / 2) - 2, Math.round(Wd / 2) + 2, y, '#9aa2aa');
        } else {
          b.top(1, cabL - 10, Wd - 2, D - cabL - 1, ramp(shade(color, 0.05), 0.1));
          b.front(1, D - 11, Wd - 2, 9, ramp(mix(color, '#d9d4c8', 0.4), 0.08));
          b.vline(Math.round(Wd / 2), D - 10, D - 3, 'rgba(40,40,50,0.35)');
        }
        for (let x = 1; x < Wd - 1; x++) b.set(x, D - 3, TAPE(x));
        b.rect(1, D - 6, 4, 2, '#c4231c');
        b.rect(Wd - 5, D - 6, 4, 2, '#c4231c');
      }
    }
  }

  b.ox = 0;
  b.oy = 0;
  b.outline();
  let out = b;
  if (dir === 'W') {
    out = new PixelBuf(b.w, b.h);
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        const i = (y * b.w + x) * 4;
        const j = (y * b.w + (b.w - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) out.data[j + k] = b.data[i + k];
      }
  }
  const fw = horizontal ? len : wid;
  const fh = horizontal ? wid : len;
  return { buf: out, ax: 5 + fw / 2, ay: UP + fh / 2 };
}

/**
 * Posições (px, relativas ao centro do footprint) de lanternas traseiras e piscas, por direção.
 * `left`/`right` = lado esquerdo/direito do motorista.
 */
export function lightSpots(kind: VehicleKind, dir: GridDir): { rear: [number, number][]; frontLeft: [number, number]; frontRight: [number, number] } {
  const { len, wid } = VEHICLE_SIZE[kind];
  const L = len / 2;
  const D = wid / 2;
  switch (dir) {
    case 'E':
      return { rear: [[-L + 1, D - 8]], frontLeft: [L - 1, -D + 4], frontRight: [L, D - 10] };
    case 'W':
      return { rear: [[L - 2, D - 8]], frontLeft: [-L, D - 10], frontRight: [-L + 1, -D + 4] };
    case 'N':
      return { rear: [[-D + 3, L - 5], [D - 3, L - 5]], frontLeft: [-D + 2, -L - 6], frontRight: [D - 2, -L - 6] };
    default:
      return { rear: [], frontLeft: [D - 3, L - 8], frontRight: [-D + 3, L - 8] };
  }
}
