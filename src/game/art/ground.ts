/**
 * Pintura do chão inteiro (puro): terreno com texturas contínuas em coordenadas de mundo,
 * marcações viárias, pisos internos, paredes em corte, itens de parede, bacias, alambrado.
 * O resultado é um único PixelBuf (vira uma textura estática no Phaser).
 */
import type { Building, FloorKind, Rect, RoomKind } from '../../types/world';
import { rectContains } from '../geometry';
import { DEFAULT_FLOOR, interiorOf, isDoorTile, isNorthDoor, isOuterWallTile, isPartitionTile, roomAt, T } from '../map/terrain';
import { TILE } from '../projection';
import type { WorldModel } from '../world/WorldModel';
import type { WallItem } from '../world/interiors';
import { MAT, mix, parseColor, ramp, rgba, shade } from './core/color';
import { hash3, noise, PixelBuf } from './core/pixbuf';

const S = TILE;
type RGB = [number, number, number];
const rgb = (c: string): RGB => {
  const [r, g, b] = parseColor(c);
  return [r, g, b];
};
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dim = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];

export const WALL_STYLE: Record<Building['kind'], { face: string; pattern: 'plain' | 'stripes' | 'tiles' | 'brick' | 'panel' }> = {
  portaria: { face: '#e9e4d8', pattern: 'plain' },
  escritorio: { face: '#e6dcc8', pattern: 'panel' },
  fabrica: { face: '#a9b3bb', pattern: 'stripes' },
  galpao: { face: '#c3c8cc', pattern: 'stripes' },
  manutencao: { face: '#d4d7d9', pattern: 'stripes' },
  descanso: { face: '#c7dde8', pattern: 'tiles' },
  apoio: { face: '#d9cfbd', pattern: 'tiles' },
  deposito: { face: '#b4805f', pattern: 'brick' },
  laboratorio: { face: '#e4ecef', pattern: 'tiles' },
  refeitorio: { face: '#eadfca', pattern: 'tiles' },
  cobertura: { face: '#cccccc', pattern: 'plain' },
};

/** Piso por tipo de sala (quando o prédio tem salas). */
const ROOM_FLOOR: Partial<Record<RoomKind, FloorKind>> = {
  escritorio: 'wood',
  diretoria: 'carpet',
  reuniao: 'carpet',
  recepcao: 'tile',
  refeitorio: 'tile',
  cozinha: 'tile',
  vestiario: 'tile',
  ti: 'epoxy',
  laboratorio: 'tile',
  almoxarifado: 'concrete',
  oficina: 'epoxy',
  descanso: 'wood',
};
const CAP = '#3b4152';

export function paintGround(world: WorldModel): PixelBuf {
  const { width: W, height: H, data } = world;
  const buf = new PixelBuf(W * S, H * S);
  const roadInfo = classifyRoads(world);

  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const t = world.terrain[ty * W + tx];
      const x0 = tx * S;
      const y0 = ty * S;
      switch (t) {
        case T.GRASS:
          // fora da planta: mato mais escuro; colado na cerca, faixa de cascalho (o contorno do terreno fica legível)
          if (world.fence[ty * W + tx]) paintConcrete(buf, x0, y0, '#9b9282', 5);
          else paintWild(buf, x0, y0);
          break;
        case T.LAWN:
          paintGrass(buf, x0, y0, true);
          break;
        case T.AVENUE:
        case T.ROAD:
          paintAsphalt(buf, x0, y0);
          break;
        case T.SIDEWALK:
          paintPavers(buf, x0, y0);
          break;
        case T.YARD:
          paintConcrete(buf, x0, y0, '#aaa79f', 4);
          break;
        case T.CONTAINMENT:
          paintConcrete(buf, x0, y0, '#9d9a91', 2);
          break;
        case T.DIRT:
          paintConcrete(buf, x0, y0, '#a9785a', 8);
          break;
        default:
          break; // pisos e paredes depois
      }
    }

  // calçadas: meio-fio junto ao asfalto
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      if (world.terrain[ty * W + tx] !== T.SIDEWALK) continue;
      const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? world.terrain[y * W + x] : -1);
      const isRoad = (v: number) => v === T.ROAD || v === T.AVENUE;
      if (isRoad(at(tx, ty + 1))) for (let x = 0; x < S; x++) (buf.put(tx * S + x, ty * S + 14, 150, 145, 136), buf.put(tx * S + x, ty * S + 15, 110, 108, 104));
      if (isRoad(at(tx, ty - 1))) for (let x = 0; x < S; x++) (buf.put(tx * S + x, ty * S, 196, 190, 180), buf.put(tx * S + x, ty * S + 1, 150, 145, 136));
      if (isRoad(at(tx + 1, ty))) for (let y = 0; y < S; y++) buf.put(tx * S + 15, ty * S + y, 120, 117, 112);
      if (isRoad(at(tx - 1, ty))) for (let y = 0; y < S; y++) buf.put(tx * S, ty * S + y, 150, 145, 136);
    }

  paintRoadMarkings(buf, world, roadInfo);
  paintParking(buf, world);
  paintWear(buf, world);
  for (const c of data.layout.crosswalks) paintCrosswalk(buf, c);
  // faixas de pedestres onde as calçadas internas cruzam as vias
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const k = world.crossing[ty * W + tx];
      if (k) paintCrosswalk(buf, { x: tx, y: ty, w: 1, h: 1 }, k === 1);
    }
  for (const c of data.layout.containments) paintContainment(buf, c.rect, c.gaps);

  data.buildings.forEach((b) => {
    if (b.kind === 'cobertura') return paintCanopyPad(buf, b);
    paintFloors(buf, b);
  });
  paintSafetyLines(buf, world);
  paintProcessPipes(buf, world);
  for (const p of world.props) if (p.type === 'rug') paintRug(buf, p.rect, p.variant);
  for (const p of world.props) if (p.type === 'liftbay') paintLiftBay(buf, p.rect);
  data.buildings.forEach((b) => {
    if (b.kind === 'cobertura') return;
    paintWalls(buf, b);
    for (const it of world.wallItems) if (it.buildingId === b.id) paintWallItem(buf, b, it);
  });
  paintFence(buf, world);
  return buf;
}

/* ------------------------------------------------------------------ terrenos */

const GRASS_A = rgb('#5c9a3f');
const GRASS_B = rgb('#4e8a38');
const GRASS_C = rgb('#6aa94a');
const LAWN_A = rgb('#62a443');
const LAWN_B = rgb('#55953c');

const WILD_A = rgb('#3f7a35');
const WILD_B = rgb('#335f2c');
const WILD_C = rgb('#58863c');

/** Vegetação externa (terreno vizinho): mais escura e irregular que o gramado da planta. */
function paintWild(b: PixelBuf, x0: number, y0: number) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const wx = x0 + x;
      const wy = y0 + y;
      const n = noise(wx, wy, 18, 41) * 0.6 + noise(wx, wy, 5, 43) * 0.4;
      let c = lerp3(WILD_B, WILD_A, n);
      const h = hash3(wx, wy, 44);
      if (h < 0.08) c = dim(c, 0.8);
      else if (h > 0.94) c = lerp3(c, WILD_C, 0.8);
      b.put(wx, wy, c[0], c[1], c[2]);
    }
  if (hash3(x0, y0, 45) < 0.35) {
    const x = x0 + 3 + Math.floor(hash3(x0, y0, 46) * 10);
    const y = y0 + 4 + Math.floor(hash3(x0, y0, 47) * 9);
    const d = dim(WILD_B, 0.75);
    for (let k = 0; k < 4; k++) b.put(x + k - 1, y - (k % 2), d[0], d[1], d[2]);
  }
}

function paintGrass(b: PixelBuf, x0: number, y0: number, lawn: boolean) {
  const A = lawn ? LAWN_A : GRASS_A;
  const B = lawn ? LAWN_B : GRASS_B;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const wx = x0 + x;
      const wy = y0 + y;
      const n = noise(wx, wy, 24, 3) * 0.7 + noise(wx, wy, 7, 9) * 0.3;
      let c = lerp3(B, A, n);
      const h = hash3(wx, wy, 1);
      if (h < 0.05) c = dim(c, 0.86);
      else if (h > 0.955) c = lerp3(c, GRASS_C, 0.8);
      b.put(wx, wy, c[0], c[1], c[2]);
    }
  // tufos e flores
  for (let k = 0; k < 3; k++) {
    const h = hash3(x0, y0, 10 + k);
    const x = x0 + 2 + Math.floor(hash3(x0, y0, 20 + k) * 12);
    const y = y0 + 3 + Math.floor(hash3(x0, y0, 30 + k) * 11);
    if (h < 0.55) {
      const d = dim(lawn ? LAWN_B : GRASS_B, 0.82);
      b.put(x, y, d[0], d[1], d[2]);
      b.put(x - 1, y + 1, d[0], d[1], d[2]);
      b.put(x + 1, y + 1, d[0], d[1], d[2]);
      const l = lerp3(GRASS_C, [230, 240, 160], 0.25);
      b.put(x, y - 1, l[0], l[1], l[2]);
    } else if (h < (lawn ? 0.66 : 0.6)) {
      const fl: RGB[] = [[250, 246, 230], [246, 214, 90], [238, 150, 170], [180, 170, 240]];
      const c = fl[Math.floor(hash3(x, y, 5) * fl.length)];
      b.put(x, y, c[0], c[1], c[2]);
      b.put(x + 1, y, c[0], c[1], c[2]);
      b.put(x, y + 1, 200, 160, 60);
    }
  }
}

function paintAsphalt(b: PixelBuf, x0: number, y0: number) {
  const A = rgb('#4b4f58');
  const B = rgb('#41454d');
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const wx = x0 + x;
      const wy = y0 + y;
      const n = noise(wx, wy, 18, 5);
      let c = lerp3(B, A, n);
      const h = hash3(wx, wy, 2);
      if (h < 0.06) c = dim(c, 0.85);
      else if (h > 0.95) c = lerp3(c, [120, 124, 132], 0.5);
      b.put(wx, wy, c[0], c[1], c[2]);
    }
  if (hash3(x0, y0, 77) < 0.03) {
    // mancha de óleo
    for (let y = 4; y < 11; y++) for (let x = 3; x < 13; x++) if ((x - 8) ** 2 / 25 + (y - 7.5) ** 2 / 9 < 1) b.set(x0 + x, y0 + y, 'rgba(20,22,30,0.1)');
  }
}

function paintPavers(b: PixelBuf, x0: number, y0: number) {
  // pedra portuguesa / bloquete: tijolos 8x4 desencontrados
  const base = rgb('#cbc4b6');
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const wx = x0 + x;
      const wy = y0 + y;
      const row = Math.floor(wy / 4);
      const off = (row % 2) * 4;
      const jx = (wx + off) % 8 === 0;
      const jy = wy % 4 === 0;
      const brick = Math.floor((wx + off) / 8) * 31 + row;
      let c = dim(base, 0.95 + hash3(brick, row, 4) * 0.08);
      if (jx || jy) c = dim(base, 0.82);
      else if ((wy % 4 === 1 && (wx + off) % 8 !== 7) || hash3(wx, wy, 6) > 0.97) c = lerp3(c, [235, 230, 220], 0.35);
      b.put(wx, wy, c[0], c[1], c[2]);
    }
}

function paintConcrete(b: PixelBuf, x0: number, y0: number, color: string, joint: number) {
  const base = rgb(color);
  const jp = joint * S;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const wx = x0 + x;
      const wy = y0 + y;
      const n = noise(wx, wy, 30, 11) * 0.6 + noise(wx, wy, 6, 13) * 0.4;
      let c = dim(base, 0.93 + n * 0.1);
      const h = hash3(wx, wy, 3);
      if (h < 0.04) c = dim(c, 0.9);
      else if (h > 0.97) c = lerp3(c, [235, 232, 222], 0.4);
      if (wx % jp === 0 || wy % jp === 0) c = dim(base, 0.8);
      else if (wx % jp === 1 || wy % jp === 1) c = lerp3(c, [240, 236, 228], 0.25);
      b.put(wx, wy, c[0], c[1], c[2]);
    }
  if (hash3(x0, y0, 91) < 0.025) for (let y = 3; y < 12; y++) for (let x = 2; x < 14; x++) if ((x - 8) ** 2 / 30 + (y - 7.5) ** 2 / 14 < 1) b.set(x0 + x, y0 + y, 'rgba(60,52,40,0.06)');
}

/* ------------------------------------------------------------------ vias */

interface RoadInfo {
  /** quantas vias cobrem o tile (2+ = cruzamento) */
  cover: Uint8Array;
}

function inRoad(r: { points: [number, number][]; width: number }, cx: number, cy: number): boolean {
  for (let k = 0; k < r.points.length - 1; k++) {
    const [ax, ay] = r.points[k];
    const [bx, by] = r.points[k + 1];
    const hw = r.width / 2;
    if (ay === by && cx >= Math.min(ax, bx) - hw && cx <= Math.max(ax, bx) + hw && Math.abs(cy - ay) < hw) return true;
    if (ax === bx && cy >= Math.min(ay, by) - hw && cy <= Math.max(ay, by) + hw && Math.abs(cx - ax) < hw) return true;
  }
  return false;
}

function classifyRoads(world: WorldModel): RoadInfo {
  const { width: W, height: H, data } = world;
  const cover = new Uint8Array(W * H);
  for (const r of data.layout.roads)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inRoad(r, x + 0.5, y + 0.5)) cover[y * W + x]++;
  return { cover };
}

function paintRoadMarkings(b: PixelBuf, world: WorldModel, info: RoadInfo) {
  const { width: W, data } = world;
  const yellow = '#e6b52c';
  const white = '#e8e6e0';
  const crossing = (px: number, py: number) => info.cover[Math.floor(py / S) * W + Math.floor(px / S)] > 1;
  for (const r of data.layout.roads)
    for (let k = 0; k < r.points.length - 1; k++) {
      const [ax, ay] = r.points[k];
      const [bx, by] = r.points[k + 1];
      if (ay === by) {
        const y = ay * S;
        for (let x = Math.min(ax, bx) * S; x < Math.max(ax, bx) * S; x++) {
          if (crossing(x, y)) continue;
          if (Math.floor(x / 6) % 2 === 0) (b.set(x, y - 1, yellow), b.set(x, y, shade(yellow, -0.15)));
          const ey0 = (ay - r.width / 2) * S + 1;
          const ey1 = (ay + r.width / 2) * S - 2;
          if (!crossing(x, ey0 + 2)) b.set(x, ey0, rgba(white, 0.55));
          if (!crossing(x, ey1 - 2)) b.set(x, ey1, rgba(white, 0.55));
        }
      } else if (ax === bx) {
        const x = ax * S;
        for (let y = Math.min(ay, by) * S; y < Math.max(ay, by) * S; y++) {
          if (crossing(x, y)) continue;
          if (Math.floor(y / 6) % 2 === 0) (b.set(x - 1, y, yellow), b.set(x, y, shade(yellow, -0.15)));
          const ex0 = (ax - r.width / 2) * S + 1;
          const ex1 = (ax + r.width / 2) * S - 2;
          if (!crossing(ex0 + 2, y)) b.set(ex0, y, rgba(white, 0.55));
          if (!crossing(ex1 - 2, y)) b.set(ex1, y, rgba(white, 0.55));
        }
      }
    }
  // avenida: faixa dupla amarela central + bordas brancas
  const av = data.layout.avenue;
  const cy = (av.y + av.h / 2) * S;
  const md = data.layout.median;
  if (md) {
    // duas pistas de mão única: bordas brancas contínuas e divisória de faixas tracejada
    const carriages = [
      { y0: av.y, y1: md.y },
      { y0: md.y + md.h, y1: av.y + av.h },
    ];
    for (const c of carriages)
      for (let x = av.x * S; x < (av.x + av.w) * S; x++) {
        b.set(x, c.y0 * S + 2, rgba(white, 0.8));
        b.set(x, c.y1 * S - 3, rgba(white, 0.8));
        if (Math.floor(x / 10) % 2 === 0) b.set(x, Math.round(((c.y0 + c.y1) / 2) * S), rgba(white, 0.75));
      }
    // meio-fio do canteiro
    for (let x = md.x * S; x < (md.x + md.w) * S; x++) {
      b.set(x, md.y * S, '#d8d4ca');
      b.set(x, md.y * S + 1, '#b9b4a8');
      b.set(x, (md.y + md.h) * S - 2, '#8f8a80');
      b.set(x, (md.y + md.h) * S - 1, '#6e6a62');
    }
  }
  for (let x = av.x * S; x < (av.x + av.w) * S && !md; x++) {
    b.set(x, cy - 2, yellow);
    b.set(x, cy + 1, yellow);
    b.set(x, av.y * S + 2, rgba(white, 0.8));
    b.set(x, (av.y + av.h) * S - 3, rgba(white, 0.8));
    // faixas de rolamento tracejadas
    if (Math.floor(x / 10) % 2 === 0) {
      b.set(x, (av.y + av.h * 0.25) * S, rgba(white, 0.7));
      b.set(x, (av.y + av.h * 0.75) * S, rgba(white, 0.7));
    }
  }
  // setas de sentido nas vias internas (a cada ~12 tiles)
  for (const r of data.layout.roads)
    for (let k = 0; k < r.points.length - 1; k++) {
      const [ax, ay] = r.points[k];
      const [bx, by] = r.points[k + 1];
      const len = Math.abs(bx - ax) + Math.abs(by - ay);
      for (let d = 6; d < len - 4; d += 12) {
        if (ay === by) {
          const x = (Math.min(ax, bx) + d) * S;
          if (crossing(x, ay * S + 8) || crossing(x + 16, ay * S + 8)) continue;
          arrow(b, x, ay * S + S, 'E');
          arrow(b, x + 8, ay * S - S, 'W');
        } else {
          const y = (Math.min(ay, by) + d) * S;
          if (crossing(ax * S + 8, y) || crossing(ax * S + 8, y + 16)) continue;
          arrow(b, ax * S + S, y + 8, 'N');
          arrow(b, ax * S - S, y, 'S');
        }
      }
    }
}

function arrow(b: PixelBuf, cx: number, cy: number, dir: 'E' | 'W' | 'N' | 'S') {
  const c = 'rgba(232,230,224,0.55)';
  for (let i = -4; i <= 4; i++) {
    if (dir === 'E' || dir === 'W') b.set(cx + i, cy, c);
    else b.set(cx, cy + i, c);
  }
  for (let i = 1; i <= 3; i++) {
    if (dir === 'E') (b.set(cx + 4 - i, cy - i, c), b.set(cx + 4 - i, cy + i, c));
    if (dir === 'W') (b.set(cx - 4 + i, cy - i, c), b.set(cx - 4 + i, cy + i, c));
    if (dir === 'N') (b.set(cx - i, cy - 4 + i, c), b.set(cx + i, cy - 4 + i, c));
    if (dir === 'S') (b.set(cx - i, cy + 4 - i, c), b.set(cx + i, cy + 4 - i, c));
  }
}

function paintCrosswalk(b: PixelBuf, r: Rect, verticalWalk?: boolean) {
  const vertical = verticalWalk ?? r.h > r.w; // faixa atravessa a via na direção do maior lado
  for (let y = r.y * S; y < (r.y + r.h) * S; y++)
    for (let x = r.x * S; x < (r.x + r.w) * S; x++) {
      const stripe = vertical ? Math.floor((y - r.y * S) / 4) % 2 === 0 : Math.floor((x - r.x * S) / 4) % 2 === 0;
      const edge = verticalWalk !== undefined ? false : vertical ? x - r.x * S < 2 || (r.x + r.w) * S - x <= 2 : y - r.y * S < 2 || (r.y + r.h) * S - y <= 2;
      if (stripe && !edge) b.set(x, y, 'rgba(236,234,228,0.85)');
    }
}

function paintParking(b: PixelBuf, world: WorldModel) {
  for (const pk of world.data.layout.parking) {
    const r = pk.rect;
    const c = 'rgba(240,238,230,0.7)';
    if (pk.axis === 'x') {
      // veículos deitados (E/W): linhas horizontais entre vagas
      for (let y = r.y; y <= r.y + r.h; y += pk.pitch) for (let x = r.x * S; x < (r.x + r.w) * S; x++) b.set(x, y * S, c);
    } else for (let x = r.x; x <= r.x + r.w; x += pk.pitch) for (let y = r.y * S; y < (r.y + r.h) * S; y++) b.set(x * S, y, c);
  }
}

/* ------------------------------------------------------------------ bacias de contenção */

function paintContainment(b: PixelBuf, r: Rect, gaps: [number, number][]) {
  const top = ramp('#c3c0b6', 0.07);
  for (let ty = r.y; ty < r.y + r.h; ty++)
    for (let tx = r.x; tx < r.x + r.w; tx++) {
      const edge = tx === r.x || ty === r.y || tx === r.x + r.w - 1 || ty === r.y + r.h - 1;
      if (!edge || gaps.some(([gx, gy]) => gx === tx && gy === ty)) continue;
      const x0 = tx * S;
      const y0 = ty * S;
      // mureta: topo 8 px + face frontal 5 px (vista 3/4)
      b.rect(x0, y0 + 2, S, 8, top.lt);
      b.hline(x0, x0 + S - 1, y0 + 2, top.hi);
      b.rect(x0, y0 + 10, S, 5, top.dk);
      b.hline(x0, x0 + S - 1, y0 + 15, top.dd);
      if (tx % 2 === 0) b.vline(x0, y0 + 3, y0 + 14, top.base);
    }
  // escadinhas nas passagens
  for (const [gx, gy] of gaps) {
    for (let i = 0; i < 4; i++) b.rect(gx * S + 2, gy * S + 3 + i * 3, 12, 2, i % 2 ? '#8f8c84' : '#b5b2a8');
  }
}

/* ------------------------------------------------------------------ pisos internos */

function paintFloors(b: PixelBuf, bd: Building) {
  const base: FloorKind = bd.floor ?? DEFAULT_FLOOR[bd.kind];
  const r = bd.rect;
  for (let ty = r.y; ty < r.y + r.h; ty++)
    for (let tx = r.x; tx < r.x + r.w; tx++) {
      const rm = roomAt(bd, tx, ty);
      const kind: FloorKind = (rm && ROOM_FLOOR[rm.kind]) || base;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const wx = tx * S + x;
          const wy = ty * S + y;
          const c = floorPixel(kind, wx, wy);
          b.put(wx, wy, c[0], c[1], c[2]);
        }
    }
}

function floorPixel(kind: FloorKind, wx: number, wy: number): RGB {
  switch (kind) {
    case 'wood': {
      const plank = Math.floor(wy / 5);
      const off = (plank * 23) % 40;
      const seam = (wx + off) % 40 === 0 || wy % 5 === 0;
      const tone = hash3(Math.floor((wx + off) / 40), plank, 7);
      const base = lerp3(rgb('#c48f5b'), rgb('#d9a874'), tone);
      if (seam) return dim(base, 0.78);
      const grain = noise(wx * 0.4, wy * 3, 4, plank) > 0.72;
      return grain ? dim(base, 0.93) : wy % 5 === 1 ? lerp3(base, [240, 210, 170], 0.2) : base;
    }
    case 'tile': {
      const cx = Math.floor(wx / 8);
      const cy = Math.floor(wy / 8);
      const light = (cx + cy) % 2 === 0;
      const base = light ? rgb('#efe9dd') : rgb('#d3d9de');
      if (wx % 8 === 7 || wy % 8 === 7) return dim(base, 0.88);
      if (wx % 8 === 0 || wy % 8 === 0) return lerp3(base, [255, 255, 255], 0.3);
      return hash3(wx, wy, 8) > 0.97 ? dim(base, 0.95) : base;
    }
    case 'epoxy': {
      const n = noise(wx, wy, 40, 21) * 0.5 + noise(wx, wy, 8, 22) * 0.5;
      const base = lerp3(rgb('#8f9a95'), rgb('#9fa9a3'), n);
      if (wx % 64 === 0 || wy % 64 === 0) return dim(base, 0.86);
      return hash3(wx, wy, 9) > 0.985 ? lerp3(base, [220, 225, 222], 0.5) : base;
    }
    case 'carpet': {
      const odd = (Math.floor(wx / 16) + Math.floor(wy / 16)) % 2;
      const base = odd ? rgb('#5c6f8f') : rgb('#566986');
      return (wx + wy * (odd ? 1 : -1)) % 4 === 0 ? dim(base, 0.94) : base;
    }
    default: {
      const n = noise(wx, wy, 20, 31);
      const base = lerp3(rgb('#a7a49c'), rgb('#b4b1a8'), n);
      return wx % 48 === 0 || wy % 48 === 0 ? dim(base, 0.85) : base;
    }
  }
}

function paintCanopyPad(b: PixelBuf, bd: Building) {
  // piso de concreto do posto + borda amarela
  const r = bd.rect;
  for (let y = r.y * S; y < (r.y + r.h) * S; y++)
    for (let x = r.x * S; x < (r.x + r.w) * S; x++) {
      const c = floorPixel('concrete', x, y);
      b.put(x, y, c[0], c[1], c[2]);
      const ex = x - r.x * S;
      const ey = y - r.y * S;
      if (ex < 2 || ey < 2 || (r.x + r.w) * S - x <= 2 || (r.y + r.h) * S - y <= 2) b.set(x, y, Math.floor((ex + ey) / 6) % 2 ? '#e6b52c' : '#2b2b2b');
    }
}

function paintSafetyLines(b: PixelBuf, world: WorldModel) {
  // faixas amarelas ao redor de máquinas internas (área de segurança)
  for (const m of world.data.machines) {
    const bd = world.buildingAt(m.rect.x, m.rect.y);
    if (!bd || bd.kind === 'cobertura') continue;
    const r = { x: m.rect.x * S - 5, y: m.rect.y * S - 5, w: m.rect.w * S + 10, h: m.rect.h * S + 10 };
    for (let x = r.x; x < r.x + r.w; x++) {
      const c = Math.floor(x / 4) % 2 ? '#e3b22a' : '#2d2d2d';
      b.set(x, r.y, c);
      b.set(x, r.y + 1, c);
      b.set(x, r.y + r.h - 1, c);
      b.set(x, r.y + r.h - 2, c);
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      const c = Math.floor(y / 4) % 2 ? '#e3b22a' : '#2d2d2d';
      b.set(r.x, y, c);
      b.set(r.x + 1, y, c);
      b.set(r.x + r.w - 1, y, c);
      b.set(r.x + r.w - 2, y, c);
    }
  }
  // corredores de pedestres pintados nas fábricas (linhas verdes)
  for (const bd of world.data.buildings) {
    if (bd.kind !== 'fabrica' && bd.kind !== 'galpao') continue;
    const I = interiorOf(bd);
    const y = (I.y + I.h - 3) * S + 8;
    for (let x = (I.x + 1) * S; x < (I.x + I.w - 1) * S; x++) if (Math.floor(x / 8) % 2 === 0) b.set(x, y, 'rgba(90,190,120,0.8)');
  }
}

/** Linhas de processo no piso das fábricas: coletor horizontal + descidas de cada equipamento. */
function paintProcessPipes(b: PixelBuf, world: WorldModel) {
  const pipeH = (x0: number, x1: number, y: number) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      b.set(x, y - 1, '#3b4152');
      b.set(x, y, '#9aa3ad');
      b.set(x, y + 1, '#d5dbe0');
      b.set(x, y + 2, '#5d6470');
      if ((x - x0) % 24 === 0) for (let k = -2; k <= 3; k++) b.set(x, y + k, '#6b7480');
    }
  };
  const pipeV = (x: number, y0: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      b.set(x - 1, y, '#3b4152');
      b.set(x, y, '#d5dbe0');
      b.set(x + 1, y, '#9aa3ad');
      b.set(x + 2, y, '#5d6470');
    }
  };
  for (const bd of world.data.buildings) {
    if (bd.kind !== 'fabrica') continue;
    const ms = world.data.machines.filter((m) => m.rect.x >= bd.rect.x && m.rect.x < bd.rect.x + bd.rect.w && m.rect.y >= bd.rect.y && m.rect.y < bd.rect.y + bd.rect.h);
    const vessels = ms.filter((m) => m.kind === 'reator' || m.kind === 'misturador');
    if (!vessels.length) continue;
    const headerY = Math.max(...vessels.map((m) => m.rect.y + m.rect.h)) * S + 22;
    const cxs = ms.map((m) => (m.rect.x + m.rect.w / 2) * S);
    pipeH(Math.min(...cxs), Math.max(...cxs), headerY);
    for (const m of ms) {
      const cx = Math.round((m.rect.x + m.rect.w / 2) * S) + 4;
      const edge = (m.rect.y + m.rect.h) * S + 6;
      if (m.rect.y * S > headerY) pipeV(cx, m.rect.y * S - 6, headerY);
      else pipeV(cx, edge, headerY);
    }
  }
}

function paintRug(b: PixelBuf, r: Rect, v: number) {
  const colors = ['#4a6aa6', '#9c4a45', '#4f8a6c'];
  const c = ramp(colors[v % colors.length], 0.12);
  const x0 = r.x * S + 3;
  const y0 = r.y * S + 3;
  const w = r.w * S - 6;
  const h = r.h * S - 6;
  b.rect(x0, y0, w, h, c.base);
  b.rect(x0 + 3, y0 + 3, w - 6, h - 6, c.lt);
  b.rect(x0 + 6, y0 + 6, w - 12, h - 12, c.base);
  b.hline(x0, x0 + w - 1, y0 + h - 1, c.dk);
  for (let x = x0; x < x0 + w; x += 2) (b.set(x, y0 - 1, c.hi), b.set(x, y0 + h, c.hi));
}

function paintLiftBay(b: PixelBuf, r: Rect) {
  const x0 = r.x * S;
  const y0 = r.y * S;
  const w = r.w * S;
  const h = r.h * S;
  for (let x = x0; x < x0 + w; x++)
    for (const y of [y0, y0 + 1, y0 + h - 2, y0 + h - 1]) b.set(x, y, Math.floor((x + y) / 5) % 2 ? '#e3b22a' : '#2d2d2d');
  for (let y = y0; y < y0 + h; y++)
    for (const x of [x0, x0 + 1, x0 + w - 2, x0 + w - 1]) b.set(x, y, Math.floor((x + y) / 5) % 2 ? '#e3b22a' : '#2d2d2d');
  // valas/rampas de elevador a cada 7 tiles
  for (let bx = x0 + 3 * S; bx + 2 * S < x0 + w; bx += 7 * S) {
    b.rect(bx - 6, y0 + 10, 4, h - 20, 'rgba(30,32,40,0.45)');
    b.rect(bx + 18, y0 + 10, 4, h - 20, 'rgba(30,32,40,0.45)');
  }
}

/* ------------------------------------------------------------------ paredes em corte */

function wallFace(style: (typeof WALL_STYLE)[Building['kind']], wx: number, y: number, h: number): string {
  const base = style.face;
  const t = y / h;
  let c = shade(base, 0.03 - t * 0.06);
  switch (style.pattern) {
    case 'stripes':
      if (wx % 4 === 0) c = shade(base, -0.08);
      else if (wx % 4 === 1) c = shade(base, 0.05);
      break;
    case 'tiles':
      if (y > h * 0.45 && (y % 5 === 0 || (wx + (Math.floor(y / 5) % 2) * 3) % 6 === 0)) c = shade(base, -0.07);
      break;
    case 'brick': {
      const row = Math.floor(y / 4);
      if (y % 4 === 0 || (wx + (row % 2) * 4) % 8 === 0) c = shade(base, -0.2);
      else c = shade(base, (hash3(Math.floor((wx + (row % 2) * 4) / 8), row, 2) - 0.5) * 0.12);
      break;
    }
    case 'panel':
      if (y > h * 0.55) c = y === Math.ceil(h * 0.55) + 1 ? shade('#8a6446', 0.2) : (wx % 6 === 0 ? shade('#8a6446', -0.1) : '#8a6446');
      break;
  }
  return c;
}

function paintWalls(b: PixelBuf, bd: Building) {
  const r = bd.rect;
  const style = WALL_STYLE[bd.kind];
  const capR = ramp(mix(CAP, style.face, 0.12), 0.1);
  const X0 = r.x * S;
  const X1 = (r.x + r.w) * S;
  const Y0 = r.y * S;
  // parede norte (2 tiles): tampa 5 px, face, rodapé 3 px
  const faceH = 2 * S - 5 - 3;
  for (let x = X0; x < X1; x++) {
    const col = Math.floor(x / S);
    for (let y = 0; y < 5; y++) b.set(x, Y0 + y, y === 0 ? capR.dk : y === 4 ? capR.dd : capR.base);
    if (isNorthDoor(bd, col)) {
      // vão de porta na parede do fundo: verga em cima, batentes nas pontas, sombra de passagem
      for (let y = 0; y < 6; y++) b.set(x, Y0 + 5 + y, `rgba(20,24,40,${0.4 - y * 0.06})`);
      const lx = x - col * S;
      if ((lx < 2 && !isNorthDoor(bd, col - 1)) || (lx >= S - 2 && !isNorthDoor(bd, col + 1))) for (let y = 0; y < faceH + 3; y++) b.set(x, Y0 + 5 + y, lx % 2 ? capR.dd : capR.dk);
      continue;
    }
    for (let y = 0; y < faceH; y++) b.set(x, Y0 + 5 + y, wallFace(style, x, y, faceH));
    b.set(x, Y0 + 5, 'rgba(20,24,40,0.35)'); // sombra sob a tampa
    for (let y = 0; y < 3; y++) b.set(x, Y0 + 5 + faceH + y, shade(style.face, -0.3 - y * 0.06));
  }
  paintPartitions(b, bd, style, capR, faceH);
  // paredes laterais (tampa de 5 px no lado externo) e sul (tampa + face curta)
  for (let ty = r.y; ty < r.y + r.h; ty++)
    for (let tx = r.x; tx < r.x + r.w; tx++) {
      const wall = isOuterWallTile(bd, tx, ty);
      const door = isDoorTile(bd, tx, ty);
      const x0 = tx * S;
      const y0 = ty * S;
      if (ty >= r.y + 2 && (tx === r.x || tx === r.x + r.w - 1) && ty < r.y + r.h - 1) {
        if (!wall) continue;
        const left = tx === r.x;
        const cx0 = left ? x0 : x0 + S - 6;
        b.rect(cx0, y0, 6, S, capR.base);
        b.vline(left ? cx0 + 5 : cx0, y0, y0 + S - 1, capR.lt);
        b.vline(left ? cx0 : cx0 + 5, y0, y0 + S - 1, capR.dd);
        // sombra projetada da parede no piso
        for (let y = 0; y < S; y++) for (let k = 0; k < 3; k++) b.set(left ? cx0 + 6 + k : cx0 - 1 - k, y0 + y, `rgba(20,24,40,${0.18 - k * 0.05})`);
      }
      if (ty === r.y + r.h - 1) {
        if (door) {
          // soleira
          b.rect(x0, y0 + 9, S, 2, '#7d776c');
          b.rect(x0, y0 + 11, S, 1, '#5a554c');
          continue;
        }
        if (!wall) continue;
        b.rect(x0, y0 + 6, S, 5, capR.base);
        b.hline(x0, x0 + S - 1, y0 + 6, capR.lt);
        for (let y = 0; y < 5; y++) for (let x = 0; x < S; x++) b.set(x0 + x, y0 + 11 + y, wallFace(style, x0 + x, y + 12, faceH + 6));
        b.hline(x0, x0 + S - 1, y0 + 15, shade(style.face, -0.35));
        if (tx === r.x) b.rect(x0, y0, 6, 6, capR.base);
        if (tx === r.x + r.w - 1) b.rect(x0 + S - 6, y0, 6, 6, capR.base);
      }
    }
  // portas laterais: batente
  for (const [dx, dy] of bd.doors) {
    if (dy === r.y + r.h - 1) {
      b.rect(dx * S - 1, dy * S + 6, 2, 10, capR.dk);
      b.rect(dx * S + S - 1, dy * S + 6, 2, 10, capR.dk);
    }
  }
}

/**
 * Divisórias internas entre salas: trecho horizontal = tampa + face curta (vista 3/4);
 * trecho vertical = tampa estreita com sombra no piso.
 */
function paintPartitions(b: PixelBuf, bd: Building, style: (typeof WALL_STYLE)[Building['kind']], capR: ReturnType<typeof ramp>, faceH: number) {
  if (!bd.rooms?.length) return;
  const I = interiorOf(bd);
  const solid = (x: number, y: number) => isPartitionTile(bd, x, y) || isOuterWallTile(bd, x, y);
  for (let ty = I.y; ty < I.y + I.h; ty++)
    for (let tx = I.x; tx < I.x + I.w; tx++) {
      const x0 = tx * S;
      const y0 = ty * S;
      if (!isPartitionTile(bd, tx, ty)) {
        // soleira nos vãos internos
        if ((bd.innerDoors ?? []).some(([dx, dy]) => dx === tx && dy === ty)) {
          const vertical = solid(tx, ty - 1) && solid(tx, ty + 1);
          if (vertical) b.rect(x0 + 6, y0, 4, S, 'rgba(90,84,74,0.35)');
          else b.rect(x0, y0 + 6, S, 4, 'rgba(90,84,74,0.35)');
        }
        continue;
      }
      const up = solid(tx, ty - 1);
      const down = solid(tx, ty + 1);
      const horiz = solid(tx - 1, ty) || solid(tx + 1, ty);
      if (horiz && !(up && down)) {
        // trecho horizontal (com face voltada para o sul)
        b.rect(x0, y0, S, 5, capR.base);
        b.hline(x0, x0 + S - 1, y0, capR.lt);
        b.hline(x0, x0 + S - 1, y0 + 4, capR.dd);
        for (let y = 0; y < 10; y++) for (let x = 0; x < S; x++) b.set(x0 + x, y0 + 5 + y, wallFace(style, x0 + x, y + faceH - 10, faceH));
        b.hline(x0, x0 + S - 1, y0 + 15, shade(style.face, -0.35));
        if (up) b.rect(x0 + 5, y0, 6, 5, capR.base);
      } else {
        // trecho vertical
        b.rect(x0 + 5, y0, 6, S, capR.base);
        b.vline(x0 + 5, y0, y0 + S - 1, capR.lt);
        b.vline(x0 + 10, y0, y0 + S - 1, capR.dd);
        for (let y = 0; y < S; y++) for (let k = 0; k < 3; k++) b.set(x0 + 11 + k, y0 + y, `rgba(20,24,40,${0.16 - k * 0.05})`);
        if (!down) {
          // ponta com face curta
          for (let y = 0; y < 4; y++) for (let x = 5; x < 11; x++) b.set(x0 + x, y0 + 12 + y, wallFace(style, x0 + x, faceH - 4 + y, faceH));
        }
      }
    }
}

function paintWallItem(b: PixelBuf, bd: Building, it: WallItem) {
  const x0 = it.x * S;
  const top = bd.rect.y * S + 5;
  const w = it.w * S;
  switch (it.type) {
    case 'window': {
      const wx = x0 + 3;
      const ww = w - 6;
      b.rect(wx - 1, top + 3, ww + 2, 17, '#5f6573');
      b.rect(wx, top + 4, ww, 15, '#9fd0ea');
      for (let i = 0; i < 15; i++) b.set(wx + 2 + i, top + 4 + 14 - i, 'rgba(255,255,255,0.35)');
      b.rect(wx, top + 4, ww, 4, '#bfe2f2');
      b.vline(wx + Math.floor(ww / 2), top + 4, top + 18, '#5f6573');
      b.hline(wx - 1, wx + ww, top + 20, '#d9d6cf');
      break;
    }
    case 'clock':
      b.ellipse(x0 + 8, top + 9, 5, 5, '#3a3f4a');
      b.ellipse(x0 + 8, top + 9, 4, 4, '#f5f3ee');
      b.vline(x0 + 8, top + 6, top + 9, '#222');
      b.hline(x0 + 8, x0 + 10, top + 9, '#222');
      break;
    case 'board':
      b.rect(x0 + 2, top + 4, w - 4, 15, '#8a8f99');
      b.rect(x0 + 3, top + 5, w - 6, 13, '#f7f7f4');
      for (let i = 0; i < 4; i++) b.hline(x0 + 6, x0 + 6 + 8 + ((i * 7) % 14), top + 8 + i * 3, ['#3f74c8', '#c8463b', '#2f8f5b', '#333'][i]);
      b.rect(x0 + 4, top + 19, w - 8, 1, '#6b707a');
      break;
    case 'toolwall': {
      b.rect(x0 + 1, top + 3, w - 2, 18, '#b98e5e');
      for (let y = top + 5; y < top + 20; y += 3) for (let x = x0 + 3; x < x0 + w - 2; x += 3) b.set(x, y, '#8a6644');
      const tools = ['#c8463b', '#3f74c8', '#9aa3ad', '#e8b928'];
      for (let i = 0; i * 9 + 6 < w; i++) {
        const tx = x0 + 5 + i * 9;
        b.rect(tx, top + 6, 2, 9, '#5a5f68');
        b.rect(tx - 1, top + 6, 4, 3, tools[i % tools.length]);
      }
      break;
    }
    case 'shelfwall':
      b.rect(x0 + 1, top + 8, w - 2, 2, '#7b553b');
      for (let x = x0 + 3; x < x0 + w - 3; x += 3) b.rect(x, top + 2, 2, 6, ['#c8463b', '#3f74c8', '#e8b928', '#4f9a52'][(x >> 2) % 4]);
      break;
    case 'tv':
      b.rect(x0 + 1, top + 3, w - 2, 15, '#1f232c');
      b.rect(x0 + 2, top + 4, w - 4, 12, '#2e4f7a');
      b.rect(x0 + 3, top + 5, 8, 3, 'rgba(255,255,255,0.15)');
      break;
    case 'sign': {
      b.rect(x0 + 1, top + 4, w - 2, 12, '#20242e');
      b.rect(x0 + 2, top + 5, w - 4, 10, '#f2b632');
      // "CBB" em pixel
      const glyph: Record<string, string[]> = {
        C: ['111', '100', '100', '100', '111'],
        B: ['110', '101', '110', '101', '110'],
      };
      let gx = x0 + Math.floor(w / 2) - 6;
      for (const ch of 'CBB') {
        glyph[ch].forEach((row, yy) => [...row].forEach((v, xx) => v === '1' && b.set(gx + xx, top + 7 + yy, '#20242e')));
        gx += 4;
      }
      break;
    }
    case 'poster':
      b.rect(x0 + 4, top + 4, 8, 11, '#f5f3ee');
      b.rect(x0 + 5, top + 5, 6, 5, '#4f9a52');
      break;
  }
}

/* ------------------------------------------------------------------ alambrado */

function paintFence(b: PixelBuf, world: WorldModel) {
  const { boundary: bnd, gate } = world.data.layout;
  const post = MAT.steelDark;
  const wire = 'rgba(200,206,212,0.55)';
  const inGate = (x: number, y: number) => rectContains({ x: gate.x - 0.2, y: gate.y - 1, w: gate.w + 0.4, h: gate.h + 2 }, x / S, y / S);
  const poly: [number, number][] = world.data.layout.perimeter ?? [
    [bnd.x, bnd.y],
    [bnd.x + bnd.w, bnd.y],
    [bnd.x + bnd.w, bnd.y + bnd.h],
    [bnd.x, bnd.y + bnd.h],
  ];
  const X0 = bnd.x * S - 2;
  const Y0 = bnd.y * S - 2;
  const hseg = (y: number, xa: number, xb: number) => {
    for (let x = xa; x <= xb; x++) {
      if (inGate(x, y)) continue;
      // tela em losango (vista de cima): 10 px de altura acima da base
      for (let k = 0; k < 10; k++) if ((x + k) % 4 === 0 || (x - k + 400) % 4 === 0) b.set(x, y - k, wire);
      b.set(x, y - 10, 'rgba(160,166,174,0.9)');
      b.set(x, y, 'rgba(110,116,124,0.8)');
      if ((x - X0) % 32 === 0) {
        b.rect(x, y - 12, 2, 13, post.base);
        b.vline(x, y - 12, y, post.lt);
      }
    }
  };
  const vseg = (x: number, ya: number, yb: number) => {
    for (let y = ya; y <= yb; y++) {
      if (inGate(x, y)) continue;
      b.set(x, y, 'rgba(120,126,134,0.95)');
      b.set(x + 1, y, 'rgba(180,186,192,0.7)');
      if ((y - Y0) % 32 === 0) {
        b.rect(x - 1, y - 8, 3, 9, post.base);
        b.vline(x - 1, y - 8, y, post.lt);
      }
    }
  };
  // trecho diagonal: tela inclinada com 10 px de altura, mourões a cada ~30 px de comprimento
  const dseg = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(len * 2);
    let lastPost = -999;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(ax + (bx - ax) * t);
      const y = Math.round(ay + (by - ay) * t);
      if (inGate(x, y)) continue;
      // mureta de base + tela inclinada + mourões
      b.set(x - 1, y + 1, 'rgba(70,74,82,0.5)');
      for (let k = 0; k < 10; k++) if ((y - k + x * 2) % 4 === 0 || (y + k + 400 - x * 2) % 4 === 0) b.set(x, y - k, wire);
      b.set(x, y - 10, 'rgba(150,156,164,0.95)');
      b.set(x, y, '#6e747c');
      b.set(x + 1, y, '#9aa0a8');
      b.set(x + 2, y, 'rgba(60,64,72,0.35)');
      const d = t * len;
      if (d - lastPost >= 24) {
        lastPost = d;
        b.rect(x, y - 12, 2, 13, post.base);
        b.vline(x, y - 12, y, post.lt);
        b.set(x + 2, y, 'rgba(20,24,40,0.35)');
      }
    }
  };
  // lados do polígono: horizontais com tela "de pé", verticais vistos de cima, diagonais inclinados
  const cxp = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cyp = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    if (ay === by) hseg(ay < cyp ? ay * S : ay * S + 1, Math.min(ax, bx) * S - 2, Math.max(ax, bx) * S + 1);
    else if (ax === bx) vseg(ax < cxp ? ax * S - 2 : ax * S + 1, Math.min(ay, by) * S - 2, Math.max(ay, by) * S + 1);
    else dseg(ax * S - 2, ay * S, bx * S - 2, by * S);
  }
  // cancela do portão
  const gx = gate.x * S;
  const gy = (bnd.y + bnd.h) * S;
  b.rect(gx - 4, gy - 10, 4, 12, '#2b2f3a');
  b.rect(gx - 3, gy - 9, 2, 10, '#e8b928');
  // o braço da cancela é um sprite animado (VehicleSystem)
}


/* ------------------------------------------------------------------ desgaste do pátio (foto de satélite) */

/** Mancha irregular (várias elipses translúcidas), determinística pela posição. */
function stain(b: PixelBuf, cx: number, cy: number, r: number, color: string, seed: number) {
  for (let k = 0; k < 7; k++) {
    const a = hash3(cx, cy, seed + k) * Math.PI * 2;
    const d = hash3(cx, cy, seed + 20 + k) * r;
    const rr = r * (0.35 + hash3(cx, cy, seed + 40 + k) * 0.5);
    const x0 = cx + Math.cos(a) * d;
    const y0 = cy + Math.sin(a) * d * 0.6;
    for (let y = Math.floor(y0 - rr); y <= y0 + rr; y++)
      for (let x = Math.floor(x0 - rr * 1.4); x <= x0 + rr * 1.4; x++) {
        const q = ((x - x0) / (rr * 1.4)) ** 2 + ((y - y0) / rr) ** 2;
        if (q < 1 && hash3(x, y, seed) > q * 0.6) b.set(x, y, color);
      }
  }
}

function paintWear(b: PixelBuf, world: WorldModel) {
  const { data, width: W, height: H } = world;
  const S = TILE;
  const isRoad = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < W && ty < H && (world.terrain[ty * W + tx] === T.ROAD || world.terrain[ty * W + tx] === T.AVENUE);
  // remendos de asfalto e manchas leves espalhadas pelas vias
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      if (!isRoad(tx, ty) || world.crossing[ty * W + tx]) continue;
      const h = hash3(tx, ty, 501);
      if (h < 0.012 && isRoad(tx + 1, ty) && isRoad(tx, ty + 1)) {
        const w = 10 + Math.floor(hash3(tx, ty, 502) * 14);
        const hh = 6 + Math.floor(hash3(tx, ty, 503) * 8);
        b.rect(tx * S + 2, ty * S + 3, w, hh, 'rgba(22,24,30,0.22)');
        b.hline(tx * S + 2, tx * S + 1 + w, ty * S + 3, 'rgba(255,255,255,0.06)');
      } else if (h > 0.985) stain(b, tx * S + 8, ty * S + 8, 6, 'rgba(20,20,24,0.10)', 510);
    }
  // trincas no concreto do pátio
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      if (world.terrain[ty * W + tx] !== T.YARD || hash3(tx, ty, 520) > 0.02) continue;
      let x = tx * S + 4;
      let y = ty * S + 4;
      for (let k = 0; k < 18; k++) {
        b.set(x, y, 'rgba(60,56,50,0.35)');
        x += hash3(tx, k, 521) < 0.6 ? 1 : 0;
        y += hash3(ty, k, 522) < 0.5 ? 1 : hash3(ty, k, 523) < 0.3 ? -1 : 0;
      }
    }
  // tampas de bueiro (a cada ~16 tiles no eixo) e grelhas de drenagem junto ao meio-fio
  for (const r of data.layout.roads)
    for (let k = 0; k < r.points.length - 1; k++) {
      const [ax, ay] = r.points[k];
      const [bx, by] = r.points[k + 1];
      const len = Math.abs(bx - ax) + Math.abs(by - ay);
      for (let d = 5; d < len - 2; d += 16) {
        const x = (ax === bx ? ax : Math.min(ax, bx) + d) * S + (ax === bx ? 8 : 0);
        const y = (ay === by ? ay : Math.min(ay, by) + d) * S + (ay === by ? 8 : 0);
        if (world.crossing[Math.floor(y / S) * W + Math.floor(x / S)]) continue;
        b.ellipse(x, y, 5, 4, '#2c2f36');
        b.ellipse(x, y, 4, 3, '#4a4e57');
        b.hline(x - 3, x + 3, y, '#3a3e46');
        b.vline(x, y - 2, y + 2, '#3a3e46');
        b.set(x - 2, y - 2, '#6b707a');
        // grela no meio-fio
        const gx = ay === by ? x + 40 : (ax - r.width / 2) * S + 2;
        const gy = ay === by ? (ay + r.width / 2) * S - 5 : y + 40;
        b.rect(gx, gy, ay === by ? 8 : 3, ay === by ? 3 : 8, '#2a2d34');
        for (let i = 1; i < 8; i += 2) b.set(ay === by ? gx + i : gx + 1, ay === by ? gy + 1 : gy + i, '#5d626c');
      }
    }
  // plataformas de carregamento e diesel: área zebrada e manchas de produto no ponto de parada
  for (const f of data.flows)
    for (const st of f.stops) {
      const [sx, sy] = st.at;
      const px = sx * S;
      const py = sy * S;
      if (st.state === 'CARREGANDO' || st.state === 'DESCARREGANDO') {
        const vertical = isRoad(sx - 1, sy - 3) && isRoad(sx - 1, sy + 3) && !(isRoad(sx - 4, sy - 1) && isRoad(sx + 4, sy - 1));
        const rw = vertical ? 26 : 84;
        const rh = vertical ? 84 : 26;
        const x0 = px - rw / 2;
        const y0 = py - rh / 2;
        if (st.state === 'CARREGANDO') {
          for (let y = y0; y < y0 + rh; y++)
            for (let x = x0; x < x0 + rw; x++) {
              const edge = x < x0 + 2 || x >= x0 + rw - 2 || y < y0 + 2 || y >= y0 + rh - 2;
              if (edge) b.set(x, y, 'rgba(230,181,44,0.75)');
              else if ((x + y) % 10 < 2) b.set(x, y, 'rgba(230,181,44,0.22)');
            }
        }
        for (let k = 0; k < 4; k++) stain(b, px + (vertical ? 0 : (k - 1.5) * 16), py + (vertical ? (k - 1.5) * 16 : 0), 9, 'rgba(32,22,14,0.30)', 600 + k);
      }
      if (st.state === 'ABASTECENDO') for (let k = 0; k < 3; k++) stain(b, px + (k - 1) * 18, py, 7, 'rgba(24,24,30,0.28)', 650 + k);
      if (st.state === 'PESAGEM') stain(b, px, py, 10, 'rgba(24,24,30,0.12)', 670);
    }
  // pingos de óleo sob as vagas da frota e dos carros
  for (const v of data.vehicles) {
    if (!v.parked) continue;
    const [x, y] = v.parked;
    stain(b, x * S + (v.kind === 'carro' ? 0 : -10), y * S + 2, v.kind === 'carro' ? 4 : 8, 'rgba(20,18,16,0.22)', 700 + Math.round(x * 7 + y));
  }
  // lombada na entrada, logo após o portão
  const g = data.layout.gate;
  const ly = (data.layout.boundary.y + data.layout.boundary.h - 4) * S;
  for (let x = g.x * S; x < (g.x + g.w) * S; x++) {
    const c = Math.floor((x - g.x * S) / 6) % 2 ? '#e8b928' : '#2b2b2b';
    b.set(x, ly, shade(c, 0.15));
    b.set(x, ly + 1, c);
    b.set(x, ly + 2, c);
    b.set(x, ly + 3, shade(c, -0.25));
  }
}
