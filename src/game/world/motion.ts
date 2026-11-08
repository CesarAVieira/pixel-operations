/**
 * Movimento de veículos (puro, testável): curvas arredondadas e perfil de velocidade
 * (acelera, freia antes das curvas e das paradas, para atrás do veículo da frente).
 */
import type { Vec2 } from '../../types/world';

/**
 * Troca cada quina de 90° por um arco de raio `radius` (limitado à metade dos trechos vizinhos).
 * Início e fim do caminho são preservados exatamente.
 */
export function roundCorners(path: Vec2[], radius = 1.2, samples = 6): Vec2[] {
  if (path.length < 3) return path.map((p) => [p[0], p[1]] as Vec2);
  const out: Vec2[] = [[path[0][0], path[0][1]]];
  for (let i = 1; i < path.length - 1; i++) {
    const [ax, ay] = path[i - 1];
    const [px, py] = path[i];
    const [bx, by] = path[i + 1];
    const l1 = Math.hypot(px - ax, py - ay);
    const l2 = Math.hypot(bx - px, by - py);
    const u1: Vec2 = l1 ? [(px - ax) / l1, (py - ay) / l1] : [0, 0];
    const u2: Vec2 = l2 ? [(bx - px) / l2, (by - py) / l2] : [0, 0];
    const dot = u1[0] * u2[0] + u1[1] * u2[1];
    if (dot > 0.99 || dot < -0.99 || !l1 || !l2) {
      out.push([px, py]);
      continue;
    }
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const s: Vec2 = [px - u1[0] * r, py - u1[1] * r];
    const e: Vec2 = [px + u2[0] * r, py + u2[1] * r];
    // curva de Bézier quadrática (s → quina → e): aproxima um quarto de círculo
    for (let k = 0; k <= samples; k++) {
      const t = k / samples;
      const x = (1 - t) * (1 - t) * s[0] + 2 * (1 - t) * t * px + t * t * e[0];
      const y = (1 - t) * (1 - t) * s[1] + 2 * (1 - t) * t * py + t * t * e[1];
      out.push([x, y]);
    }
  }
  const last = path[path.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

/** Comprimento restante do caminho a partir da posição (x,y) até o fim. */
export function remaining(x: number, y: number, path: Vec2[]): number {
  if (!path.length) return 0;
  let d = Math.hypot(path[0][0] - x, path[0][1] - y);
  for (let i = 0; i < path.length - 1; i++) d += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return d;
}

/**
 * Distância até o início da próxima curva (mudança de direção > ~20°) e o sentido dela
 * (+1 = direita, −1 = esquerda, na tela com y para baixo). Infinity se não houver curva.
 */
export function nextTurn(x: number, y: number, path: Vec2[]): { dist: number; side: number } {
  let px = x;
  let py = y;
  let d = 0;
  let prev: Vec2 | null = null;
  for (const [qx, qy] of path) {
    const sx = qx - px;
    const sy = qy - py;
    const l = Math.hypot(sx, sy);
    if (l > 1e-6) {
      const u: Vec2 = [sx / l, sy / l];
      if (prev) {
        const dot = prev[0] * u[0] + prev[1] * u[1];
        if (dot < 0.94) return { dist: d, side: Math.sign(prev[0] * u[1] - prev[1] * u[0]) || 1 };
      }
      prev = u;
      d += l;
    }
    px = qx;
    py = qy;
  }
  return { dist: Infinity, side: 0 };
}

export interface SpeedParams {
  vmax: number;
  /** Velocidade nas curvas. */
  vturn: number;
  accel: number;
  decel: number;
}

/**
 * Velocidade-alvo: a maior que ainda permite frear até a curva, até o fim do trecho e até o
 * veículo da frente (`gap` = folga em tiles, ou null se a pista estiver livre).
 */
export function targetSpeed(p: SpeedParams, distTurn: number, distEnd: number, gap: number | null): number {
  let t = p.vmax;
  if (Number.isFinite(distTurn)) t = Math.min(t, Math.sqrt(p.vturn * p.vturn + 2 * p.decel * distTurn));
  t = Math.min(t, Math.max(0.35, Math.sqrt(2 * p.decel * Math.max(0, distEnd))));
  if (gap !== null) t = Math.min(t, Math.sqrt(2 * p.decel * Math.max(0, gap)));
  return t;
}

/** Aproxima a velocidade atual do alvo com aceleração/frenagem limitadas. */
export function approach(v: number, target: number, p: SpeedParams, dt: number): number {
  if (target > v) return Math.min(target, v + p.accel * dt);
  return Math.max(target, v - p.decel * 1.4 * dt);
}
