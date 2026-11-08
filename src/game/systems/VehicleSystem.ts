import Phaser from 'phaser';
import type { Flow, GridDir, Vec2, VehicleDef, VehicleState } from '../../types/world';
import type { Counters, LogEntry } from '../../services/eventBus';
import { anchorOf, keys } from '../art/TextureFactory';
import { lightSpots, VEHICLE_SIZE } from '../art/vehicles';
import { actorDepth, LAYER } from '../depth';
import { gridToScreen } from '../projection';
import type { ActorContext } from '../characters/Agent';
import type { WorldModel } from '../world/WorldModel';
import { buildFlowLegs, type FlowLegs } from '../world/flowRoutes';
import { approach, nextTurn, remaining, roundCorners, targetSpeed, type SpeedParams } from '../world/motion';

type Phase = 'idle' | 'wait' | 'leg' | 'stop';

const TRUCK: SpeedParams = { vmax: 2.9, vturn: 1.0, accel: 1.1, decel: 1.8 };
const CAR: SpeedParams = { vmax: 4.4, vturn: 1.6, accel: 2.6, decel: 3.4 };

export class VehicleAgent {
  readonly sprite: Phaser.GameObjects.Image;
  readonly brakes: Phaser.GameObjects.Image[] = [];
  readonly blinker: Phaser.GameObjects.Image;
  x: number;
  y: number;
  dir: GridDir;
  state: VehicleState;
  label: string;
  phase: Phase = 'idle';
  timer = 0;
  leg = 0;
  path: Vec2[] = [];
  /** Velocidade atual (tiles/s). */
  v = 0;
  readonly params: SpeedParams;
  waitBlocked = 0;
  braking = false;
  turnSide = 0;
  private wheel = 0;
  private blinkT = 0;

  constructor(
    ctx: ActorContext,
    readonly def: VehicleDef,
    readonly flow: Flow | null,
    readonly legs: FlowLegs | null,
  ) {
    this.dir = def.dir;
    this.x = def.parked?.[0] ?? 0;
    this.y = def.parked?.[1] ?? 0;
    this.state = def.parked ? 'ESTACIONADO' : 'FORA_DA_PLANTA';
    this.label = def.parked ? 'Estacionado' : 'Fora da planta';
    this.params = def.kind === 'carro' ? CAR : TRUCK;
    this.sprite = ctx.scene.add.image(0, 0, keys.vehicle(def.kind, def.color, def.dir, 0));
    this.sprite.setData('ref', { kind: 'vehicle', id: def.id });
    this.sprite.setInteractive({ pixelPerfect: true, alphaTolerance: 10, useHandCursor: true });
    this.sprite.setVisible(!!def.parked);
    for (let i = 0; i < 2; i++) this.brakes.push(ctx.scene.add.image(0, 0, 'fx_red').setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    this.blinker = ctx.scene.add.image(0, 0, 'fx_amber').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    if (flow && legs) {
      this.phase = 'wait';
      this.timer = def.startDelay ?? 0;
    }
    this.render(0, false);
  }

  get visible() {
    return this.sprite.visible;
  }

  /** Meia extensão (tiles) no eixo x e y conforme a direção. */
  half(): { hx: number; hy: number } {
    const { len, wid } = VEHICLE_SIZE[this.def.kind];
    const horiz = this.dir === 'E' || this.dir === 'W';
    return { hx: (horiz ? len : wid) / 32, hy: (horiz ? wid : len) / 32 };
  }

  /** Ponto da frente do veículo (px), para faróis. */
  front(): { x: number; y: number } {
    const { hx, hy } = this.half();
    const fx = this.dir === 'E' ? this.x + hx : this.dir === 'W' ? this.x - hx : this.x;
    const fy = this.dir === 'S' ? this.y + hy : this.dir === 'N' ? this.y - hy : this.y;
    return gridToScreen(fx, fy);
  }

  /** Ponto do escapamento (px), para a fumaça na partida. */
  exhaust(): { x: number; y: number } {
    const p = gridToScreen(this.x, this.y);
    const { len, wid } = VEHICLE_SIZE[this.def.kind];
    if (this.def.kind === 'carro') return { x: p.x + (this.dir === 'E' ? -len / 2 : this.dir === 'W' ? len / 2 : 0), y: p.y + wid / 3 };
    const back = len / 2 - 19;
    if (this.dir === 'E') return { x: p.x + back, y: p.y - wid / 2 - 12 };
    if (this.dir === 'W') return { x: p.x - back, y: p.y - wid / 2 - 12 };
    return { x: p.x + 3, y: p.y + (this.dir === 'N' ? -len / 2 + 2 : len / 2 - 26) };
  }

  render(dt: number, night: boolean) {
    const horiz = this.dir === 'E' || this.dir === 'W';
    const frame = horiz ? Math.floor(this.wheel / 0.22) % 2 : 0;
    const key = keys.vehicle(this.def.kind, this.def.color, this.dir, frame);
    const a = anchorOf(key);
    const p = gridToScreen(this.x, this.y);
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    this.sprite.setTexture(key).setOrigin(a.x, a.y).setPosition(px, py);
    const depth = actorDepth(this.y + this.half().hy) + 0.005;
    this.sprite.setDepth(depth);

    // lanternas de freio (e lanterna acesa à noite)
    const spots = lightSpots(this.def.kind, this.dir);
    const moving = this.visible && this.state !== 'ESTACIONADO' && this.state !== 'FORA_DA_PLANTA';
    const brakeOn = moving && (this.braking || this.v < 0.05);
    this.brakes.forEach((img, i) => {
      const s = spots.rear[i];
      if (!s || !this.visible || (!brakeOn && !(night && moving))) return img.setVisible(false);
      img.setPosition(px + s[0], py + s[1]).setAlpha(brakeOn ? 0.95 : 0.4).setScale(brakeOn ? 1 : 0.7).setDepth(depth + 0.001).setVisible(true);
    });
    // pisca antes das curvas
    this.blinkT += dt;
    const blinkOn = moving && this.turnSide !== 0 && Math.floor(this.blinkT / 0.33) % 2 === 0;
    if (blinkOn) {
      const s = this.turnSide > 0 ? spots.frontRight : spots.frontLeft;
      this.blinker.setPosition(px + s[0], py + s[1]).setDepth(depth + 0.002).setVisible(true);
    } else this.blinker.setVisible(false);
  }

  /** Anda pelo caminho com a velocidade atual. Retorna true ao chegar ao fim. */
  move(dt: number): boolean {
    let step = this.v * dt;
    this.wheel += step;
    while (step > 0 && this.path.length) {
      const [tx, ty] = this.path[0];
      const dx = tx - this.x;
      const dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.02) this.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
      if (dist <= step) {
        this.x = tx;
        this.y = ty;
        this.path.shift();
        step -= dist;
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        step = 0;
      }
    }
    return this.path.length === 0;
  }

  setVisible(v: boolean) {
    this.sprite.setVisible(v);
    if (!v) {
      for (const b of this.brakes) b.setVisible(false);
      this.blinker.setVisible(false);
    }
  }
}

/**
 * Veículos: estacionados, da frota (ciclos de diesel/manutenção) e externos
 * (expedição, recebimento, trânsito da avenida). Cada ciclo percorre as paradas do fluxo.
 * Movimento com aceleração/frenagem, curvas arredondadas, luz de freio, pisca, fumaça na partida.
 */
export class VehicleSystem {
  readonly agents: VehicleAgent[] = [];
  readonly counters: Counters = { expedicoes: 0, recebimentos: 0, abastecimentos: 0, manutencoes: 0 };
  /** Rota representativa de cada fluxo (para a sobreposição). */
  readonly flowRoutes = new Map<string, FlowLegs>();
  night = false;
  private puffs: Phaser.GameObjects.Particles.ParticleEmitter;
  private gateArm: Phaser.GameObjects.Image | null = null;
  private gateAngle = 0;

  constructor(
    ctx: ActorContext,
    private world: WorldModel,
    private log: (e: Omit<LogEntry, 'id' | 'time'>) => void,
  ) {
    const flows = new Map(world.data.flows.map((f) => [f.id, f]));
    for (const def of world.data.vehicles) {
      const flow = def.flowId ? flows.get(def.flowId) ?? null : null;
      const legs = flow ? buildFlowLegs(world, flow, def.parked) : null;
      if (flow && !legs) console.warn(`[veículos] rota inválida para ${def.id} no fluxo ${flow.id}`);
      if (flow && legs && !this.flowRoutes.has(flow.id)) this.flowRoutes.set(flow.id, legs);
      this.agents.push(new VehicleAgent(ctx, def, flow, legs));
    }
    this.puffs = ctx.scene.add
      .particles(0, 0, 'ico_smoke', {
        emitting: false,
        lifespan: 1100,
        speedY: { min: -16, max: -8 },
        speedX: { min: -6, max: 6 },
        scale: { start: 0.35, end: 1.1 },
        alpha: { start: 0.55, end: 0 },
        tint: 0x9aa0a8,
      })
      .setDepth(LAYER.overhead + 400);
    // cancela do portão (abre quando um veículo se aproxima)
    const g = world.data.layout.gate;
    const bottom = world.data.layout.boundary.y + world.data.layout.boundary.h;
    this.gateArm = ctx.scene.add
      .image(g.x * 16 - 1, bottom * 16 - 7, 'gate_arm')
      .setOrigin(0.04, 0.5)
      .setDepth(LAYER.overhead - 1);
  }

  get(id: string) {
    return this.agents.find((a) => a.def.id === id);
  }

  private nextLabel(v: VehicleAgent): string {
    const stop = v.flow!.stops[v.leg];
    if (stop) return `Indo para: ${stop.label}`;
    return v.def.parked ? 'Retornando à vaga' : 'Saindo da planta';
  }

  private say(v: VehicleAgent, text: string) {
    if (v.flow?.ambient) return;
    this.log({ text: `${v.def.plate} — ${text}`, kind: 'veiculo' });
  }

  private startLeg(v: VehicleAgent, leg: number) {
    v.leg = leg;
    v.path = roundCorners(v.legs!.legs[leg], v.def.kind === 'carro' ? 0.9 : 1.3).slice(1);
    v.state = 'EM_MOVIMENTO';
    v.label = this.nextLabel(v);
    v.phase = 'leg';
    v.v = 0;
    const e = v.exhaust();
    if (v.def.kind !== 'carro' && v.visible) this.puffs.explode(3, e.x, e.y);
  }

  update(dt: number) {
    for (const v of this.agents) {
      if (!v.flow || !v.legs) continue;
      switch (v.phase) {
        case 'wait':
          v.timer -= dt;
          if (v.timer <= 0) {
            if (!v.def.parked) {
              const s = v.legs.legs[0][0];
              v.x = s[0];
              v.y = s[1];
              v.setVisible(true);
            }
            this.startLeg(v, 0);
            if (v.def.parked) this.say(v, `saiu do pátio (${v.flow.name})`);
          }
          break;
        case 'leg': {
          const gap = this.gapAhead(v);
          if (gap !== null && gap < 0.6 && v.v < 0.05) v.waitBlocked += dt;
          else v.waitBlocked = 0;
          const turn = nextTurn(v.x, v.y, v.path);
          const tgt = targetSpeed(v.params, turn.dist, remaining(v.x, v.y, v.path), v.waitBlocked > 6 ? null : gap === null ? null : gap - 0.5);
          const before = v.v;
          v.v = approach(v.v, tgt, v.params, dt);
          v.braking = v.v < before - 0.01;
          v.turnSide = turn.dist < 3.5 ? turn.side : 0;
          if (v.move(dt)) {
            v.v = 0;
            v.turnSide = 0;
            const stop = v.flow.stops[v.leg];
            if (stop) {
              v.state = stop.state;
              v.label = stop.label;
              v.timer = stop.wait;
              v.phase = 'stop';
              if (stop.id === 'portaria-in') this.say(v, 'chegou à portaria');
              if (stop.state === 'CARREGANDO') this.say(v, `iniciou carregamento (${stop.label})`);
              if (stop.state === 'DESCARREGANDO') this.say(v, 'iniciou descarga (demonstrativo)');
              if (stop.state === 'ABASTECENDO') this.say(v, 'abastecendo diesel');
              if (stop.state === 'EM_MANUTENCAO') this.say(v, 'entrou na oficina');
            } else this.finish(v);
          }
          break;
        }
        case 'stop':
          v.timer -= dt;
          if (v.timer <= 0) this.startLeg(v, v.leg + 1);
          break;
      }
    }
    for (const v of this.agents) if (v.visible) v.render(dt, this.night);
    this.updateGate(dt);
  }

  /** Cancela: sobe com um veículo a até ~4 tiles do portão, desce depois (movimento suave). */
  private updateGate(dt: number) {
    if (!this.gateArm) return;
    const g = this.world.data.layout.gate;
    const near = this.agents.some((v) => v.visible && v.state !== 'ESTACIONADO' && v.x > g.x - 1.5 && v.x < g.x + g.w + 1.5 && Math.abs(v.y - g.y) < 5.5);
    const target = near ? -84 : 0;
    const speed = 110 * dt;
    this.gateAngle += Phaser.Math.Clamp(target - this.gateAngle, -speed, speed);
    this.gateArm.setAngle(this.gateAngle);
  }

  /**
   * Folga (tiles) até o veículo à frente na mesma faixa, ou null se livre.
   * Veículos estacionados não contam (ficam fora das faixas).
   */
  private gapAhead(v: VehicleAgent): number | null {
    const target = v.path[0];
    if (!target) return null;
    const dx = Math.sign(Math.round((target[0] - v.x) * 100) / 100);
    const dy = dx ? 0 : Math.sign(target[1] - v.y);
    if (!dx && !dy) return null;
    const { hx, hy } = v.half();
    const mine = dx ? hx : hy;
    let best: number | null = null;
    for (const o of this.agents) {
      if (o === v || !o.visible || o.state === 'ESTACIONADO') continue;
      const oh = o.half();
      const rx = o.x - v.x;
      const ry = o.y - v.y;
      const ahead = dx ? rx * dx : ry * dy;
      const lateral = dx ? Math.abs(ry) : Math.abs(rx);
      const oReach = dx ? oh.hx : oh.hy;
      if (ahead <= 0 || lateral > 0.9) continue;
      const gap = ahead - mine - oReach;
      if (gap < 4 && (best === null || gap < best)) best = gap;
    }
    return best;
  }

  private finish(v: VehicleAgent) {
    const f = v.flow!;
    if (f.counter) this.counters[f.counter]++;
    if (v.def.parked) {
      v.state = 'ESTACIONADO';
      v.label = 'Estacionado';
      this.say(v, 'retornou ao pátio');
    } else {
      v.setVisible(false);
      v.state = 'FORA_DA_PLANTA';
      v.label = 'Fora da planta';
      if (f.counter === 'expedicoes') this.say(v, 'deixou a planta carregado');
      else if (f.counter) this.say(v, 'deixou a planta');
    }
    v.phase = 'wait';
    v.timer = f.interval;
  }

  isInside(v: VehicleAgent) {
    const ix = Math.floor(v.x);
    const iy = Math.floor(v.y);
    return v.visible && ix >= 0 && iy >= 0 && ix < this.world.width && iy < this.world.height && this.world.inside[iy * this.world.width + ix] === 1;
  }
}
