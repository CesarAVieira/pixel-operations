import Phaser from 'phaser';
import { LAYER } from '../depth';
import { TILE } from '../projection';
import { interiorOf } from '../map/terrain';
import { darknessAt } from './daylight';
import type { WorldModel } from '../world/WorldModel';
import type { MapRenderer } from './MapRenderer';
import type { VehicleSystem } from './VehicleSystem';

export type DayMode = 'auto' | 'dia' | 'noite';

export { darknessAt };

/** Cor do véu de multiplicação: entardecer quente → noite azulada. */
function veilColor(dark: number, hour: number): number {
  const dusk = hour >= 15 && hour < 21 ? Math.sin(Math.min(1, dark * 1.6) * Math.PI) : 0;
  const night = { r: 70, g: 86, b: 150 };
  const warm = { r: 255, g: 196, b: 140 };
  const r = 255 + (night.r - 255) * dark + (warm.r - 255) * dusk * 0.35;
  const g = 255 + (night.g - 255) * dark + (warm.g - 255) * dusk * 0.35;
  const b = 255 + (night.b - 255) * dark + (warm.b - 255) * dusk * 0.35;
  return Phaser.Display.Color.GetColor(Math.round(r), Math.round(g), Math.round(b));
}

interface Light {
  img: Phaser.GameObjects.Image;
  base: number;
  flicker?: number;
}

/** Ciclo dia/noite: véu (MULTIPLY) + luzes (ADD) de postes, salas, chaminés e faróis. */
export class LightingSystem {
  hour = 15.5;
  mode: DayMode = 'auto';
  /** Horas simuladas por segundo real (24 h ≈ 6 min). */
  speed = 24 / 360;
  private veil: Phaser.GameObjects.Rectangle;
  private lights: Light[] = [];
  private headlights = new Map<string, Phaser.GameObjects.Image>();
  private dark = 0;
  private t = 0;

  constructor(private scene: Phaser.Scene, world: WorldModel, map: MapRenderer, private vehicles: VehicleSystem) {
    const { width, height } = map.size;
    this.veil = scene.add.rectangle(-600, -600, width + 1200, height + 1200, 0xffffff, 1).setOrigin(0, 0).setDepth(LAYER.lighting).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const add = (key: string, x: number, y: number, sx: number, sy: number, base: number, tint?: number, flicker?: number) => {
      const img = scene.add.image(x, y, key).setScale(sx, sy).setDepth(LAYER.lighting + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      if (tint) img.setTint(tint);
      this.lights.push({ img, base, flicker });
    };
    for (const l of map.lamps) {
      add('light_warm', l.x, l.y + 2, 0.55, 0.45, 0.9);
      add('light_warm', l.x, l.y + 40, 1.2, 0.7, 0.55);
    }
    for (const b of world.data.buildings) {
      if (b.kind === 'cobertura') {
        add('light_cool', (b.rect.x + b.rect.w / 2) * TILE, (b.rect.y + b.rect.h / 2) * TILE, (b.rect.w * TILE) / 90, (b.rect.h * TILE) / 90, 0.6);
        continue;
      }
      const I = interiorOf(b);
      const cx = (I.x + I.w / 2) * TILE;
      const cy = (I.y + I.h / 2) * TILE;
      add('light_warm', cx, cy, (I.w * TILE) / 80, (I.h * TILE) / 80, b.kind === 'fabrica' || b.kind === 'galpao' || b.kind === 'manutencao' ? 0.42 : 0.5, b.kind === 'fabrica' ? 0xdfe8ff : undefined);
    }
    for (const c of map.chimneys) add('light_warm', c.x, c.y + 6, 0.25, 0.2, 0.6, 0xff9a50, 1);
    this.apply();
  }

  setMode(m: DayMode) {
    this.mode = m;
    if (m === 'dia') this.hour = 12;
    if (m === 'noite') this.hour = 22;
  }

  get darkness() {
    return this.dark;
  }

  private apply() {
    this.dark = darknessAt(this.hour);
    this.veil.setFillStyle(veilColor(this.dark, this.hour), 1);
    this.veil.setVisible(this.dark > 0.01);
    for (const l of this.lights) {
      const f = l.flicker ? 0.8 + Math.sin(this.t * 9 + l.img.x) * 0.2 : 1;
      l.img.setAlpha(l.base * this.dark * f);
      l.img.setVisible(this.dark > 0.01);
    }
  }

  update(dt: number) {
    this.t += dt;
    if (this.mode === 'auto') this.hour = (this.hour + dt * this.speed) % 24;
    this.apply();
    // faróis dos veículos em movimento
    for (const v of this.vehicles.agents) {
      let hl = this.headlights.get(v.def.id);
      const on = v.visible && v.state !== 'ESTACIONADO' && this.dark > 0.05;
      if (!on) {
        hl?.setVisible(false);
        continue;
      }
      if (!hl) {
        hl = this.scene.add.image(0, 0, 'light_white').setDepth(LAYER.lighting + 2).setBlendMode(Phaser.BlendModes.ADD);
        this.headlights.set(v.def.id, hl);
      }
      const p = v.front();
      const off = 14;
      const ox = v.dir === 'E' ? off : v.dir === 'W' ? -off : 0;
      const oy = v.dir === 'S' ? off : v.dir === 'N' ? -off : 0;
      hl.setPosition(p.x + ox, p.y + oy).setScale(v.dir === 'E' || v.dir === 'W' ? 0.9 : 0.55, v.dir === 'E' || v.dir === 'W' ? 0.5 : 0.9).setAlpha(0.75 * this.dark).setVisible(true);
    }
  }
}
