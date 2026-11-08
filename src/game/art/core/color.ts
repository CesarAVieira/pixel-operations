/**
 * Cores (puro): parse, mistura, sombreamento com deslocamento de matiz e rampas de material.
 * Sombras puxam levemente para o azul/frio e brilhos para o amarelo/quente (pixel art clássica).
 */
export type RGBA = [number, number, number, number];

const cache = new Map<string, RGBA>();

export function parseColor(c: string): RGBA {
  let v = cache.get(c);
  if (v) return v;
  const s = c.trim().toLowerCase();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const full = h.length <= 4 ? [...h].map((ch) => ch + ch).join('') : h;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    v = [n(0), n(2), n(4), full.length === 8 ? n(6) : 255];
  } else {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    const p = m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : [255, 0, 255];
    v = [p[0], p[1], p[2], p[3] === undefined ? 255 : Math.round(p[3] * 255)];
  }
  cache.set(c, v);
  return v;
}

const h2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
export const toHex = (r: number, g: number, b: number) => `#${h2(r)}${h2(g)}${h2(b)}`;

export function mix(a: string, b: string, t: number): string {
  const A = parseColor(a);
  const B = parseColor(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** amt > 0 clareia (puxando ao quente), amt < 0 escurece (puxando ao frio). */
export function shade(c: string, amt: number): string {
  const [r, g, b] = parseColor(c);
  if (amt >= 0) {
    const t = Math.min(1, amt);
    return toHex(r + (255 - r) * t + 6 * t, g + (250 - g) * t, b + (220 - b) * t);
  }
  const t = Math.min(1, -amt);
  return toHex(r * (1 - t) + 20 * t, g * (1 - t) + 24 * t, b * (1 - t) + 48 * t);
}

/** Luminância relativa aproximada (0 = preto, 1 = branco). */
export function luminance(c: string): number {
  const [r, g, b] = parseColor(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function rgba(c: string, a: number): string {
  const [r, g, b] = parseColor(c);
  return `rgba(${r},${g},${b},${a})`;
}

/** Rampa de material: hi (brilho), lt (luz), base, dk (sombra), dd (sombra profunda). */
export interface Ramp {
  hi: string;
  lt: string;
  base: string;
  dk: string;
  dd: string;
}

export function ramp(base: string, step = 0.12): Ramp {
  return { hi: shade(base, step * 2.2), lt: shade(base, step), base, dk: shade(base, -step * 1.4), dd: shade(base, -step * 2.8) };
}

/** Cor do contorno derivada do pixel vizinho mais escuro (contorno "selado", não preto). */
const OUTLINE = '#1d2131';
const outlineCache = new Map<number, RGBA>();
export function outlineOf(r: number, g: number, b: number): RGBA {
  const key = (r << 16) | (g << 8) | b;
  let v = outlineCache.get(key);
  if (!v) {
    v = parseColor(mix(shade(toHex(r, g, b), -0.5), OUTLINE, 0.65));
    outlineCache.set(key, v);
  }
  return v;
}

/** Materiais recorrentes. */
export const MAT = {
  steel: ramp('#a9b2bc', 0.1),
  steelDark: ramp('#6b7480', 0.12),
  white: ramp('#eceae4', 0.05),
  concrete: ramp('#b9b6ad', 0.07),
  oak: ramp('#c99a63', 0.1),
  walnut: ramp('#7b553b', 0.12),
  red: ramp('#c8463b', 0.12),
  yellow: ramp('#e8b928', 0.1),
  amber: ramp('#f2b632', 0.1),
  blue: ramp('#3f74c8', 0.12),
  green: ramp('#4f9a52', 0.12),
  rust: ramp('#8a4a2c', 0.12),
  rubber: ramp('#2a2d36', 0.15),
  glass: ramp('#8fc3e0', 0.1),
  leaf: ramp('#4f9440', 0.13),
  leafDark: ramp('#2f6b3a', 0.13),
  pine: ramp('#2e6447', 0.12),
  bark: ramp('#7a5236', 0.12),
  fabricBlue: ramp('#4a6aa6', 0.12),
  fabricGreen: ramp('#4f8a6c', 0.12),
  orange: ramp('#ef8a25', 0.1),
} as const;
