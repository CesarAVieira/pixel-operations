import type { Rect } from '../types/world';

/**
 * Ordenação de profundidade na vista de cima 3/4: tudo é ordenado pela linha da base (y).
 * Quem está mais ao sul (mais embaixo na tela) é desenhado na frente.
 * Paredes e pisos fazem parte do chão; só objetos com volume entram na ordenação.
 */
export const DEPTH_SCALE = 10;
export const LAYER = {
  ground: -100000,
  flat: -50000,
  /** Passarelas de tubos e coberturas: acima de pessoas e veículos. */
  overhead: 20000,
  lighting: 100000,
  labels: 200000,
  overlay: 500000,
  ui: 900000,
} as const;

/** Profundidade de um objeto estático: base do footprint. */
export function staticDepth(rect: Rect): number {
  return (rect.y + rect.h) * DEPTH_SCALE - 0.5;
}

/** Profundidade de um ator (pés em y). */
export function actorDepth(y: number): number {
  return y * DEPTH_SCALE;
}
