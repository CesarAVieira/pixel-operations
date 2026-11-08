import type { Building, FloorKind, LayoutData } from '../../types/world';
import { distToPolyline, pointInPolygon, rectContains } from '../geometry';

/** Tipos de terreno (um por tile). */
export const T = {
  GRASS: 0,
  AVENUE: 1,
  SIDEWALK: 2,
  DIRT: 3,
  YARD: 4,
  ROAD: 5,
  LAWN: 6,
  CONTAINMENT: 7,
  FLOOR: 8,
  WALL: 9,
} as const;
export type TerrainType = (typeof T)[keyof typeof T];

export const TERRAIN_NAMES: Record<TerrainType, string> = {
  0: 'Gramado externo',
  1: 'Avenida',
  2: 'Calçada',
  3: 'Terra',
  4: 'Pátio',
  5: 'Via interna',
  6: 'Área verde',
  7: 'Bacia de contenção',
  8: 'Piso interno',
  9: 'Parede',
};

export const DEFAULT_FLOOR: Record<Building['kind'], FloorKind> = {
  portaria: 'tile',
  escritorio: 'wood',
  fabrica: 'epoxy',
  galpao: 'epoxy',
  manutencao: 'epoxy',
  descanso: 'wood',
  apoio: 'tile',
  deposito: 'concrete',
  laboratorio: 'tile',
  refeitorio: 'tile',
  cobertura: 'concrete',
};

export interface TerrainResult {
  terrain: Uint8Array;
  /** 1 = tile dentro do perímetro da planta. */
  inside: Uint8Array;
  /** Índice do prédio + 1 dono do tile (0 = nenhum). */
  owner: Uint16Array;
  /** Faixa de pedestres (calçada cruzando via): 1 = caminho vertical, 2 = horizontal. */
  crossing: Uint8Array;
}

/** Ponto (contínuo) dentro da planta: polígono do perímetro, ou o retângulo envolvente. */
export function insidePlant(layout: LayoutData, x: number, y: number): boolean {
  return layout.perimeter ? pointInPolygon(x, y, layout.perimeter) : rectContains(layout.boundary, x, y);
}

/** Interior (sem paredes externas) de um prédio. A parede norte tem 2 tiles de altura. */
export function interiorOf(b: Building) {
  const r = b.rect;
  return { x: r.x + 1, y: r.y + 2, w: r.w - 2, h: r.h - 3 };
}

/** Porta na parede norte nesta coluna (a porta ocupa as duas linhas da parede). */
export function isNorthDoor(b: Building, x: number): boolean {
  return b.doors.some(([dx, dy]) => dx === x && dy === b.rect.y);
}

export function isDoorTile(b: Building, x: number, y: number): boolean {
  const r = b.rect;
  if ((y === r.y || y === r.y + 1) && isNorthDoor(b, x)) return true;
  return b.doors.some(([dx, dy]) => dx === x && dy === y);
}

/** Tile de divisória interna (entre salas), exceto vãos. */
export function isPartitionTile(b: Building, x: number, y: number): boolean {
  if (!b.rooms || b.rooms.length === 0) return false;
  const I = interiorOf(b);
  if (!rectContains(I, x + 0.5, y + 0.5)) return false;
  if (b.rooms.some((rm) => rectContains(rm.rect, x + 0.5, y + 0.5))) return false;
  return !(b.innerDoors ?? []).some(([dx, dy]) => dx === x && dy === y);
}

/** Tile de parede externa (perímetro do prédio), exceto portas. */
export function isOuterWallTile(b: Building, x: number, y: number): boolean {
  if (b.kind === 'cobertura') return false;
  const r = b.rect;
  if (!rectContains(r, x + 0.5, y + 0.5)) return false;
  const edge = x === r.x || x === r.x + r.w - 1 || y <= r.y + 1 || y === r.y + r.h - 1;
  return edge && !isDoorTile(b, x, y);
}

export function isWallTile(b: Building, x: number, y: number): boolean {
  if (b.kind === 'cobertura') return false;
  return isOuterWallTile(b, x, y) || isPartitionTile(b, x, y);
}

/** Sala que contém o tile (ou undefined). */
export function roomAt(b: Building, x: number, y: number) {
  return b.rooms?.find((rm) => rectContains(rm.rect, x + 0.5, y + 0.5));
}

/** Rasteriza o layout e os prédios numa grade de tiles. */
export function buildTerrain(layout: LayoutData, buildings: Building[]): TerrainResult {
  const { width: W, height: H } = layout;
  const terrain = new Uint8Array(W * H);
  const inside = new Uint8Array(W * H);
  const owner = new Uint16Array(W * H);
  const crossing = new Uint8Array(W * H);
  const walkways = layout.walkways ?? [];
  const onWalkway = (cx: number, cy: number) => walkways.find((w) => distToPolyline(cx, cy, w.points) < w.width / 2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const i = y * W + x;
      let t: TerrainType = T.GRASS;
      const onRoad = layout.roads.some((r) => distToPolyline(cx, cy, r.points) < r.width / 2);
      if (insidePlant(layout, cx, cy)) {
        inside[i] = 1;
        t = T.YARD;
        if (layout.lawns.some((r) => rectContains(r, cx, cy))) t = T.LAWN;
        if (layout.sidewalks.some((r) => rectContains(r, cx, cy))) t = T.SIDEWALK;
        const ww = onWalkway(cx, cy);
        if (ww) t = T.SIDEWALK;
        if (onRoad) {
          t = T.ROAD;
          if (ww) {
            // direção do trecho do caminho mais próximo
            let best = Infinity;
            let vertical = true;
            for (let k = 0; k < ww.points.length - 1; k++) {
              const d = distToPolyline(cx, cy, [ww.points[k], ww.points[k + 1]]);
              if (d < best) {
                best = d;
                vertical = ww.points[k][0] === ww.points[k + 1][0];
              }
            }
            crossing[i] = vertical ? 1 : 2;
          }
        }
        if (layout.containments.some((c) => rectContains(c.rect, cx, cy))) t = T.CONTAINMENT;
      } else if (layout.median && rectContains(layout.median, cx, cy)) t = T.LAWN;
      else if (rectContains(layout.avenue, cx, cy)) t = T.AVENUE;
      else if (rectContains(layout.gate, cx, cy) && onRoad) t = T.ROAD;
      else if (layout.sidewalks.some((r) => rectContains(r, cx, cy))) t = T.SIDEWALK;
      terrain[i] = t;
    }
  }
  buildings.forEach((b, bi) => {
    const r = b.rect;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        owner[i] = bi + 1;
        crossing[i] = 0;
        if (b.kind === 'cobertura') continue;
        terrain[i] = isWallTile(b, x, y) ? T.WALL : T.FLOOR;
      }
  });
  return { terrain, inside, owner, crossing };
}
