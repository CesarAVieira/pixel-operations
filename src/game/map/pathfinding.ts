import type { Vec2 } from '../../types/world';

/** Grade de passabilidade: 1 = livre, 0 = bloqueado. */
export interface PassGrid {
  width: number;
  height: number;
  cells: Uint8Array;
  /** Custo por célula (≥ 1). Opcional: pedestres preferem calçadas e evitam cruzar vias. */
  cost?: Float32Array;
}

const cellCost = (g: PassGrid, i: number) => (g.cost ? g.cost[i] : 1);

export function isFree(g: PassGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height && g.cells[y * g.width + x] === 1;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, p: number) {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastI = this.items.pop()!;
    const lastP = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}

/**
 * A* em 8 direções sem "cortar quinas" (diagonal só se as duas ortogonais estiverem livres).
 * Retorna a lista de tiles (inteiros) do início ao fim, ou null se inalcançável.
 */
export function findPath(g: PassGrid, start: Vec2, goal: Vec2): Vec2[] | null {
  const [sx, sy] = start;
  const [gx, gy] = goal;
  if (!isFree(g, sx, sy) || !isFree(g, gx, gy)) return null;
  const W = g.width;
  const N = g.width * g.height;
  const startI = sy * W + sx;
  const goalI = gy * W + gx;
  const gScore = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const open = new MinHeap();
  gScore[startI] = 0;
  open.push(startI, h(sx, sy));
  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goalI) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isFree(g, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!isFree(g, cx + dx, cy) || !isFree(g, cx, cy + dy))) continue;
      const ni = ny * W + nx;
      const ng = gScore[cur] + cost * cellCost(g, ni);
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        came[ni] = cur;
        open.push(ni, ng + h(nx, ny));
      }
    }
  }
  if (startI !== goalI && came[goalI] === -1) return null;
  const path: Vec2[] = [];
  let i = goalI;
  for (;;) {
    path.push([i % W, Math.floor(i / W)]);
    if (i === startI) break;
    i = came[i];
  }
  return path.reverse();
}

/** Linha de visada entre centros de tiles, exigindo livres todos os tiles atravessados por um "corredor" estreito. */
export function lineOfSight(g: PassGrid, a: Vec2, b: Vec2): boolean {
  const x0 = a[0] + 0.5;
  const y0 = a[1] + 0.5;
  const x1 = b[0] + 0.5;
  const y1 = b[1] + 0.5;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4));
  const r = 0.3;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (
      !isFree(g, Math.floor(x - r), Math.floor(y - r)) ||
      !isFree(g, Math.floor(x + r), Math.floor(y - r)) ||
      !isFree(g, Math.floor(x - r), Math.floor(y + r)) ||
      !isFree(g, Math.floor(x + r), Math.floor(y + r))
    )
      return false;
  }
  return true;
}

/** Maior custo de célula atravessado pela reta entre dois tiles. */
function lineMaxCost(g: PassGrid, a: Vec2, b: Vec2): number {
  if (!g.cost) return 1;
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3));
  let m = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.floor(a[0] + 0.5 + (b[0] - a[0]) * t);
    const y = Math.floor(a[1] + 0.5 + (b[1] - a[1]) * t);
    m = Math.max(m, g.cost[y * g.width + x]);
  }
  return m;
}

/**
 * Remove pontos intermediários quando há linha de visada (string pulling).
 * Com custos, só encurta se o atalho não passar por células mais caras que o trecho original
 * (assim o pedestre não "corta" pelo meio da via para sair da calçada).
 */
export function smoothPath(g: PassGrid, path: Vec2[]): Vec2[] {
  if (path.length <= 2) return path.slice();
  const out: Vec2[] = [path[0]];
  let anchor = 0;
  let segMax = g.cost ? g.cost[path[0][1] * g.width + path[0][0]] : 1;
  for (let i = 2; i < path.length; i++) {
    if (g.cost) segMax = Math.max(segMax, g.cost[path[i - 1][1] * g.width + path[i - 1][0]], g.cost[path[i][1] * g.width + path[i][0]]);
    if (!lineOfSight(g, path[anchor], path[i]) || lineMaxCost(g, path[anchor], path[i]) > segMax + 1e-6) {
      if (g.cost) segMax = Math.max(g.cost[path[i - 1][1] * g.width + path[i - 1][0]], g.cost[path[i][1] * g.width + path[i][0]]);
      out.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

/** Tile livre mais próximo de um ponto contínuo (busca em anéis). */
export function nearestFree(g: PassGrid, p: Vec2, maxRadius = 12): Vec2 | null {
  const sx = Math.floor(p[0]);
  const sy = Math.floor(p[1]);
  if (isFree(g, sx, sy)) return [sx, sy];
  for (let r = 1; r <= maxRadius; r++) {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isFree(g, sx + dx, sy + dy)) continue;
        const d = Math.hypot(dx, dy);
        if (d < bestD) {
          bestD = d;
          best = [sx + dx, sy + dy];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Rota entre pontos contínuos: A* + suavização, devolvida em centros de tile. */
export function routeBetween(g: PassGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const a = nearestFree(g, from);
  const b = nearestFree(g, to);
  if (!a || !b) return null;
  const raw = findPath(g, a, b);
  if (!raw) return null;
  return smoothPath(g, raw).map(([x, y]) => [x + 0.5, y + 0.5] as Vec2);
}

const ORTHO: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * A* em 4 direções com penalidade por curva: gera trajetos retos com viradas em 90°
 * (usado pelos veículos — caminhos "de rua", sem diagonais). Estado = (tile, direção).
 */
export type StepCost = (x: number, y: number, dir: number) => number;

export function findPathOrtho(g: PassGrid, start: Vec2, goal: Vec2, turnCost = 2, step?: StepCost, startDir?: number): Vec2[] | null {
  const [sx, sy] = start;
  const [gx, gy] = goal;
  if (!isFree(g, sx, sy) || !isFree(g, gx, gy)) return null;
  if (sx === gx && sy === gy) return [[sx, sy]];
  const W = g.width;
  const N = g.width * g.height * 4;
  const gScore = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = new MinHeap();
  const h = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);
  for (let d = 0; d < 4; d++) {
    // com direção inicial conhecida (veículo já andando), não começa dando meia-volta
    if (startDir !== undefined && d !== startDir) continue;
    const s = (sy * W + sx) * 4 + d;
    gScore[s] = 0;
    open.push(s, h(sx, sy));
  }
  let end = -1;
  while (open.size > 0) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const d = cur & 3;
    const cell = cur >> 2;
    const cx = cell % W;
    const cy = (cell - cx) / W;
    if (cx === gx && cy === gy) {
      end = cur;
      break;
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((d + 2) & 3)) continue; // sem meia-volta no mesmo tile
      const nx = cx + ORTHO[nd][0];
      const ny = cy + ORTHO[nd][1];
      if (!isFree(g, nx, ny)) continue;
      const ns = ((ny * W + nx) << 2) | nd;
      const cost = gScore[cur] + (step ? step(nx, ny, nd) : 1) + (nd !== d && came[cur] !== -1 ? turnCost : 0);
      if (cost < gScore[ns]) {
        gScore[ns] = cost;
        came[ns] = cur;
        open.push(ns, cost + h(nx, ny));
      }
    }
  }
  if (end === -1) return null;
  const path: Vec2[] = [];
  for (let s = end; s !== -1; s = came[s]) {
    const cell = s >> 2;
    path.push([cell % W, Math.floor(cell / W)]);
  }
  path.reverse();
  return path;
}

/** Mantém só os pontos de virada (remove pontos colineares). */
export function compressCollinear(path: Vec2[]): Vec2[] {
  if (path.length <= 2) return path.slice();
  const out: Vec2[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const [ax, ay] = out[out.length - 1];
    const [bx, by] = path[i];
    const [cx, cy] = path[i + 1];
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) !== 0) out.push(path[i]);
  }
  out.push(path[path.length - 1]);
  return out;
}

/**
 * Rota de veículo: somente trechos retos e curvas de 90°.
 * Com `vertex = true` devolve coordenadas de vértice (inteiras) em vez de centros de tile.
 */
export function routeOrtho(g: PassGrid, from: Vec2, to: Vec2, step?: StepCost, vertex = false, startDir?: number): Vec2[] | null {
  const a = nearestFree(g, vertex ? [Math.round(from[0]), Math.round(from[1])] : from);
  const b = nearestFree(g, vertex ? [Math.round(to[0]), Math.round(to[1])] : to);
  if (!a || !b) return null;
  const raw = (startDir !== undefined ? findPathOrtho(g, a, b, 2, step, startDir) : null) ?? findPathOrtho(g, a, b, 2, step);
  if (!raw) return null;
  const off = vertex ? 0 : 0.5;
  return compressCollinear(raw).map(([x, y]) => [x + off, y + off] as Vec2);
}
