/**
 * Integridade dos dados do mapa (regressão): qualquer edição nos JSON que quebre
 * colisão, acesso, interiores ou rotas falha aqui.
 */
import { describe, expect, it } from 'vitest';
import { loadWorldData } from '../src/data';
import { buildWorld, machineWorkSpot } from '../src/game/world/WorldModel';
import { findPath, isFree, nearestFree, routeBetween } from '../src/game/map/pathfinding';
import { rectContains, rectsOverlap } from '../src/game/geometry';
import { interiorOf, T } from '../src/game/map/terrain';
import type { Vec2 } from '../src/types/world';

const data = loadWorldData();
const world = buildWorld(data);
const tile = (p: Vec2): Vec2 => [Math.floor(p[0]), Math.floor(p[1])];
const ENTRY: Vec2 = [57.5, 140.5]; // calçada central, entre as fábricas e os tanques

describe('dados do mundo', () => {
  it('ids únicos em cada coleção', () => {
    for (const list of [data.zones, data.buildings, data.machines, data.employees, data.vehicles, data.flows]) {
      const ids = list.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('referências entre coleções existem', () => {
    const zoneIds = new Set(data.zones.map((z) => z.id));
    for (const b of data.buildings) if (b.zoneId) expect(zoneIds.has(b.zoneId), b.id).toBe(true);
    for (const m of data.machines) expect(zoneIds.has(m.zoneId), m.id).toBe(true);
    const flowIds = new Set(data.flows.map((f) => f.id));
    for (const v of data.vehicles) if (v.flowId) expect(flowIds.has(v.flowId), v.id).toBe(true);
    for (const e of data.employees)
      for (const t of e.tasks) {
        if (t.type === 'work') expect(world.machine(t.machineId), `${e.id}→${t.machineId}`).toBeDefined();
        if (t.type === 'enter') expect(world.building(t.buildingId), `${e.id}→${t.buildingId}`).toBeDefined();
      }
  });

  it('prédios e máquinas ficam dentro do perímetro', () => {
    for (const it of [...data.buildings, ...data.machines]) {
      const r = it.rect;
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) expect(world.inside[y * world.width + x], `${it.id} @${x},${y}`).toBe(1);
    }
  });

  it('prédios não se sobrepõem entre si', () => {
    const bs = data.buildings;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(rectsOverlap(bs[i].rect, bs[j].rect), `${bs[i].id} x ${bs[j].id}`).toBe(false);
  });

  it('obstáculos não se sobrepõem', () => {
    const obs = world.obstacles;
    for (let i = 0; i < obs.length; i++)
      for (let j = i + 1; j < obs.length; j++) expect(rectsOverlap(obs[i].rect, obs[j].rect), `${obs[i].id} x ${obs[j].id}`).toBe(false);
  });

  it('portas ficam no perímetro dos prédios e são caminháveis (norte: as duas linhas da parede)', () => {
    for (const b of data.buildings)
      for (const [x, y] of b.doors) {
        const r = b.rect;
        const north = y === r.y && x > r.x && x < r.x + r.w - 1;
        const onEdge = north || y === r.y + r.h - 1 || ((x === r.x || x === r.x + r.w - 1) && y >= r.y + 2);
        if (north) expect(isFree(world.walk, x, y + 1), `${b.id} porta norte (2ª linha)`).toBe(true);
        expect(onEdge, `${b.id} porta ${x},${y}`).toBe(true);
        expect(isFree(world.walk, x, y), `${b.id} porta livre`).toBe(true);
      }
  });

  it('máquinas internas ficam no interior (fora das paredes) do prédio', () => {
    for (const m of data.machines) {
      const b = data.buildings.find((bb) => bb.kind !== 'cobertura' && rectsOverlap(bb.rect, m.rect));
      if (!b) continue;
      const I = interiorOf(b);
      expect(m.rect.x >= I.x && m.rect.y >= I.y && m.rect.x + m.rect.w <= I.x + I.w && m.rect.y + m.rect.h <= I.y + I.h, `${m.id} em ${b.id}`).toBe(true);
    }
  });

  it('todo prédio com tarefa "enter" tem assentos alcançáveis', () => {
    const start = nearestFree(world.walk, ENTRY)!;
    const used = new Set(data.employees.flatMap((e) => e.tasks.filter((t) => t.type === 'enter').map((t) => (t as { buildingId: string }).buildingId)));
    for (const id of used) {
      const seats = world.seats(id);
      expect(seats.length, `${id} sem assentos`).toBeGreaterThan(0);
      for (const s of seats) expect(routeBetween(world.walk, start, [s[0] + 0.5, s[1] + 0.5]), `${id} assento ${s}`).not.toBeNull();
    }
  });

  it('pontos de trabalho das máquinas são caminháveis e alcançáveis', () => {
    const start = nearestFree(world.walk, ENTRY)!;
    for (const m of data.machines) {
      const t = tile(machineWorkSpot(m));
      expect(isFree(world.walk, t[0], t[1]), `trabalho ${m.id} livre`).toBe(true);
      expect(routeBetween(world.walk, start, [t[0] + 0.5, t[1] + 0.5]), `trabalho ${m.id} alcançável`).not.toBeNull();
    }
  });

  it('funcionários: spawn e tarefas "talk/wait" caminháveis', () => {
    for (const e of data.employees) {
      const pts: Vec2[] = [e.spawn];
      for (const t of e.tasks) if (t.type === 'talk' || t.type === 'wait') pts.push(t.at);
      for (const p of pts) expect(isFree(world.walk, ...tile(p)), `${e.id} @${p}`).toBe(true);
    }
  });

  it('veículos estacionados ficam em vértices de rodagem', () => {
    for (const v of data.vehicles) if (v.parked) expect(isFree(world.drive, v.parked[0], v.parked[1]), v.id).toBe(true);
  });

  it('paradas de fluxo são vértices de rodagem dentro (ou junto) da zona declarada', () => {
    for (const f of data.flows)
      for (const s of f.stops) {
        expect(isFree(world.drive, s.at[0], s.at[1]), `${f.id}/${s.id} rodável`).toBe(true);
        if (!s.zoneId) continue;
        const z = data.zones.find((zz) => zz.id === s.zoneId)!;
        const near = z.rects.some((r) => rectContains({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, s.at[0], s.at[1]));
        expect(near, `${f.id}/${s.id}`).toBe(true);
      }
  });

  it('terreno: avenida, pátio, gramado, vias, pisos e paredes existem', () => {
    const counts = new Map<number, number>();
    world.terrain.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    for (const t of [T.AVENUE, T.YARD, T.LAWN, T.ROAD, T.CONTAINMENT, T.FLOOR, T.WALL, T.SIDEWALK]) expect(counts.get(t) ?? 0).toBeGreaterThan(10);
  });

  it('alambrado: da planta até a avenida, veículos só cruzam o perímetro pelo portão', () => {
    const g = data.layout.gate;
    const from: Vec2 = [92, 100]; // via leste
    const to: Vec2 = [60, 181]; // avenida, pista norte
    expect(isFree(world.drive, ...from)).toBe(true);
    expect(isFree(world.drive, ...to)).toBe(true);
    const path = findPath(world.drive, from, to)!;
    expect(path).not.toBeNull();
    const bnd = data.layout.boundary;
    // vértice na linha do perímetro (y = borda) usa um tile de dentro e um de fora: só pode no portão
    for (const [x, y] of path) if (y === bnd.y + bnd.h) expect(x > g.x && x < g.x + g.w, `cruzou o alambrado em ${x},${y}`).toBe(true);
  });

  it('perímetro diagonal: nenhum tile caminhável ou rodável fora do polígono (só portão/avenida)', () => {
    const poly = data.layout.perimeter!;
    expect(poly).toBeDefined();
    for (let y = 0; y < world.height; y++)
      for (let x = 0; x < world.width; x++) {
        if (!world.walk.cells[y * world.width + x]) continue;
        const ok = world.inside[y * world.width + x] === 1 || rectContains(data.layout.gate, x + 0.5, y + 0.5);
        expect(ok, `caminhável fora da planta em ${x},${y}`).toBe(true);
      }
  });

  it('salas: divisórias viram parede, vãos e portas norte ficam livres, toda sala alcançável', () => {
    const start = nearestFree(world.walk, ENTRY)!;
    for (const b of data.buildings) {
      for (const [x, y] of b.innerDoors ?? []) expect(isFree(world.walk, x, y), `${b.id} vão ${x},${y}`).toBe(true);
      for (const rm of b.rooms ?? []) {
        const c: Vec2 = [rm.rect.x + Math.floor(rm.rect.w / 2) + 0.5, rm.rect.y + rm.rect.h - 0.5];
        expect(routeBetween(world.walk, start, c), `${b.id}/${rm.id} alcançável`).not.toBeNull();
      }
    }
    const adm = data.buildings.find((b) => b.id === 'escritorio-adm')!;
    expect(world.terrainAt(44, 155)).toBe(T.WALL); // divisória RH | Expedição
    expect(world.terrainAt(44, 157)).toBe(T.FLOOR); // vão
    expect(adm.rooms!.length).toBeGreaterThanOrEqual(5);
  });

  it('pedestres preferem calçadas: rota da portaria ao refeitório usa majoritariamente calçada/faixa', () => {
    const route = routeBetween(world.walk, [14.5, 171.5], [87.5, 157.5])!;
    expect(route).not.toBeNull();
    let total = 0;
    let good = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const [ax, ay] = route[i];
      const [bx, by] = route[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let k = 0; k <= n; k++) {
        const t = world.terrainAt(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
        total++;
        if (t === T.SIDEWALK || t === T.FLOOR) good++;
      }
    }
    expect(good / total).toBeGreaterThan(0.8);
  });
});
