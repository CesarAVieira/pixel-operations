/**
 * Projeção ortogonal "de cima 3/4" (v0.3): 1 tile = 16 px, eixos alinhados à tela.
 * Ruas e paredes ficam retas; volumes mostram topo + face frontal (como em RPGs clássicos).
 * Substitui a projeção isométrica da v0.2 (ver ADR-014).
 */
export const TILE = 16;

export interface ScreenPoint {
  x: number;
  y: number;
}

export const ORIGIN: ScreenPoint = { x: 0, y: 0 };

/** Mantida por compatibilidade com os sistemas: a origem é sempre (0,0). */
export function isoOrigin(): ScreenPoint {
  return ORIGIN;
}

export function gridToScreen(gx: number, gy: number, o: ScreenPoint = ORIGIN): ScreenPoint {
  return { x: o.x + gx * TILE, y: o.y + gy * TILE };
}

export function screenToGrid(sx: number, sy: number, o: ScreenPoint = ORIGIN): { x: number; y: number } {
  return { x: (sx - o.x) / TILE, y: (sy - o.y) / TILE };
}

export function worldPixelSize(w: number, h: number): { width: number; height: number } {
  return { width: w * TILE, height: h * TILE };
}
