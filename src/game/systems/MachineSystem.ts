import Phaser from 'phaser';
import type { Machine, MachineStatus } from '../../types/world';
import { keys } from '../art/TextureFactory';
import { machineFrames } from '../art/machines';
import { STATUS_COLORS } from '../art/palette';
import { LAYER } from '../depth';
import { gridToScreen } from '../projection';
import type { WorldModel } from '../world/WorldModel';
import type { MapRenderer } from './MapRenderer';
import type { VehicleSystem } from './VehicleSystem';

interface Indicator {
  machine: Machine;
  led: Phaser.GameObjects.Image;
  cone: Phaser.GameObjects.Image;
  image: Phaser.GameObjects.Image | null;
  frames: number;
  frame: number;
  tween?: Phaser.Tweens.Tween;
}

/** Período (s) entre quadros por tipo de equipamento em funcionamento. */
const PERIOD: Partial<Record<Machine['kind'], number>> = {
  misturador: 0.09,
  reator: 0.35,
  painel: 0.45,
  caldeira: 0.12,
  bomba: 0.07,
  'braco-carregamento': 0.4,
  'bomba-diesel': 0.3,
};

/**
 * Estados visuais e animação dos equipamentos:
 * - LED de status (verde/cinza/âmbar/vermelho piscando) e cone de manutenção;
 * - motores girando, chama da caldeira, painéis piscando (só em funcionamento);
 * - braço de carregamento abaixa quando há carreta carregando; bomba de diesel estende a mangueira;
 * - visor da balança mostra o peso subindo durante a pesagem; fumaça nas chaminés.
 */
export class MachineSystem {
  readonly status = new Map<string, MachineStatus>();
  vehicles: VehicleSystem | null = null;
  private indicators = new Map<string, Indicator>();
  private t = 0;
  private scales: { m: Machine; text: Phaser.GameObjects.Text; shown: number }[] = [];

  constructor(private scene: Phaser.Scene, world: WorldModel, map: MapRenderer) {
    for (const m of world.data.machines) {
      this.status.set(m.id, m.status);
      const entry = map.entries.find((e) => e.ref?.kind === 'machine' && e.ref.id === m.id);
      const top = entry ? entry.image.getBounds().top : gridToScreen(m.rect.x, m.rect.y).y - 20;
      const c = gridToScreen(m.rect.x + m.rect.w / 2, m.rect.y + m.rect.h / 2);
      const led = scene.add.image(c.x, top - 4, 'ico_led').setDepth(LAYER.lighting + 10);
      const cone = scene.add.image(c.x + 8, top - 2, 'ico_cone').setDepth(LAYER.lighting + 10).setVisible(false);
      const ind: Indicator = { machine: m, led, cone, image: entry?.image ?? null, frames: machineFrames(m), frame: 0 };
      this.indicators.set(m.id, ind);
      this.apply(ind, m.status);
      if (m.kind === 'balanca') {
        const p = gridToScreen(m.rect.x, m.rect.y + m.rect.h / 2);
        const text = scene.add
          .text(p.x - 13, p.y - 24, '0', { fontFamily: 'Silkscreen, monospace', fontSize: '5px', color: '#5ef08a' })
          .setOrigin(0.5, 0.5)
          .setResolution(6)
          .setDepth(LAYER.flat + m.rect.y + 1);
        this.scales.push({ m, text, shown: 0 });
      }
    }
    for (const c of map.chimneys) this.smoke(c.x, c.y);
  }

  private apply(ind: Indicator, s: MachineStatus) {
    ind.tween?.stop();
    ind.led.setAlpha(1).setTint(Phaser.Display.Color.HexStringToColor(STATUS_COLORS[s]).color);
    ind.cone.setVisible(s === 'EM_MANUTENCAO');
    if (s === 'COM_PROBLEMA') ind.tween = this.scene.tweens.add({ targets: ind.led, alpha: 0.15, yoyo: true, repeat: -1, duration: 380 });
    if (s === 'EM_FUNCIONAMENTO') ind.tween = this.scene.tweens.add({ targets: ind.led, alpha: 0.65, yoyo: true, repeat: -1, duration: 1200 });
  }

  setStatus(id: string, s: MachineStatus) {
    const ind = this.indicators.get(id);
    if (!ind) return;
    this.status.set(id, s);
    this.apply(ind, s);
  }

  /** Há um veículo no estado `state` a até `r` tiles do equipamento? */
  private serving(m: Machine, state: string, r: number): boolean {
    if (!this.vehicles) return false;
    const cx = m.rect.x + m.rect.w / 2;
    const cy = m.rect.y + m.rect.h / 2;
    return this.vehicles.agents.some((v) => v.visible && v.state === state && Math.abs(v.x - cx) < r + m.rect.w / 2 && Math.abs(v.y - cy) < r + m.rect.h / 2);
  }

  update(dt: number) {
    this.t += dt;
    for (const ind of this.indicators.values()) {
      if (ind.frames <= 1 || !ind.image) continue;
      const m = ind.machine;
      const period = PERIOD[m.kind] ?? 0.2;
      const tick = Math.floor(this.t / period);
      let f = 0;
      if (m.kind === 'braco-carregamento') f = this.serving(m, 'CARREGANDO', 3) ? 1 + (tick % 2) : 0;
      else if (m.kind === 'bomba-diesel') f = this.serving(m, 'ABASTECENDO', 3) ? 1 + (tick % 2) : 0;
      else if (this.status.get(m.id) === 'EM_FUNCIONAMENTO') f = tick % ind.frames;
      else if (m.kind === 'caldeira') f = 0;
      if (f !== ind.frame) {
        ind.frame = f;
        ind.image.setTexture(keys.machine(m.id, f));
      }
    }
    // balança: peso sobe suavemente enquanto o caminhão pesa, zera quando sai
    for (const s of this.scales) {
      const on = this.serving(s.m, 'PESAGEM', 2);
      const target = on ? 38000 + ((Math.floor(this.t / 40) * 7919) % 9000) : 0;
      s.shown += (target - s.shown) * Math.min(1, dt * 2.2);
      const kg = Math.round(s.shown / 20) * 20;
      s.text.setText(kg < 40 ? '0' : kg.toLocaleString('pt-BR'));
    }
  }

  private smoke(x: number, y: number) {
    this.scene.add
      .particles(x, y, 'ico_smoke', {
        speedY: { min: -14, max: -8 },
        speedX: { min: 2, max: 7 },
        lifespan: 2600,
        frequency: 260,
        scale: { start: 0.5, end: 1.7 },
        alpha: { start: 0.55, end: 0 },
      })
      .setDepth(LAYER.overhead + 500);
  }

  setVisible(v: boolean) {
    for (const ind of this.indicators.values()) {
      ind.led.setVisible(v);
      ind.cone.setVisible(v && this.status.get(ind.machine.id) === 'EM_MANUTENCAO');
    }
  }
}
