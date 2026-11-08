import type { Flow, Vec2 } from '../../types/world';
import { routeOrtho } from '../map/pathfinding';
import { laneCost, type WorldModel } from './WorldModel';

export interface FlowLegs {
  /** legs[i] vai do ponto i ao ponto i+1 de [início, ...paradas, fim] — em vértices da grade. */
  legs: Vec2[][];
}

/** Direção (índice de pathfinding.ORTHO: 0=E, 1=S, 2=W, 3=N) do último trecho de uma rota. */
function lastDir(path: Vec2[]): number | undefined {
  for (let i = path.length - 1; i > 0; i--) {
    const dx = path[i][0] - path[i - 1][0];
    const dy = path[i][1] - path[i - 1][1];
    if (dx > 0) return 0;
    if (dy > 0) return 1;
    if (dx < 0) return 2;
    if (dy < 0) return 3;
  }
  return undefined;
}

/**
 * Calcula as rotas de um fluxo sobre a grade de vértices dos veículos, respeitando a mão de direção.
 * `home` = vaga do veículo da frota; null = veículo externo (usa spawn/despawn do fluxo).
 * Cada perna começa na direção em que a anterior terminou (sem "meia-volta" instantânea) e
 * passa pelos pontos `via` da parada de destino (circuitos do pátio).
 */
export function buildFlowLegs(world: WorldModel, flow: Flow, home: Vec2 | null): FlowLegs | null {
  const start = home ?? flow.spawn;
  const end = home ?? flow.despawn;
  if (!start || !end) return null;
  const pts: Vec2[] = [start, ...flow.stops.map((s) => s.at), end];
  const vias: Vec2[][] = [...flow.stops.map((s) => s.via ?? []), flow.returnVia ?? []];
  const cost = laneCost(world);
  const legs: Vec2[][] = [];
  let dir: number | undefined;
  for (let i = 0; i < pts.length - 1; i++) {
    const chain = [pts[i], ...vias[i], pts[i + 1]];
    const leg: Vec2[] = [];
    for (let k = 0; k < chain.length - 1; k++) {
      const r = routeOrtho(world.drive, chain[k], chain[k + 1], cost, true, dir);
      if (!r) return null;
      const part = attachEndpoints(r, chain[k], chain[k + 1]);
      leg.push(...(leg.length ? part.slice(1) : part));
      dir = lastDir(part) ?? dir;
    }
    legs.push(compress(leg));
  }
  return { legs };
}

/** Remove pontos repetidos e colineares (mantém início e fim). */
function compress(p: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const q of p) {
    if (out.length && out[out.length - 1][0] === q[0] && out[out.length - 1][1] === q[1]) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if ((a[0] === b[0] && b[0] === q[0]) || (a[1] === b[1] && b[1] === q[1])) {
        // b é colinear: só remove se não houver inversão de sentido
        if (Math.sign(b[0] - a[0]) === Math.sign(q[0] - b[0]) && Math.sign(b[1] - a[1]) === Math.sign(q[1] - b[1])) out.pop();
      }
    }
    out.push(q);
  }
  return out;
}

/** Liga o ponto exato ao início/fim da rota com um "L" (nunca diagonal). */
function attachEndpoints(r: Vec2[], from: Vec2, to: Vec2): Vec2[] {
  const out: Vec2[] = [[from[0], from[1]]];
  const first = r[0];
  if (from[0] !== first[0] && from[1] !== first[1]) out.push([first[0], from[1]]);
  out.push(...r);
  const last = r[r.length - 1];
  if (to[0] !== last[0] && to[1] !== last[1]) out.push([to[0], last[1]]);
  out.push([to[0], to[1]]);
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
}

/** Polilinha única com todas as pernas (para desenhar o fluxo). */
export function flattenLegs(f: FlowLegs): Vec2[] {
  const out: Vec2[] = [];
  for (const leg of f.legs) for (const p of leg) if (!out.length || out[out.length - 1][0] !== p[0] || out[out.length - 1][1] !== p[1]) out.push(p);
  return out;
}
