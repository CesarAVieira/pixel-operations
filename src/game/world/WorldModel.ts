import type { Building, Machine, Rect, Vec2, WorldData, Zone } from '../../types/world';
import { rectContains } from '../geometry';
import { ORIGIN, type ScreenPoint } from '../projection';
import type { PassGrid } from '../map/pathfinding';
import { buildTerrain, T } from '../map/terrain';
import { buildInterior, type Prop, type WallItem } from './interiors';

export type ObstacleKind = 'building' | 'machine' | 'tree' | 'prop' | 'hedge';

export interface Obstacle {
  kind: ObstacleKind;
  id: string;
  rect: Rect;
}

/** Bits de direção preferida por vértice (mesma ordem de pathfinding.ORTHO): E, S, W, N. */
export const DIR_BIT = { E: 1, S: 2, W: 4, N: 8 } as const;

/**
 * Modelo lógico do mundo (sem Phaser): terreno, interiores, grade de pedestres (tiles)
 * e grade de veículos (vértices) com preferência de mão de direção. Usado pelo jogo e pelos testes.
 */
export interface WorldModel {
  data: WorldData;
  width: number;
  height: number;
  origin: ScreenPoint;
  terrain: Uint8Array;
  inside: Uint8Array;
  owner: Uint16Array;
  /** Tiles externos vizinhos ao perímetro (alambrado), exceto o portão. */
  fence: Uint8Array;
  /** Faixas de pedestres (1 = caminho vertical, 2 = horizontal). */
  crossing: Uint8Array;
  /** Pedestres: tiles (com custo: preferem calçadas). */
  walk: PassGrid;
  /** Veículos: vértices (largura W+1, altura H+1). */
  drive: PassGrid;
  /** Mão de direção preferida por vértice (bits DIR_BIT). */
  lanes: Uint8Array;
  obstacles: Obstacle[];
  props: Prop[];
  wallItems: WallItem[];
  zoneAt(x: number, y: number): Zone | null;
  buildingAt(x: number, y: number): Building | null;
  building(id: string): Building | undefined;
  machine(id: string): Machine | undefined;
  terrainAt(x: number, y: number): number;
  seats(buildingId: string): Vec2[];
}

export function buildWorld(data: WorldData): WorldModel {
  const { layout } = data;
  const W = layout.width;
  const H = layout.height;
  const { terrain, inside, owner, crossing } = buildTerrain(layout, data.buildings);
  const idx = (x: number, y: number) => y * W + x;
  const inGate = (x: number, y: number) => rectContains(layout.gate, x + 0.5, y + 0.5);

  const fence = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (inside[idx(x, y)] || inGate(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1 && !near; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && inside[idx(nx, ny)]) near = true;
        }
      if (near) fence[idx(x, y)] = 1;
    }

  const props: Prop[] = [];
  const wallItems: WallItem[] = [];
  for (const b of data.buildings) {
    const it = buildInterior(b, data.machines);
    props.push(...it.props);
    wallItems.push(...it.wallItems);
  }

  const obstacles: Obstacle[] = [];
  for (const m of data.machines) if (!m.walkable) obstacles.push({ kind: 'machine', id: m.id, rect: m.rect });
  for (const p of props) if (p.block) obstacles.push({ kind: 'prop', id: p.id, rect: p.rect });
  layout.trees.forEach((t, i) => {
    if (t.kind !== 'bush') obstacles.push({ kind: 'tree', id: `arvore-${i}`, rect: { x: Math.floor(t.at[0]), y: Math.floor(t.at[1]), w: 1, h: 1 } });
  });
  layout.hedges.forEach((r, i) => obstacles.push({ kind: 'hedge', id: `cerca-viva-${i}`, rect: r }));

  const blocked = new Uint8Array(W * H);
  for (const o of obstacles)
    for (let y = o.rect.y; y < o.rect.y + o.rect.h; y++)
      for (let x = o.rect.x; x < o.rect.x + o.rect.w; x++) if (x >= 0 && y >= 0 && x < W && y < H) blocked[idx(x, y)] = 1;

  const wall = new Uint8Array(W * H);
  const basin = new Uint8Array(W * H);
  for (const c of layout.containments) {
    const r = c.rect;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        basin[idx(x, y)] = 1;
        const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
        if (edge && !c.gaps.some(([gx, gy]) => gx === x && gy === y)) wall[idx(x, y)] = 1;
      }
  }

  // tiles de oficina onde caminhões entram (baia + portas da baia)
  const bay = new Uint8Array(W * H);
  for (const b of data.buildings) {
    if (!b.vehicleBay) continue;
    const r = b.vehicleBay;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) bay[idx(x, y)] = 1;
    // portas vizinhas da baia (em qualquer parede) também são rodáveis
    for (const [dx, dy] of b.doors) if (rectContains({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, dx + 0.5, dy + 0.5)) bay[idx(dx, dy)] = 1;
  }

  const walkCells = new Uint8Array(W * H);
  const driveTile = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const t = terrain[i];
      const gate = inGate(x, y);
      const ok = !blocked[i] && !fence[i];
      const walkT = t === T.YARD || t === T.ROAD || t === T.LAWN || t === T.CONTAINMENT || t === T.SIDEWALK || t === T.FLOOR;
      if (ok && !wall[i] && (inside[i] || gate) && (walkT || gate)) walkCells[i] = 1;
      const coberta = owner[i] && data.buildings[owner[i] - 1].kind === 'cobertura';
      const driveT = (inside[i] && (t === T.ROAD || t === T.YARD) && (!owner[i] || coberta)) || t === T.AVENUE || gate || bay[i];
      if (ok && !basin[i] && driveT) driveTile[i] = 1;
    }

  // custo para pedestres: calçadas, pisos e faixas são o caminho preferido; via é o último recurso
  const walkCost = new Float32Array(W * H).fill(1);
  for (let i = 0; i < W * H; i++) {
    const t = terrain[i];
    walkCost[i] =
      t === T.SIDEWALK || t === T.FLOOR ? 1 : crossing[i] ? 1.1 : t === T.CONTAINMENT ? 1.6 : t === T.LAWN ? 2.2 : t === T.YARD ? 1.8 : t === T.ROAD ? 5 : 2;
  }

  // grade de vértices: livre se os 4 tiles ao redor forem rodáveis
  const VW = W + 1;
  const VH = H + 1;
  const driveCells = new Uint8Array(VW * VH);
  const dt = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && driveTile[idx(x, y)] === 1;
  for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) if (dt(i - 1, j - 1) && dt(i, j - 1) && dt(i - 1, j) && dt(i, j)) driveCells[j * VW + i] = 1;

  // mão de direção (direita): via horizontal com centro y=c → vértices y=c+1 vão para E, y=c−1 para W;
  // via vertical com centro x=c → x=c+1 vai para N, x=c−1 para S.
  const lanes = new Uint8Array(VW * VH);
  const lane = (i: number, j: number, bit: number) => {
    if (i >= 0 && j >= 0 && i < VW && j < VH) lanes[j * VW + i] |= bit;
  };
  const av = layout.avenue;
  const roads = layout.median ? layout.roads : [...layout.roads, { id: 'avenida', width: av.h, points: [[av.x, av.y + av.h / 2], [av.x + av.w, av.y + av.h / 2]] as Vec2[] }];
  if (layout.median) {
    // avenida com canteiro: pista norte (acima do canteiro) sentido oeste, pista sul sentido leste; duas faixas cada
    const md = layout.median;
    for (let i = av.x; i <= av.x + av.w; i++) {
      for (let j = av.y + 1; j < md.y; j++) lane(i, j, DIR_BIT.W);
      for (let j = md.y + md.h + 1; j < av.y + av.h; j++) lane(i, j, DIR_BIT.E);
    }
  }
  for (const r of roads)
    for (let k = 0; k < r.points.length - 1; k++) {
      const [ax, ay] = r.points[k];
      const [bx, by] = r.points[k + 1];
      if (ay === by) for (let i = Math.min(ax, bx); i <= Math.max(ax, bx); i++) {
        lane(i, ay + 1, DIR_BIT.E);
        lane(i, ay - 1, DIR_BIT.W);
      }
      else if (ax === bx) for (let j = Math.min(ay, by); j <= Math.max(ay, by); j++) {
        lane(ax + 1, j, DIR_BIT.N);
        lane(ax - 1, j, DIR_BIT.S);
      }
    }

  const buildingMap = new Map(data.buildings.map((b) => [b.id, b]));
  const machineMap = new Map(data.machines.map((m) => [m.id, m]));
  const seatMap = new Map<string, Vec2[]>();
  for (const p of props) if (p.seat) seatMap.set(p.buildingId, [...(seatMap.get(p.buildingId) ?? []), p.seat]);

  return {
    data,
    width: W,
    height: H,
    origin: ORIGIN,
    terrain,
    inside,
    owner,
    fence,
    crossing,
    walk: { width: W, height: H, cells: walkCells, cost: walkCost },
    drive: { width: VW, height: VH, cells: driveCells },
    lanes,
    obstacles,
    props,
    wallItems,
    zoneAt(x, y) {
      return data.zones.find((z) => z.rects.some((r) => rectContains(r, x, y))) ?? null;
    },
    buildingAt(x, y) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) return null;
      const o = owner[idx(ix, iy)];
      return o ? data.buildings[o - 1] : null;
    },
    building: (id) => buildingMap.get(id),
    machine: (id) => machineMap.get(id),
    terrainAt(x, y) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) return T.GRASS;
      return terrain[idx(ix, iy)];
    },
    seats: (id) => seatMap.get(id) ?? [],
  };
}

/** Ponto de trabalho de uma máquina (tile livre ao lado). */
export function machineWorkSpot(m: Machine): Vec2 {
  return m.workSpot ?? [m.rect.x - 1, m.rect.y + Math.floor(m.rect.h / 2)];
}

/** Custo de passo para veículos: respeita a mão de direção. */
export function laneCost(world: WorldModel): (x: number, y: number, dir: number) => number {
  const VW = world.width + 1;
  return (x, y, dir) => {
    const m = world.lanes[y * VW + x];
    if (!m) return 3; // fora das vias (pátio): só para manobrar até vagas e baias
    const bit = 1 << dir;
    if (m & bit) return 1;
    const opposite = 1 << ((dir + 2) & 3);
    if (m & opposite) return 8; // contramão
    return 1.6; // atravessando a via
  };
}
