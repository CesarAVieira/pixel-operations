import { describe, expect, it, vi } from 'vitest';
import { loadWorldData } from '../src/data';
import { buildWorld } from '../src/game/world/WorldModel';
import { buildFlowLegs, flattenLegs } from '../src/game/world/flowRoutes';
import { EventBus } from '../src/services/eventBus';
import { lineOfSight } from '../src/game/map/pathfinding';

const data = loadWorldData();
const world = buildWorld(data);

describe('rotas dos fluxos', () => {
  for (const f of data.flows) {
    const homes = data.vehicles.filter((v) => v.flowId === f.id).map((v) => v.parked);
    for (const home of homes) {
      it(`${f.id} (${home ? 'frota' : 'externo'})`, () => {
        const legs = buildFlowLegs(world, f, home);
        expect(legs).not.toBeNull();
        expect(legs!.legs.length).toBe(f.stops.length + 1);
        // cada perna começa e termina exatamente nos pontos definidos
        const pts = [home ?? f.spawn!, ...f.stops.map((s) => s.at), home ?? f.despawn!];
        legs!.legs.forEach((leg, i) => {
          expect(leg[0]).toEqual(pts[i]);
          expect(leg[leg.length - 1]).toEqual(pts[i + 1]);
        });
        // trechos intermediários respeitam a grade de rodagem
        for (const leg of legs!.legs)
          for (let i = 1; i < leg.length - 2; i++) {
            const a: [number, number] = [Math.floor(leg[i][0]), Math.floor(leg[i][1])];
            const b: [number, number] = [Math.floor(leg[i + 1][0]), Math.floor(leg[i + 1][1])];
            expect(lineOfSight(world.drive, a, b)).toBe(true);
          }
        expect(flattenLegs(legs!).length).toBeGreaterThan(1);
        // regressão (sessão 2): rotas de veículos só têm trechos retos (horizontais/verticais na grade)
        for (const leg of legs!.legs)
          for (let i = 0; i < leg.length - 1; i++) {
            const dx = leg[i + 1][0] - leg[i][0];
            const dy = leg[i + 1][1] - leg[i][1];
            expect(dx === 0 || dy === 0, `diagonal em ${leg[i]} → ${leg[i + 1]}`).toBe(true);
          }
      });
    }
  }
});

describe('mão de direção', () => {
  it('na via da balança (centro y=150), quem vai para leste usa y=151 e para oeste y=149', () => {
    let checked = 0;
    for (const id of ['expedicao-a', 'expedicao-b', 'expedicao-c']) {
      const f = data.flows.find((x) => x.id === id)!;
      const legs = buildFlowLegs(world, f, null)!;
      for (const leg of legs.legs)
        for (let i = 0; i < leg.length - 1; i++) {
          const [ax, ay] = leg[i];
          const [bx, by] = leg[i + 1];
          if (ay !== by || ay < 148 || ay > 152 || Math.abs(bx - ax) < 6 || Math.min(ax, bx) < 33) continue;
          expect(ay, `${id}: trecho ${ax}→${bx}`).toBe(bx > ax ? 151 : 149);
          checked++;
        }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('regressão: carretas de expedição/recebimento não fazem retorno ("meia-volta") no meio da via', () => {
    for (const f of data.flows.filter((x) => x.id.startsWith('expedicao') || x.id === 'recebimento')) {
      const pts = flattenLegs(buildFlowLegs(world, f, null)!);
      const segs: { dx: number; dy: number; len: number; at: number[] }[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = Math.sign(pts[i + 1][0] - pts[i][0]);
        const dy = Math.sign(pts[i + 1][1] - pts[i][1]);
        const len = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
        const last = segs[segs.length - 1];
        if (last && last.dx === dx && last.dy === dy) last.len += len;
        else segs.push({ dx, dy, len, at: pts[i] });
      }
      for (let i = 0; i + 2 < segs.length; i++) {
        const [a, b, c] = [segs[i], segs[i + 1], segs[i + 2]];
        const uTurn = a.dx === -c.dx && a.dy === -c.dy && b.len <= 3;
        expect(uTurn, `${f.id}: retorno perto de ${b.at}`).toBe(false);
        // inversão direta (sem trecho lateral)
        expect(a.dx === -b.dx && a.dy === -b.dy, `${f.id}: ré em ${b.at}`).toBe(false);
      }
    }
  });

  it('avenida com canteiro: caminhões entram e saem pela pista norte (sentido oeste)', () => {
    const f = data.flows.find((x) => x.id === 'expedicao-a')!;
    const legs = buildFlowLegs(world, f, null)!;
    const md = data.layout.median!;
    for (const leg of legs.legs)
      for (let i = 0; i < leg.length - 1; i++) {
        const [ax, ay] = leg[i];
        const [bx, by] = leg[i + 1];
        if (ay === by && ay > data.layout.avenue.y) {
          expect(ay < md.y, `trecho na pista sul em y=${ay}`).toBe(true);
          expect(bx <= ax, `contramão na pista norte ${ax}→${bx}`).toBe(true);
        }
      }
  });
});

describe('EventBus', () => {
  it('entrega, remove e isola eventos', () => {
    const b = new EventBus<{ a: number; b: void }>();
    const fa = vi.fn();
    const fb = vi.fn();
    const off = b.on('a', fa);
    b.on('b', fb);
    b.emit('a', 7);
    b.emit('b');
    off();
    b.emit('a', 8);
    expect(fa).toHaveBeenCalledTimes(1);
    expect(fa).toHaveBeenCalledWith(7);
    expect(fb).toHaveBeenCalledTimes(1);
  });

  it('regressão BUG-003: o barramento é único mesmo se o módulo for reavaliado', async () => {
    const m1 = await import('../src/services/eventBus');
    vi.resetModules();
    const m2 = await import('../src/services/eventBus');
    expect(m1.bus).toBe(m2.bus);
  });
});
