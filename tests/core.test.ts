import { describe, expect, it } from 'vitest';
import { gridToScreen, screenToGrid, TILE } from '../src/game/projection';
import { compressCollinear, findPath, findPathOrtho, lineOfSight, nearestFree, smoothPath, type PassGrid } from '../src/game/map/pathfinding';
import { actorDepth, staticDepth } from '../src/game/depth';
import { darknessAt } from '../src/game/systems/daylight';
import { buildInterior } from '../src/game/world/interiors';
import type { Building } from '../src/types/world';
import { pointAlong, pointInPolygon } from '../src/game/geometry';

function grid(rows: string[]): PassGrid {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  rows.forEach((r, y) => [...r].forEach((c, x) => (cells[y * width + x] = c === '#' ? 0 : 1)));
  return { width, height, cells };
}

describe('projeção (vista de cima 3/4)', () => {
  it('gridToScreen e screenToGrid são inversas', () => {
    for (const [x, y] of [[0, 0], [10.5, 3.25], [99, 55]]) {
      const s = gridToScreen(x, y);
      const g = screenToGrid(s.x, s.y);
      expect(g.x).toBeCloseTo(x, 6);
      expect(g.y).toBeCloseTo(y, 6);
    }
  });
  it('regressão sessão 3: eixos alinhados à tela (nada "torto")', () => {
    expect(gridToScreen(1, 0)).toEqual({ x: TILE, y: 0 });
    expect(gridToScreen(0, 1)).toEqual({ x: 0, y: TILE });
  });
});

describe('pathfinding', () => {
  const g = grid([
    '.....',
    '.###.',
    '.#...',
    '.#.#.',
    '.....',
  ]);
  it('encontra caminho contornando paredes', () => {
    const p = findPath(g, [0, 0], [2, 2]);
    expect(p).not.toBeNull();
    expect(p![0]).toEqual([0, 0]);
    expect(p![p!.length - 1]).toEqual([2, 2]);
    for (const [x, y] of p!) expect(g.cells[y * 5 + x]).toBe(1);
  });
  it('não corta quinas na diagonal', () => {
    const c = grid(['.#', '#.']);
    expect(findPath(c, [0, 0], [1, 1])).toBeNull();
  });
  it('retorna null para destino bloqueado', () => {
    expect(findPath(g, [0, 0], [1, 1])).toBeNull();
  });
  it('suavização mantém linha de visada entre pontos consecutivos', () => {
    const p = findPath(g, [0, 4], [4, 0])!;
    const s = smoothPath(g, p);
    expect(s.length).toBeLessThanOrEqual(p.length);
    for (let i = 0; i < s.length - 1; i++) expect(lineOfSight(g, s[i], s[i + 1])).toBe(true);
  });
  it('A* ortogonal: só passos de 1 tile em x ou y, e prefere menos curvas', () => {
    const open = grid(['......', '......', '......', '......']);
    const p = findPathOrtho(open, [0, 0], [5, 3])!;
    for (let i = 1; i < p.length; i++) expect(Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1])).toBe(1);
    expect(compressCollinear(p).length).toBe(3); // um único "L"
    expect(findPathOrtho(g, [0, 0], [2, 2])).not.toBeNull();
  });
  it('nearestFree acha tile livre vizinho', () => {
    expect(nearestFree(g, [1.5, 1.5])).not.toBeNull();
  });
});

describe('profundidade', () => {
  it('quem está mais ao sul fica na frente (ordenação por y)', () => {
    expect(actorDepth(10.5)).toBeGreaterThan(staticDepth({ x: 0, y: 5, w: 4, h: 5 }));
    expect(actorDepth(9.5)).toBeLessThan(staticDepth({ x: 0, y: 5, w: 4, h: 5 }));
  });
});

describe('iluminação', () => {
  it('dia claro, noite escura, transições suaves', () => {
    expect(darknessAt(12)).toBe(0);
    expect(darknessAt(23)).toBe(1);
    expect(darknessAt(3)).toBe(1);
    const dusk = darknessAt(18);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
  });
});

describe('interiores', () => {
  const b: Building = { id: 'esc', name: 'Esc', kind: 'escritorio', zoneId: null, rect: { x: 0, y: 0, w: 14, h: 15 }, doors: [[6, 14]], origin: 'demonstrativo', description: '' };
  it('escritório recebe mesas com assentos, sem bloquear a porta', () => {
    const it2 = buildInterior(b, []);
    const desks = it2.props.filter((p) => p.type === 'desk');
    expect(desks.length).toBeGreaterThanOrEqual(6);
    for (const d of desks) expect(d.seat).toBeDefined();
    for (const p of it2.props.filter((pp) => pp.block)) {
      const r = p.rect;
      const covers = (x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      expect(covers(6, 13) || covers(6, 12), p.id).toBe(false);
    }
  });
  it('é determinístico', () => {
    expect(JSON.stringify(buildInterior(b, []))).toBe(JSON.stringify(buildInterior(b, [])));
  });
});

describe('geometria', () => {
  it('pointInPolygon', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });
  it('pointAlong percorre polilinha', () => {
    const r = pointAlong([[0, 0], [10, 0], [10, 10]], 15);
    expect(r.p[0]).toBeCloseTo(10);
    expect(r.p[1]).toBeCloseTo(5);
  });
});
