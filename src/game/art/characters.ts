/**
 * Personagens chibi em pixel art (puro, implementação própria).
 * Quadro de 24×34 px, âncora (12, 31) no centro dos pés. Em pé: cabeça y 5–15 (cabelo/capacete
 * acima), tronco 16–23, quadril 24–25, pernas 26–28, sapatos 29–30. Sentado: tronco e cabeça 4 px
 * abaixo. Braços desenhados com pincel 2×2 ao longo de pontos do "rig" de cada pose.
 *
 * Aparência = uniforme (EPI da indústria: capacete, colete refletivo, luvas, faixas) + variação
 * determinística por pessoa (pele, cabelo, barba, óculos, roupa do administrativo).
 */
import type { Uniform } from '../../types/world';
import { luminance, mix, ramp, shade, type Ramp } from './core/color';
import { PixelBuf } from './core/pixbuf';

export const CHAR_W = 24;
export const CHAR_H = 34;
export const CHAR_AX = 12;
export const CHAR_AY = 31;
const HX = 5;
const HY = 5;
const SEAT_DROP = 4;

export type View = 'down' | 'up' | 'side';
export type Facing = View;
export type Pose = 'stand' | 'walk' | 'sit' | 'type' | 'use' | 'check' | 'talk' | 'wait';

export const POSE_FRAMES: Record<Pose, number> = { stand: 3, walk: 4, sit: 3, type: 4, use: 4, check: 2, talk: 2, wait: 2 };
export const POSES = Object.keys(POSE_FRAMES) as Pose[];
export const VIEWS: View[] = ['down', 'up', 'side'];
/** Poses sempre sentadas. 'talk' e 'check' podem ser sentadas ou em pé (parâmetro). */
const SEATED: ReadonlySet<Pose> = new Set(['sit', 'type']);

/* ------------------------------------------------------------------ aparência */

type HairStyle = 'curto' | 'longo' | 'coque' | 'raspado' | 'cacheado' | 'rabo';
type TopStyle = 'camisa' | 'polo' | 'camiseta' | 'macacao' | 'manga-longa';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  facial: 'none' | 'barba' | 'bigode' | 'rala';
  glasses: 'none' | 'seguranca' | 'grau';
  head: 'capacete' | 'bone' | 'none';
  headColor: string;
  top: TopStyle;
  topColor: string;
  bottomColor: string;
  shoes: string;
  vest: string | null;
  stripes: boolean;
  gloves: string | null;
  badge: boolean;
  toolbelt: boolean;
  radio: boolean;
  longSleeve: boolean;
}

const SKINS = ['#f3cfb0', '#e6b48f', '#c98d62', '#a46a43', '#7d4c2e', '#5c3820'];
const HAIRS = ['#1f1714', '#3b2518', '#5b3a22', '#7a4a26', '#a8743c', '#d2b06a', '#6e6a66', '#2a1f1b'];
const ADMIN_TOPS = ['#eef3f8', '#9cc3e6', '#f2c4c4', '#cfe5c8', '#f5e3a8', '#3d4a5c', '#b9a4d6', '#e8e4dc'];
const ADMIN_BOTTOMS = ['#2e3442', '#3b4f78', '#4a4038', '#26303f', '#5b5f66'];

function hash(n: number, k: number): number {
  let x = (n + 1) * 374761393 + k * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Aparência determinística de uma pessoa (uniforme + índice). */
export function appearanceOf(u: Uniform, look: number): Appearance {
  const r = (k: number) => hash(look, k);
  const pick = <T,>(arr: readonly T[], k: number) => arr[Math.floor(r(k) * arr.length) % arr.length];
  const fem = r(1) < 0.45;
  const hairStyle: HairStyle = fem ? pick(['longo', 'coque', 'rabo', 'cacheado', 'longo'] as const, 2) : pick(['curto', 'raspado', 'curto', 'cacheado'] as const, 2);
  const a: Appearance = {
    skin: SKINS[Math.floor(r(3) * SKINS.length)],
    hair: r(4) < 0.08 ? '#9a958f' : pick(HAIRS, 5),
    hairStyle,
    facial: !fem && r(6) < 0.4 ? pick(['barba', 'bigode', 'rala'] as const, 7) : 'none',
    glasses: r(8) < 0.22 ? 'grau' : 'none',
    head: 'none',
    headColor: '#f4f5f6',
    top: 'camisa',
    topColor: pick(ADMIN_TOPS, 9),
    bottomColor: pick(ADMIN_BOTTOMS, 10),
    shoes: r(11) < 0.5 ? '#2b2420' : '#3a3f4a',
    vest: null,
    stripes: false,
    gloves: null,
    badge: false,
    toolbelt: false,
    radio: false,
    longSleeve: false,
  };
  switch (u) {
    case 'operacional':
      Object.assign(a, { head: 'capacete', headColor: '#f4f5f6', top: 'manga-longa', topColor: '#55657a', bottomColor: '#2c3646', shoes: '#1d1a18', stripes: true, gloves: '#e2c14a', glasses: 'seguranca', longSleeve: true });
      if (r(12) < 0.5) a.vest = '#f07f22';
      break;
    case 'manutencao':
      Object.assign(a, { head: 'capacete', headColor: '#f2c21b', top: 'macacao', topColor: '#2f4f86', bottomColor: '#2f4f86', shoes: '#1d1a18', stripes: true, gloves: '#8f9aa6', toolbelt: true, longSleeve: true, glasses: r(13) < 0.5 ? 'seguranca' : a.glasses });
      break;
    case 'seguranca':
      Object.assign(a, { head: 'bone', headColor: '#1f2a3a', top: 'polo', topColor: '#1f2a3a', bottomColor: '#141b26', shoes: '#111111', radio: true, badge: true });
      break;
    case 'motorista':
      Object.assign(a, { head: r(14) < 0.6 ? 'bone' : 'none', headColor: pick(['#b8322a', '#2d5aa0', '#e9e6df'] as const, 15), top: 'polo', topColor: pick(['#6d8097', '#b8322a', '#e9e6df', '#3c6e57'] as const, 16), bottomColor: '#3b4f78' });
      break;
    case 'visitante':
      Object.assign(a, { head: 'capacete', headColor: '#f4f5f6', vest: '#c7f04a', top: 'camiseta', badge: true });
      break;
    default:
      a.top = r(17) < 0.5 ? 'camisa' : r(18) < 0.5 ? 'polo' : 'camiseta';
      a.badge = r(19) < 0.85;
      a.longSleeve = a.top === 'camisa' && r(20) < 0.5;
  }
  return a;
}

/* ------------------------------------------------------------------ rig */

type Pt = readonly [number, number];
interface Arm {
  pts: readonly Pt[];
}
const arm = (...pts: Pt[]): Arm => ({ pts });

interface Rig {
  view: View;
  seated: boolean;
  /** Deslocamento vertical do tronco/cabeça/braços. */
  ub: number;
  /** Deslocamento extra só da cabeça (respiração). */
  hd: number;
  legA: { dx: number; dy: number };
  legB: { dx: number; dy: number };
  armA: Arm;
  armB: Arm;
  eyes: 'open' | 'closed' | 'half';
  mouth: 'none' | 'open';
  crossed: boolean;
  toeTap: boolean;
  /** Prancheta: posição do canto superior esquerdo (coordenadas em pé). */
  board: Pt | null;
  /** Mão de trás escondida (de costas digitando etc.). */
  handsHidden: boolean;
}

const DOWN_A: Arm = arm([6, 17], [6, 22]);
const DOWN_B: Arm = arm([16, 17], [16, 22]);
const SIDE_A: Arm = arm([12, 17], [12, 22]);
const SIDE_B: Arm = arm([11, 17], [11, 22]);

function makeRig(pose: Pose, view: View, frame: number, seatedReq: boolean): Rig {
  const n = POSE_FRAMES[pose];
  const f = ((frame % n) + n) % n;
  const seated = SEATED.has(pose) || ((pose === 'talk' || pose === 'check' || pose === 'stand') && seatedReq);
  const side = view === 'side';
  const r: Rig = {
    view,
    seated,
    ub: seated ? SEAT_DROP : 0,
    hd: 0,
    legA: { dx: 0, dy: 0 },
    legB: { dx: 0, dy: 0 },
    armA: side ? SIDE_A : DOWN_A,
    armB: side ? SIDE_B : DOWN_B,
    eyes: 'open',
    mouth: 'none',
    crossed: false,
    toeTap: false,
    board: null,
    handsHidden: false,
  };
  switch (pose) {
    case 'stand':
    case 'sit':
      if (f === 1) r.hd = 1;
      if (f === 2) r.eyes = 'closed';
      if (seated && !side && view === 'down') {
        // mãos no colo
        r.armA = arm([6, 17], [7, 21], [9, 22]);
        r.armB = arm([16, 17], [15, 21], [13, 22]);
      } else if (seated && side) {
        r.armB = arm([11, 17], [11, 21], [9, 22]);
      }
      break;
    case 'walk': {
      if (f === 1 || f === 3) r.ub -= 1;
      if (side) {
        const sw = [3, 0, -3, 0][f];
        r.legA = { dx: sw, dy: f === 1 ? -1 : 0 };
        r.legB = { dx: -sw, dy: f === 3 ? -1 : 0 };
        const hs = [-2, 0, 2, 0][f];
        r.armB = arm([11, 17], [11 + hs, 22]);
        r.armA = arm([12, 17], [12 - hs, 22]);
      } else {
        r.legA.dy = [1, 0, 0, -1][f];
        r.legB.dy = [0, -1, 1, 0][f];
        const s = [-1, 0, 1, 0][f];
        r.armA = arm([6, 17], [6, 22 + s]);
        r.armB = arm([16, 17], [16, 22 - s]);
      }
      break;
    }
    case 'type': {
      const up = f % 2 === 0;
      const alt = f >= 2;
      if (view === 'up') {
        // de costas para a câmera, mãos à frente sobre a mesa (acima, na tela)
        r.armA = arm([6, 17], [5, 20], [7, 17 + (up !== alt ? -1 : 0)]);
        r.armB = arm([16, 17], [17, 20], [15, 17 + (up === alt ? -1 : 0)]);
        r.handsHidden = true;
      } else if (view === 'down') {
        r.armA = arm([6, 17], [6, 21], [8, 22 + (up ? 0 : 1)]);
        r.armB = arm([16, 17], [16, 21], [14, 22 + (up ? 1 : 0)]);
      } else {
        r.armB = arm([11, 17], [10, 20], [7, 20 + (up ? 0 : -1)]);
        r.armA = arm([12, 17], [11, 20], [8, 20 + (up ? -1 : 0)]);
      }
      if (f === 3) r.hd = 1;
      break;
    }
    case 'use': {
      // girando volante/válvula, ajustando equipamento: as mãos fazem um círculo
      const cx = [0, 1, 0, -1][f];
      const cy = [-1, 0, 1, 0][f];
      if (view === 'up') {
        r.armA = arm([6, 17], [5, 14], [8 + cx, 11 + cy]);
        r.armB = arm([16, 17], [17, 14], [14 - cx, 11 - cy]);
      } else if (view === 'down') {
        r.armA = arm([6, 17], [6, 21], [8 + cx, 23 + cy]);
        r.armB = arm([16, 17], [16, 21], [14 - cx, 23 - cy]);
      } else {
        r.armB = arm([11, 17], [9, 19], [6 + cx, 19 + cy]);
        r.armA = arm([12, 17], [10, 18], [7 - cx, 18 - cy]);
      }
      break;
    }
    case 'check': {
      // prancheta numa mão, caneta na outra
      const w = f === 1 ? 1 : 0;
      if (view === 'down') {
        r.board = [8, 19];
        r.armA = arm([6, 17], [6, 21], [8, 21]);
        r.armB = arm([16, 17], [16, 20], [12 + w, 20]);
      } else if (view === 'up') {
        r.armA = arm([6, 17], [5, 20], [7, 19]);
        r.armB = arm([16, 17], [17, 20], [15, 19 + w]);
        r.handsHidden = true;
      } else {
        r.board = [5, 18];
        r.armB = arm([11, 17], [10, 20], [7, 20]);
        r.armA = arm([12, 17], [11, 19], [8 + w, 18]);
      }
      if (f === 1) r.hd = 1;
      break;
    }
    case 'talk':
      r.mouth = f === 0 ? 'open' : 'none';
      if (side) r.armB = f === 0 ? arm([11, 17], [10, 20], [7, 18]) : arm([11, 17], [10, 21], [8, 21]);
      else if (f === 0) r.armB = arm([16, 17], [18, 20], [18, 17]);
      else r.armA = arm([6, 17], [4, 20], [4, 18]);
      break;
    case 'wait':
      r.crossed = view === 'down';
      r.eyes = f === 1 ? 'half' : 'open';
      r.toeTap = f === 1;
      if (view === 'up') {
        r.armA = arm([6, 17], [4, 20], [6, 21]);
        r.armB = arm([16, 17], [18, 20], [16, 21]);
      } else if (side) {
        r.armB = arm([11, 17], [11, 20], [8, 20 + (f === 1 ? -1 : 0)]);
      }
      break;
  }
  return r;
}

/* ------------------------------------------------------------------ cabeça */

type Pal = Record<string, string>;

function stamp(b: PixelBuf, rows: readonly string[], ox: number, oy: number, pal: Pal) {
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const c = pal[ch];
      if (c) b.set(ox + x, oy + y, c);
    }
}

const HEAD: Record<View, string[]> = {
  down: [
    '....ssssss....',
    '..ssssssssss..',
    '.sssssssssssS.',
    '.sssssssssssS.',
    'ssssssssssssSS',
    'ssssessssesssS',
    'ssssEssssEsssS',
    '.ssbssssssbsS.',
    '.sssssmmsssSS.',
    '..ssssssssSS..',
    '....ssssSS....',
  ],
  up: [
    '....ssssss....',
    '..ssssssssss..',
    '.sssssssssssS.',
    '.sssssssssssS.',
    'ssssssssssssSS',
    'ssssssssssssSS',
    'ssssssssssssSS',
    '.sssssssssssS.',
    '.ssssssssssSS.',
    '..ssssssssSS..',
    '....ssssSS....',
  ],
  side: [
    '....ssssss....',
    '..ssssssssss..',
    '.sssssssssssS.',
    '.sssssssssssS.',
    'sssssssssssSS.',
    '.ssessssrsSSS.',
    'sssEsssrrsSSS.',
    '.sbsssssssSS..',
    '.smsssssssS...',
    '..sssssssSS...',
    '...sssssS.....',
  ],
};

/** Cabelo, camada da frente (sobre a cabeça). Linha 0 do molde = linha 0 da cabeça + `y`. */
const HAIR_FRONT: Record<HairStyle, Partial<Record<View, { y: number; rows: string[] }>>> = {
  curto: {
    down: { y: -2, rows: ['....oooooo....', '..oohhhhhooo..', '.ohhHHhhhoood.', 'oohhhhhhoooodd', 'ohoooooooooodd', 'od..........dd', 'o............d'] },
    side: { y: -2, rows: ['....oooooo....', '..oohhhhhooo..', '.ohhHHhhhoood.', 'oohhhhhooooodd', 'o..ooooooooodd', '......oooooodd', '.......o.ooodd', '.........ooodd', '..........oodd'] },
  },
  raspado: {
    down: { y: -1, rows: ['...oooooooo...', '.oooooooooooo.', 'oooooooooooood', 'o............d'] },
    side: { y: -1, rows: ['...oooooooo...', '.oooooooooooo.', 'oooooooooooood', '......oooooood', '.........ooood'] },
  },
  longo: {
    down: { y: -2, rows: ['....oooooo....', '..oohhhhhooo..', '.ohhHHhhhoood.', 'ohhhhhhhhooodd', 'ohooo.oooooodd', 'oo..........dd', 'oo..........dd', 'od..........dd', 'o...........dd', 'o............d'] },
    side: { y: -2, rows: ['....oooooo....', '..oohhhhhooo..', '.ohhHHhhhoood.', 'oohhhhhooooodd', 'o..ooooooooodd', '.....ooooooodd', '......o.oooodd', '........ooood.', '........ooood.', '........ooodd.', '........oood..'] },
  },
  coque: {
    down: { y: -4, rows: ['.....oooo.....', '....ohhood....', '...oooooooo...', '..oohhhhhooo..', '.ohhHHhhhoood.', 'oohhhhhhhoootd', 'ohoooooooooodd', 'od..........dd', 'od..........dd'] },
    side: { y: -4, rows: ['..........ooo.', '.........ohhod', '....oooooood..', '..oohhhhhooo..', '.ohhHHhhhoood.', 'oohhhhhooooodd', 'o..ooooooooodd', '......oooooodd', '.......o.ooodd', '.........ooodd'] },
  },
  rabo: {
    down: { y: -2, rows: ['....oooooo....', '..oohhhhhooo..', '.ohhHHhhhoood.', 'ohhhhhhhhooodd', 'ohoooooooooodd', 'od..........dd', 'o............d'] },
    side: { y: -2, rows: ['....oooooo....', '..oohhhhhooo..', '.ohhHHhhhoood.', 'oohhhhhooooodd', 'o..ooooooooodd', '......oooooodd', '.......o.ooodd', '.........oo.dd', '............dd', '............od', '.............d'] },
  },
  cacheado: {
    down: { y: -1, rows: ['.ohohhohoood..', 'ohohhoohoooodd', 'oo.o..o...o.dd'] },
    side: { y: -1, rows: ['.ohohhohoood..', 'ohohhoohoooodd', 'o.o...oooooodd', '......o.ooodd.', '........oood..'] },
  },
};

function hairPal(a: Appearance, skin: Ramp): Pal {
  const h = ramp(a.hair, 0.1);
  if (a.hairStyle === 'raspado') {
    const m = (c: string) => mix(c, skin.base, 0.38);
    return { o: m(h.base), h: m(h.lt), H: m(h.hi), d: m(h.dk), t: m(h.dk) };
  }
  return { o: h.base, h: h.lt, H: h.hi, d: h.dk, t: h.dd };
}

/** Cabelo atrás da cabeça (antes de desenhar a cabeça): volume do cacheado, comprimento do longo. */
function hairBack(b: PixelBuf, a: Appearance, r: Rig, skin: Ramp) {
  const pal = hairPal(a, skin);
  const oy = HY + r.ub + r.hd;
  const ox = HX;
  if (a.hairStyle === 'cacheado') {
    const cx = ox + 6.5 + (r.view === 'side' ? 1 : 0);
    b.ellipse(cx, oy + 3, 8.2, 6.6, pal.o);
    b.ellipse(cx - 2, oy + 0.5, 4, 3, pal.h);
    for (let y = -4; y < 10; y++)
      for (let x = -2; x < 16; x++) if ((x * 7 + y * 5) % 9 === 0 && b.alphaAt(ox + x, oy + y) > 200) b.set(ox + x, oy + y, pal.d);
    return;
  }
  if (a.hairStyle === 'longo' && r.view !== 'side') {
    // mechas caindo atrás dos ombros
    for (const x0 of [0, 11]) {
      b.rect(ox + x0, oy + 2, 3, 12, pal.o);
      b.vline(ox + x0 + (x0 ? 2 : 0), oy + 2, oy + 13, pal.d);
    }
    b.rect(ox + 1, oy + 14, 2, 1, pal.d);
    b.rect(ox + 11, oy + 14, 2, 1, pal.d);
  }
}

/** Visão de costas: cabelo cobre a cabeça quase inteira (só a nuca aparece). */
function hairUp(b: PixelBuf, a: Appearance, r: Rig, skin: Ramp) {
  const pal = hairPal(a, skin);
  const ox = HX;
  const oy = HY + r.ub + r.hd;
  const helmet = a.head === 'capacete';
  const bottom = helmet ? 7 : a.hairStyle === 'raspado' ? 5 : a.hairStyle === 'longo' ? 13 : a.hairStyle === 'cacheado' ? 9 : 7;
  for (let y = helmet ? 3 : -2; y <= Math.min(bottom, 10); y++) {
    const row = HEAD.up[Math.max(0, y)];
    for (let x = 0; x < 14; x++) {
      const inside = y === -2 ? x >= 4 && x <= 9 : y === -1 ? x >= 2 && x <= 11 : row[x] !== '.';
      if (!inside) continue;
      const c = x >= 11 ? pal.d : x <= 2 && y < 4 ? pal.h : pal.o;
      b.set(ox + x, oy + y, c);
    }
  }
  if (helmet) {
    // sob o capacete: só a nuca e, se houver, o rabo de cavalo
    if (a.hairStyle === 'rabo' || a.hairStyle === 'longo') {
      b.rect(ox + 5, oy + 7, 4, 6, pal.o);
      b.vline(ox + 8, oy + 7, oy + 12, pal.d);
    }
    return;
  }
  if (a.hairStyle !== 'raspado') {
    b.hline(ox + 4, ox + 7, oy - 1, pal.h);
    b.hline(ox + 3, ox + 5, oy, pal.H ?? pal.h);
  }
  if (a.hairStyle === 'longo') {
    b.rect(ox + 1, oy + 9, 12, 5, pal.o);
    b.vline(ox + 12, oy + 9, oy + 13, pal.d);
    b.hline(ox + 2, ox + 11, oy + 14, pal.d);
  }
  if (a.hairStyle === 'coque') {
    b.ellipse(ox + 6.5, oy - 3, 2.6, 2.2, pal.o);
    b.set(ox + 5, oy - 4, pal.h);
  }
  if (a.hairStyle === 'rabo') {
    b.rect(ox + 6, oy + 7, 2, 8, pal.o);
    b.set(ox + 7, oy + 14, pal.d);
    b.rect(ox + 5, oy + 6, 4, 1, '#c8463b');
  }
}

function drawHead(b: PixelBuf, a: Appearance, r: Rig) {
  const skin = ramp(a.skin, 0.07);
  const dark = luminance(a.skin) < 0.38;
  const ox = HX;
  const oy = HY + r.ub + r.hd;
  if (a.head !== 'capacete') hairBack(b, a, r, skin);
  const closed = r.eyes === 'closed';
  const half = r.eyes === 'half';
  const eyeTop = dark ? '#f0ecf4' : '#1c1722';
  const eyeBot = dark ? '#2a1e22' : '#3a2f3f';
  const pal: Pal = {
    s: skin.base,
    S: skin.dk,
    e: closed ? skin.base : half ? shade(skin.base, -0.2) : eyeTop,
    E: closed ? shade(skin.base, -0.32) : eyeBot,
    b: mix(a.skin, '#ff7d7d', 0.3),
    m: r.mouth === 'open' ? '#7a2e35' : shade(a.skin, -0.22),
    r: skin.dk,
  };
  stamp(b, HEAD[r.view], ox, oy, pal);
  if (r.view !== 'up') b.set(ox + 3, oy + 2, skin.lt); // brilho na testa
  if (r.mouth === 'open' && r.view !== 'up') {
    if (r.view === 'down') b.set(ox + 6, oy + 9, '#5a1f26');
    else b.set(ox + 2, oy + 9, '#5a1f26');
  }

  // barba / bigode
  if (a.facial !== 'none' && r.view !== 'up') {
    const hc = a.facial === 'rala' ? mix(a.skin, a.hair, 0.35) : a.hair;
    const hd = shade(hc, -0.12);
    if (r.view === 'down') {
      if (a.facial !== 'bigode') {
        for (const x of [1, 12]) for (const y of [7, 8]) b.set(ox + x, oy + y, hd);
        for (let x = 2; x <= 11; x++) if (x < 6 || x > 7) b.set(ox + x, oy + 9, x > 9 ? hd : hc);
        for (let x = 4; x <= 9; x++) b.set(ox + x, oy + 10, x > 7 ? hd : hc);
        b.set(ox + 6, oy + 10, hc);
      }
      if (a.facial !== 'rala') for (let x = 5; x <= 8; x++) b.set(ox + x, oy + 8, x === 6 || x === 7 ? hc : hd);
    } else {
      if (a.facial !== 'bigode') {
        for (let x = 1; x <= 8; x++) b.set(ox + x, oy + 9, x > 6 ? hd : hc);
        for (let x = 2; x <= 6; x++) b.set(ox + x, oy + 10, hc);
      }
      if (a.facial !== 'rala') b.set(ox + 1, oy + 8, hc);
    }
  }

  // cabelo (frente) ou visão de costas
  if (r.view === 'up') hairUp(b, a, r, skin);
  else if (a.head !== 'capacete') {
    const t = HAIR_FRONT[a.hairStyle][r.view];
    if (t) stamp(b, t.rows, ox, oy + t.y, hairPal(a, skin));
  } else {
    // sob o capacete aparecem só as laterais
    const pal = hairPal(a, skin);
    if (r.view === 'down') {
      for (const x of [0, 13]) b.vline(ox + x, oy + 3, oy + 5, x ? pal.d : pal.o);
      if (a.hairStyle === 'longo' || a.hairStyle === 'rabo') for (const x of [0, 13]) b.vline(ox + x, oy + 6, oy + 9, x ? pal.d : pal.o);
    } else {
      b.rect(ox + 9, oy + 3, 4, 4, pal.o);
      b.vline(ox + 12, oy + 3, oy + 6, pal.d);
      if (a.hairStyle === 'rabo' || a.hairStyle === 'longo') b.rect(ox + 11, oy + 7, 2, 5, pal.o);
    }
  }

  // óculos
  if (a.glasses !== 'none' && r.view !== 'up') {
    const frame = a.glasses === 'seguranca' ? '#5c6670' : '#2a2a32';
    const lens = a.glasses === 'seguranca' ? 'rgba(170,215,240,0.45)' : 'rgba(210,230,245,0.35)';
    if (r.view === 'down') {
      b.hline(ox + 2, ox + 11, oy + 4, frame);
      for (const x0 of [3, 8]) {
        b.rect(ox + x0, oy + 5, 3, 2, lens);
        b.set(ox + x0, oy + 5, 'rgba(255,255,255,0.6)');
      }
      if (a.glasses === 'grau') {
        b.vline(ox + 2, oy + 4, oy + 6, frame);
        b.vline(ox + 11, oy + 4, oy + 6, frame);
        b.hline(ox + 3, ox + 5, oy + 7, frame);
        b.hline(ox + 8, ox + 10, oy + 7, frame);
      }
    } else {
      b.hline(ox + 1, ox + 8, oy + 4, frame);
      b.rect(ox + 2, oy + 5, 3, 2, lens);
      b.set(ox + 2, oy + 5, 'rgba(255,255,255,0.6)');
    }
  }

  // capacete / boné
  if (a.head === 'capacete') drawHelmet(b, a.headColor, r, ox, oy);
  else if (a.head === 'bone') drawCap(b, a.headColor, r, ox, oy);
}

function drawHelmet(b: PixelBuf, color: string, r: Rig, ox: number, oy: number) {
  const c = ramp(color, 0.1);
  const brim = shade(color, -0.16);
  const dome = r.view === 'side' ? ['....cccccc....', '..cLLccccccc..', '.cLcccccccccC.', 'cccccccccccccC', 'cccccccccccCCC'] : ['....cccccc....', '..ccLLcccccc..', '.cLLccccccccC.', '.cccccccccccC.', 'ccccccccccccCC'];
  stamp(b, dome, ox, oy - 3, { c: c.base, L: c.hi, C: c.dk });
  // nervura central
  if (r.view !== 'side') for (let y = -3; y <= 0; y++) b.set(ox + 6 + (y === -3 ? 0 : 0), oy + y, c.lt), b.set(ox + 7, oy + y, c.base);
  else for (let y = -3; y <= 0; y++) b.set(ox + 7, oy + y, c.lt);
  // aba
  if (r.view === 'side') {
    b.hline(ox - 2, ox + 13, oy + 2, brim);
    b.hline(ox - 2, ox + 3, oy + 3, shade(color, -0.3));
  } else {
    b.hline(ox - 1, ox + 14, oy + 2, brim);
    b.hline(ox, ox + 13, oy + 3, r.view === 'down' ? 'rgba(20,24,40,0.28)' : brim);
  }
}

function drawCap(b: PixelBuf, color: string, r: Rig, ox: number, oy: number) {
  const c = ramp(color, 0.1);
  stamp(b, ['....cccccc....', '..cccccccccc..', '.ccLcccccccccC', 'cccccccccccccC'], ox, oy - 2, { c: c.base, L: c.lt, C: c.dk });
  b.hline(ox, ox + 13, oy + 2, c.dk);
  if (r.view === 'down') {
    b.hline(ox + 2, ox + 11, oy + 3, c.lt);
    b.hline(ox + 3, ox + 10, oy + 4, 'rgba(20,24,40,0.3)');
  } else if (r.view === 'side') {
    b.hline(ox - 3, ox + 2, oy + 2, c.lt);
    b.hline(ox - 3, ox + 1, oy + 3, c.dk);
  } else {
    b.rect(ox + 5, oy + 1, 4, 1, 'rgba(255,255,255,0.35)');
  }
}

/* ------------------------------------------------------------------ corpo */

function drawArm(b: PixelBuf, a: Arm, r: Rig, sleeve: Ramp, skin: Ramp, sleeveLen: number, hand: string | null, dim = 0) {
  const pts: [number, number][] = [];
  for (let i = 0; i < a.pts.length - 1; i++) {
    const [x0, y0] = a.pts[i];
    const [x1, y1] = a.pts[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) pts.push([Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps)]);
  }
  const dy = r.ub;
  const sl = dim ? ramp(shade(sleeve.base, -dim), 0.08) : sleeve;
  const sk = dim ? ramp(shade(skin.base, -dim), 0.07) : skin;
  pts.forEach(([x, y], i) => {
    const last = i === pts.length - 1;
    const isSleeve = i < sleeveLen && !last;
    const c = isSleeve ? sl : sk;
    b.set(x, y + dy, c.base);
    b.set(x + 1, y + dy, c.dk);
    b.set(x, y + 1 + dy, c.base);
    b.set(x + 1, y + 1 + dy, c.dk);
  });
  if (r.handsHidden) return;
  const [hx, hy] = pts[pts.length - 1];
  const hc = hand ? ramp(dim ? shade(hand, -dim) : hand, 0.1) : sk;
  b.set(hx, hy + dy, hc.lt);
  b.set(hx + 1, hy + dy, hc.base);
  b.set(hx, hy + 1 + dy, hc.base);
  b.set(hx + 1, hy + 1 + dy, hc.dk);
}

function drawTorso(b: PixelBuf, a: Appearance, r: Rig) {
  const t = ramp(a.topColor, 0.08);
  const skin = ramp(a.skin, 0.07);
  const y0 = 16 + r.ub;
  const stripe = '#dfe3e8';
  const stripeHi = '#ffffff';
  if (r.view === 'side') {
    // tronco de perfil (virado à esquerda): x 10–14
    b.rect(10, y0, 5, 8, t.base);
    b.vline(10, y0, y0 + 7, t.lt);
    b.vline(14, y0, y0 + 7, t.dk);
    b.set(10, y0, a.top === 'camiseta' ? skin.base : t.hi);
    if (a.vest) {
      const v = ramp(a.vest, 0.08);
      b.rect(10, y0, 5, 8, v.base);
      b.vline(14, y0, y0 + 7, v.dk);
      b.hline(10, 14, y0 + 3, stripe);
      b.hline(10, 14, y0 + 6, stripe);
      b.set(10, y0 + 3, stripeHi);
    } else if (a.stripes) {
      b.hline(10, 14, y0 + 3, stripe);
      b.set(10, y0 + 3, stripeHi);
    }
    if (a.badge) {
      b.rect(10, y0 + 3, 2, 3, '#f4f6f8');
      b.set(10, y0 + 3, '#3f74c8');
    }
    if (!a.vest) b.hline(10, 14, y0 + 7, a.top === 'macacao' ? t.dk : '#2a2420');
    if (a.toolbelt) {
      b.hline(10, 14, y0 + 7, '#6b4a2b');
      b.rect(13, y0 + 7, 2, 3, '#8a6034');
    }
    if (a.radio) b.rect(13, y0 + 5, 2, 3, '#1b1b1f');
    return;
  }
  const front = r.view === 'down';
  // ombros e tronco: x 8–15
  b.rect(8, y0, 8, 8, t.base);
  b.vline(8, y0 + 1, y0 + 7, t.lt);
  b.vline(15, y0, y0 + 7, t.dk);
  b.hline(8, 15, y0 + 7, t.dk);
  b.set(8, y0, t.base);
  if (front) {
    // gola / decote
    switch (a.top) {
      case 'camisa':
      case 'polo':
        b.set(11, y0, skin.base);
        b.set(12, y0, skin.dk);
        b.set(10, y0, t.hi);
        b.set(13, y0, t.hi);
        b.set(10, y0 + 1, t.lt);
        b.set(13, y0 + 1, t.lt);
        if (a.top === 'camisa') for (const y of [2, 4, 6]) b.set(11, y0 + y, t.dk);
        else b.set(11, y0 + 2, t.dk);
        break;
      case 'camiseta':
        b.hline(10, 13, y0, skin.base);
        b.set(13, y0, skin.dk);
        b.hline(10, 13, y0 + 1, t.dk);
        break;
      case 'macacao':
      case 'manga-longa':
        b.hline(10, 13, y0, t.hi);
        b.set(11, y0, skin.base);
        b.vline(11, y0 + 1, y0 + 7, t.dk);
        b.rect(9, y0 + 2, 2, 2, t.dk); // bolso
        b.set(9, y0 + 2, t.lt);
        break;
    }
  } else {
    b.hline(10, 13, y0, t.dk);
  }
  if (a.stripes && !a.vest) {
    b.hline(8, 15, y0 + 4, stripe);
    b.hline(8, 9, y0 + 4, stripeHi);
    b.hline(8, 15, y0 + 5, 'rgba(150,156,164,0.9)');
  }
  if (a.vest) {
    const v = ramp(a.vest, 0.08);
    for (let y = y0; y <= y0 + 7; y++)
      for (let x = 8; x <= 15; x++) {
        if (front && (x === 11 || x === 12) && y < y0 + 6) continue; // abertura do colete
        b.set(x, y, x === 15 ? v.dk : x === 8 ? v.lt : v.base);
      }
    for (const yy of [3, 6]) {
      b.hline(8, 15, y0 + yy, stripe);
      b.set(8, y0 + yy, stripeHi);
      if (front) b.hline(11, 12, y0 + yy, yy === 6 ? stripe : t.base);
    }
    if (!front) {
      // costas: faixas em "X" discreto
      b.set(10, y0 + 1, stripe);
      b.set(13, y0 + 1, stripe);
    }
  }
  // cinto
  if (a.top !== 'macacao' && !a.vest) {
    b.hline(8, 15, y0 + 7, '#2a2420');
    if (front) b.rect(11, y0 + 7, 2, 1, '#c9b27a');
  }
  if (a.toolbelt) {
    b.hline(8, 15, y0 + 7, '#6b4a2b');
    b.rect(8, y0 + 7, 2, 3, '#8a6034');
    b.set(8, y0 + 7, '#a77a45');
    b.rect(14, y0 + 7, 2, 2, '#8a6034');
    b.vline(15, y0 + 8, y0 + 10, '#c9ccd1');
  }
  if (a.radio) {
    b.rect(front ? 14 : 8, y0 + 5, 2, 3, '#1b1b1f');
    b.vline(front ? 15 : 8, y0 + 3, y0 + 4, '#1b1b1f');
  }
  // crachá
  if (a.badge && front) {
    b.set(10, y0 + 1, '#3f74c8');
    b.set(13, y0 + 1, '#3f74c8');
    b.set(11, y0 + 2, '#3f74c8');
    b.set(12, y0 + 2, '#3f74c8');
    b.rect(11, y0 + 3, 2, 3, '#f4f6f8');
    b.hline(11, 12, y0 + 3, '#3f74c8');
  }
}

function drawLegs(b: PixelBuf, a: Appearance, r: Rig) {
  const p = ramp(a.bottomColor, 0.07);
  const sh = ramp(a.shoes, 0.1);
  const stripe = '#dfe3e8';
  if (r.view === 'side') {
    if (r.seated) {
      // coxa para a frente (esquerda), canela para baixo
      const y = 24 + r.ub - 1;
      b.rect(7, y, 7, 3, p.base);
      b.hline(7, 13, y, p.lt);
      b.hline(7, 13, y + 2, p.dk);
      b.rect(6, y + 3, 3, 30 - (y + 3), p.dk);
      b.rect(4, 29, 5, 2, sh.base);
      b.set(4, 29, sh.lt);
      b.hline(4, 8, 30, sh.dd);
      return;
    }
    const leg = (dx: number, dy: number, dim: number) => {
      const pc = dim ? ramp(shade(a.bottomColor, -dim), 0.07) : p;
      const sc = dim ? ramp(shade(a.shoes, -dim), 0.1) : sh;
      const x = 11 + dx;
      const y1 = 28 + dy;
      for (let y = 24 + r.ub; y <= y1; y++) {
        b.set(x, y, pc.lt);
        b.set(x + 1, y, pc.base);
        b.set(x + 2, y, pc.dk);
      }
      if (a.stripes) b.hline(x, x + 2, 27 + dy, dim ? shade(stripe, -dim) : stripe);
      b.rect(x - 1, y1 + 1, 4, 1, sc.base);
      b.set(x - 1, y1 + 1, sc.lt);
      b.hline(x - 1, x + 2, y1 + 2, sc.dd);
    };
    leg(r.legA.dx, r.legA.dy, 0.14);
    leg(r.legB.dx, r.legB.dy, 0);
    return;
  }
  const top = 24 + r.ub;
  if (r.seated) {
    if (r.view === 'down') {
      b.rect(8, top, 8, 1, p.lt);
      b.rect(8, top + 1, 8, 1, p.base);
      b.set(11, top + 1, p.dk);
      b.set(15, top, p.base);
      b.set(15, top + 1, p.dk);
      b.rect(8, top + 2, 3, 30 - (top + 2), p.dk);
      b.rect(13, top + 2, 3, 30 - (top + 2), p.dk);
      b.rect(8, 29, 3, 2, sh.base);
      b.set(8, 29, sh.lt);
      if (r.toeTap) b.rect(13, 28, 3, 2, sh.base);
      else b.rect(13, 29, 3, 2, sh.base);
      b.set(13, r.toeTap ? 28 : 29, sh.lt);
    } else {
      b.rect(8, top, 8, 2, p.base);
      b.hline(8, 15, top + 1, p.dk);
    }
    return;
  }
  // quadril
  b.rect(8, top, 8, 2, p.base);
  b.set(15, top, p.dk);
  b.set(15, top + 1, p.dk);
  const leg = (x: number, dy: number) => {
    const y1 = 28 + dy;
    for (let y = top + 2; y <= y1; y++) {
      b.set(x, y, p.lt);
      b.set(x + 1, y, p.base);
      b.set(x + 2, y, p.dk);
    }
    if (a.stripes) {
      b.hline(x, x + 2, 27 + Math.min(0, dy), stripe);
      b.set(x, 27 + Math.min(0, dy), '#ffffff');
    }
    b.rect(x, y1 + 1, 3, 1, sh.base);
    b.set(x, y1 + 1, sh.lt);
    b.rect(x, y1 + 2, 3, 1, sh.dd);
  };
  const tapB = r.toeTap ? -1 : 0;
  leg(8, r.view === 'up' ? r.legB.dy : r.legA.dy);
  leg(13, (r.view === 'up' ? r.legA.dy : r.legB.dy) + tapB);
  b.set(11, top + 2, p.dk);
  b.set(12, top + 2, p.dk);
}

function drawBoard(b: PixelBuf, at: Pt, r: Rig) {
  const [x, y] = at;
  const dy = r.ub;
  b.rect(x, y + dy, 5, 6, '#7b553b');
  b.rect(x + 1, y + 1 + dy, 3, 4, '#f4f2ec');
  b.hline(x + 1, x + 3, y + 2 + dy, '#8a8f99');
  b.hline(x + 1, x + 2, y + 4 + dy, '#8a8f99');
  b.rect(x + 2, y + dy, 1, 1, '#c9ccd1');
}

function drawCrossedArms(b: PixelBuf, a: Appearance, r: Rig, sleeve: Ramp, skin: Ramp) {
  const y = 19 + r.ub;
  b.rect(7, y, 10, 3, sleeve.base);
  b.hline(7, 16, y, sleeve.lt);
  b.hline(7, 16, y + 2, sleeve.dk);
  const hand = a.gloves ? ramp(a.gloves, 0.1) : skin;
  b.rect(7, y + 1, 2, 2, hand.base);
  b.rect(15, y, 2, 2, hand.base);
  b.set(15, y, hand.lt);
}

/* ------------------------------------------------------------------ quadro completo */

/** Desenha um quadro do personagem num buffer 24×34 (com contorno). */
export function renderCharacter(a: Appearance, pose: Pose, view: View, frame: number, seated = false): PixelBuf {
  const b = new PixelBuf(CHAR_W, CHAR_H);
  const r = makeRig(pose, view, frame, seated);
  const skin = ramp(a.skin, 0.07);
  const sleeve = ramp(a.vest && a.top === 'camiseta' ? a.topColor : a.topColor, 0.08);
  const sleeveLen = a.longSleeve || a.top === 'macacao' || a.top === 'manga-longa' ? 99 : a.top === 'camiseta' ? 2 : 3;
  const gloves = a.gloves;

  if (view === 'side') {
    drawArm(b, r.armA, r, sleeve, skin, sleeveLen, gloves, 0.16); // braço de trás
    drawLegs(b, a, r);
    drawTorso(b, a, r);
    if (r.board) drawBoard(b, r.board, r);
    drawHead(b, a, r);
    drawArm(b, r.armB, r, sleeve, skin, sleeveLen, gloves);
  } else {
    drawLegs(b, a, r);
    if (view === 'up' && r.handsHidden) {
      // de costas com as mãos à frente: braços antes da cabeça, por trás do tronco nas pontas
      drawTorso(b, a, r);
      drawArm(b, r.armA, r, sleeve, skin, sleeveLen, gloves);
      drawArm(b, r.armB, r, sleeve, skin, sleeveLen, gloves);
      drawHead(b, a, r);
    } else {
      drawTorso(b, a, r);
      if (r.crossed) drawCrossedArms(b, a, r, sleeve, skin);
      else {
        drawArm(b, r.armA, r, sleeve, skin, sleeveLen, gloves);
        drawArm(b, r.armB, r, sleeve, skin, sleeveLen, gloves);
      }
      if (r.board) drawBoard(b, r.board, r);
      drawHead(b, a, r);
    }
  }
  b.outline();
  return b;
}

/** Folha com todos os quadros: linhas = (vista, pose), colunas = quadros; sentado/em pé para as poses mistas. */
export interface SheetLayout {
  cols: number;
  rows: number;
  frames: { name: string; x: number; y: number }[];
}

export function frameName(view: View, pose: Pose, frame: number, seated = false): string {
  return `${view}_${pose}${seated && !SEATED.has(pose) ? '_s' : ''}_${frame}`;
}

/** Poses que também têm variante sentada (conversar na mesa de reunião, conferir sentado). */
const SEATABLE: Pose[] = ['talk', 'check', 'stand'];

export function renderSheet(a: Appearance): { buf: PixelBuf; layout: SheetLayout } {
  const cells: { name: string; draw: () => PixelBuf }[] = [];
  for (const v of VIEWS)
    for (const p of POSES) {
      for (let f = 0; f < POSE_FRAMES[p]; f++) cells.push({ name: frameName(v, p, f), draw: () => renderCharacter(a, p, v, f) });
      if (SEATABLE.includes(p)) for (let f = 0; f < POSE_FRAMES[p]; f++) cells.push({ name: frameName(v, p, f, true), draw: () => renderCharacter(a, p, v, f, true) });
    }
  const cols = 16;
  const rows = Math.ceil(cells.length / cols);
  const buf = new PixelBuf(cols * CHAR_W, rows * CHAR_H);
  const frames: SheetLayout['frames'] = [];
  cells.forEach((c, i) => {
    const x = (i % cols) * CHAR_W;
    const y = Math.floor(i / cols) * CHAR_H;
    buf.draw(c.draw(), x, y);
    frames.push({ name: c.name, x, y });
  });
  return { buf, layout: { cols, rows, frames } };
}

export function isSeatedPose(p: Pose, seated: boolean) {
  return SEATED.has(p) || (seated && SEATABLE.includes(p));
}
