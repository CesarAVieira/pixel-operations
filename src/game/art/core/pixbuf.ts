/**
 * Buffer RGBA puro (sem DOM). Toda a arte é composta aqui e só no fim vira textura.
 * Permite gerar e testar sprites em Node, contornar automaticamente e manter o desenho determinístico.
 */
import { outlineOf, parseColor, type Ramp } from './color';

export class PixelBuf {
  readonly data: Uint8ClampedArray;
  /** Origem somada a todas as operações de pintura. */
  ox = 0;
  oy = 0;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(Math.max(1, w * h * 4));
  }

  private blend(xi: number, yi: number, c: string, under = false) {
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const [r, g, b, a8] = parseColor(c);
    const i = (yi * this.w + xi) * 4;
    const d = this.data;
    const sa = a8 / 255;
    const da = d[i + 3] / 255;
    if (under) {
      // destination-over: pinta por baixo
      const oa = da + sa * (1 - da);
      if (oa <= 0) return;
      d[i] = (d[i] * da + r * sa * (1 - da)) / oa;
      d[i + 1] = (d[i + 1] * da + g * sa * (1 - da)) / oa;
      d[i + 2] = (d[i + 2] * da + b * sa * (1 - da)) / oa;
      d[i + 3] = oa * 255;
      return;
    }
    if (sa >= 1) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
      return;
    }
    if (sa <= 0) return;
    const oa = sa + da * (1 - sa);
    d[i] = (r * sa + d[i] * da * (1 - sa)) / oa;
    d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / oa;
    d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
  }

  /** Escrita rápida e opaca (sem parse/mistura). Ignora a origem. */
  put(xi: number, yi: number, r: number, g: number, b: number) {
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = 255;
  }

  set(x: number, y: number, c?: string) {
    if (c) this.blend(Math.floor(x) + this.ox, Math.floor(y) + this.oy, c);
  }

  under(x: number, y: number, c: string) {
    this.blend(Math.floor(x) + this.ox, Math.floor(y) + this.oy, c, true);
  }

  alphaAt(x: number, y: number): number {
    const xi = Math.floor(x) + this.ox;
    const yi = Math.floor(y) + this.oy;
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return 0;
    return this.data[(yi * this.w + xi) * 4 + 3];
  }

  rect(x: number, y: number, w: number, h: number, c?: string) {
    if (!c) return;
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let yy = y0; yy < y0 + Math.round(h); yy++) for (let xx = x0; xx < x0 + Math.round(w); xx++) this.set(xx, yy, c);
  }

  hline(x0: number, x1: number, y: number, c?: string) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
  }

  vline(x: number, y0: number, y1: number, c?: string) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    let ax = Math.round(x0);
    let ay = Math.round(y0);
    const bx = Math.round(x1);
    const by = Math.round(y1);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(ax, ay, c);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ax += sx;
      }
      if (e2 <= dx) {
        err += dx;
        ay += sy;
      }
    }
  }

  /** Elipse preenchida (amostragem no centro do pixel). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) this.set(x, y, c);
    }
  }

  /** Retângulo de cantos arredondados (raio 1). */
  round(x: number, y: number, w: number, h: number, c: string) {
    this.rect(x + 1, y, w - 2, h, c);
    this.rect(x, y + 1, 1, h - 2, c);
    this.rect(x + w - 1, y + 1, 1, h - 2, c);
  }

  /** Sombra de contato elíptica composta por baixo. */
  shadow(cx: number, cy: number, rx: number, ry: number, alpha = 0.24) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
        const edge = Math.abs((x + 0.5 - cx) / rx) > 0.75 || Math.abs(dy) > 0.6;
        this.under(x, y, `rgba(24,28,46,${edge ? alpha * 0.6 : alpha})`);
      }
    }
  }

  /** Face superior de um volume (clara, com borda de brilho embaixo). */
  top(x: number, y: number, w: number, h: number, m: Ramp) {
    this.rect(x, y, w, h, m.lt);
    this.hline(x, x + w - 1, y, m.base);
    if (h > 2) this.hline(x, x + w - 1, y + h - 1, m.hi);
  }

  /** Face frontal (vista de frente na projeção 3/4): base com borda inferior e lateral escuras. */
  front(x: number, y: number, w: number, h: number, m: Ramp) {
    this.rect(x, y, w, h, m.base);
    this.hline(x, x + w - 1, y + h - 1, m.dk);
    this.vline(x + w - 1, y, y + h - 1, m.dk);
    this.vline(x, y, y + h - 1, m.lt);
  }

  /** Volume 3/4: topo (th px) + frente (fh px). */
  box(x: number, y: number, w: number, th: number, fh: number, top: Ramp, front: Ramp = top) {
    this.top(x, y, w, th, top);
    this.front(x, y + th, w, fh, front);
  }

  /** Copia outro buffer (com alfa) na posição dada (somando a origem). */
  draw(src: PixelBuf, x: number, y: number) {
    const d = src.data;
    for (let yy = 0; yy < src.h; yy++)
      for (let xx = 0; xx < src.w; xx++) {
        const i = (yy * src.w + xx) * 4;
        if (d[i + 3] === 0) continue;
        this.set(x + xx, y + yy, `rgba(${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3] / 255})`);
      }
  }

  /** Contorno automático: pixels transparentes vizinhos de opacos ganham a cor de contorno do vizinho mais escuro. */
  outline() {
    const { w, h } = this;
    const src = this.data.slice();
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] >= 150;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] >= 150) continue;
        let best = -1;
        let lum = 1e9;
        for (const [nx, ny] of [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]]) {
          if (!opaque(nx, ny)) continue;
          const j = (ny * w + nx) * 4;
          const l = src[j] * 0.3 + src[j + 1] * 0.59 + src[j + 2] * 0.11;
          if (l < lum) {
            lum = l;
            best = j;
          }
        }
        if (best < 0) continue;
        const [r, g, b] = outlineOf(src[best], src[best + 1], src[best + 2]);
        this.data[i] = r;
        this.data[i + 1] = g;
        this.data[i + 2] = b;
        this.data[i + 3] = 255;
      }
  }
}

/** Gerador determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash inteiro determinístico de coordenadas. */
export function hash3(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Ruído suave em coordenadas de mundo (0..1). */
export function noise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash3(gx, gy, seed);
  const b = hash3(gx + 1, gy, seed);
  const c = hash3(gx, gy + 1, seed);
  const d = hash3(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
