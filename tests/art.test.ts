/**
 * Arte e animação (puro, sem Phaser): personagens, veículos, equipamentos e movimento.
 */
import { describe, expect, it } from 'vitest';
import { appearanceOf, CHAR_H, CHAR_W, frameName, POSE_FRAMES, POSES, renderCharacter, renderSheet, VIEWS } from '../src/game/art/characters';
import { vehicleSprite } from '../src/game/art/vehicles';
import { machineFrames, machineSprite } from '../src/game/art/machines';
import { approach, nextTurn, remaining, roundCorners, targetSpeed } from '../src/game/world/motion';
import { loadWorldData } from '../src/data';
import type { PixelBuf } from '../src/game/art/core/pixbuf';
import type { Vec2 } from '../src/types/world';

const opaque = (b: PixelBuf) => {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i] > 0) n++;
  return n;
};
const same = (a: PixelBuf, b: PixelBuf) => a.data.every((v, i) => v === b.data[i]);

describe('personagens', () => {
  it('aparência é determinística e respeita o EPI do uniforme', () => {
    expect(appearanceOf('operacional', 4)).toEqual(appearanceOf('operacional', 4));
    expect(appearanceOf('operacional', 1).head).toBe('capacete');
    expect(appearanceOf('manutencao', 2).head).toBe('capacete');
    expect(appearanceOf('manutencao', 2).toolbelt).toBe(true);
    expect(appearanceOf('administrativo', 3).head).toBe('none');
    // pessoas diferentes ficam diferentes
    const looks = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(appearanceOf('administrativo', i))));
    expect(looks.size).toBeGreaterThan(8);
  });

  it('todos os quadros de todas as poses e vistas têm desenho, dentro do quadro 24×34', () => {
    const a = appearanceOf('operacional', 7);
    for (const v of VIEWS)
      for (const p of POSES)
        for (let f = 0; f < POSE_FRAMES[p]; f++) {
          const b = renderCharacter(a, p, v, f);
          expect(b.w).toBe(CHAR_W);
          expect(b.h).toBe(CHAR_H);
          expect(opaque(b), `${v}/${p}/${f}`).toBeGreaterThan(120);
        }
  });

  it('animações mudam o desenho entre quadros (andar, digitar, operar, piscar)', () => {
    const a = appearanceOf('administrativo', 5);
    for (const [p, v] of [['walk', 'down'], ['walk', 'side'], ['type', 'up'], ['use', 'down'], ['stand', 'down']] as const) {
      const f0 = renderCharacter(a, p, v, 0);
      const others = Array.from({ length: POSE_FRAMES[p] - 1 }, (_, i) => renderCharacter(a, p, v, i + 1));
      expect(others.some((o) => !same(o, f0)), `${p}/${v}`).toBe(true);
    }
  });

  it('folha de quadros nomeia cada quadro (inclusive variantes sentadas)', () => {
    const { layout } = renderSheet(appearanceOf('motorista', 3));
    const names = new Set(layout.frames.map((f) => f.name));
    expect(names.has(frameName('side', 'walk', 3))).toBe(true);
    expect(names.has(frameName('up', 'type', 0))).toBe(true);
    expect(names.has(frameName('down', 'talk', 1, true))).toBe(true);
    expect(names.size).toBe(layout.frames.length);
  });
});

describe('veículos e equipamentos', () => {
  it('rodas giram nas vistas laterais (quadros diferentes)', () => {
    const a = vehicleSprite('carreta-tanque', '#b91c1c', 'E', 0).buf;
    const b = vehicleSprite('carreta-tanque', '#b91c1c', 'E', 1).buf;
    expect(same(a, b)).toBe(false);
  });

  it('equipamentos animados têm quadros distintos e mesmo tamanho (troca de textura sem pular)', () => {
    const data = loadWorldData();
    for (const m of data.machines) {
      const n = machineFrames(m);
      if (n <= 1) continue;
      const f0 = machineSprite(m, 0);
      const f1 = machineSprite(m, 1);
      expect([f1.buf.w, f1.buf.h, f1.ax, f1.ay], m.id).toEqual([f0.buf.w, f0.buf.h, f0.ax, f0.ay]);
      expect(same(f0.buf, f1.buf), m.id).toBe(false);
    }
  });
});

describe('movimento dos veículos', () => {
  const L: Vec2[] = [[0, 0], [10, 0], [10, 8]];

  it('curvas arredondadas preservam início e fim e não se afastam da quina', () => {
    const r = roundCorners(L, 1.2);
    expect(r[0]).toEqual([0, 0]);
    expect(r[r.length - 1]).toEqual([10, 8]);
    expect(r.length).toBeGreaterThan(L.length);
    for (const [x, y] of r) expect(Math.min(Math.abs(y), Math.abs(x - 10)) < 1.21 || (x <= 10 && y >= 0)).toBe(true);
    // caminho reto não muda
    expect(roundCorners([[0, 0], [5, 0], [9, 0]])).toEqual([[0, 0], [5, 0], [9, 0]]);
  });

  it('próxima curva: distância e lado (leste → sul = direita)', () => {
    const t = nextTurn(0, 0, L.slice(1));
    expect(t.dist).toBeCloseTo(10);
    expect(t.side).toBe(1);
    expect(nextTurn(0, 0, [[10, 0]]).dist).toBe(Infinity);
    expect(remaining(0, 0, L.slice(1))).toBeCloseTo(18);
  });

  it('freia antes da curva, da parada e do veículo da frente; acelera com limite', () => {
    const p = { vmax: 3, vturn: 1, accel: 1, decel: 2 };
    expect(targetSpeed(p, Infinity, 50, null)).toBe(3);
    expect(targetSpeed(p, 0, 50, null)).toBeCloseTo(1);
    expect(targetSpeed(p, Infinity, 0, null)).toBeLessThan(0.5);
    expect(targetSpeed(p, Infinity, 50, 0)).toBe(0);
    expect(approach(0, 3, p, 0.5)).toBeCloseTo(0.5);
    expect(approach(3, 0, p, 0.1)).toBeCloseTo(3 - 0.28);
  });
});
