import Phaser from 'phaser';
import type { EntityRef, Rect } from '../../types/world';
import { bus, type BusEvents, type Snapshot, type ViewMode } from '../../services/eventBus';
import { getWorldData } from '../../data';
import { generateTextures } from '../art/TextureFactory';
import { buildWorld, type WorldModel } from '../world/WorldModel';
import { MapRenderer } from '../systems/MapRenderer';
import { MachineSystem } from '../systems/MachineSystem';
import { CharacterSystem } from '../characters/CharacterSystem';
import { VehicleSystem } from '../systems/VehicleSystem';
import { CameraController } from '../systems/CameraController';
import { FlowOverlay } from '../systems/FlowOverlay';
import { Interaction } from '../systems/Interaction';
import type { ActorContext } from '../characters/Agent';
import { LightingSystem } from '../systems/LightingSystem';

/**
 * Cena principal: monta o mundo e orquestra os sistemas. Simulação 100% automática
 * (sem personagem controlável — decisão da sessão 2, ver ADR-012). Não contém regra de negócio.
 */
export class WorldScene extends Phaser.Scene {
  world!: WorldModel;
  private map!: MapRenderer;
  private machines!: MachineSystem;
  private people!: CharacterSystem;
  private vehicles!: VehicleSystem;
  private camCtl!: CameraController;
  private flow!: FlowOverlay;
  private interaction!: Interaction;
  private light!: LightingSystem;
  private snapTimer = 0;
  private clock = 0;
  private offBus: (() => void)[] = [];

  constructor() {
    super('world');
  }

  create() {
    const data = getWorldData();
    this.world = buildWorld(data);
    generateTextures(this, this.world);

    this.map = new MapRenderer(this, this.world);
    this.map.render();
    const ctx: ActorContext = { scene: this, origin: this.world.origin };

    this.machines = new MachineSystem(this, this.world, this.map);
    this.people = new CharacterSystem(ctx, this.world);
    this.vehicles = new VehicleSystem(ctx, this.world, (e) => bus.emit('game:log', e));
    this.machines.vehicles = this.vehicles;
    this.camCtl = new CameraController(this, this.world, this.map.size);
    this.camCtl.fit(0);
    this.flow = new FlowOverlay(this, this.world, this.vehicles, this.map.size);
    this.light = new LightingSystem(this, this.world, this.map, this.vehicles);

    this.interaction = new Interaction(this, this.world, {
      onSelect: (ref) => bus.emit('game:select', ref),
      onHover: (ref) => bus.emit('game:hover', ref ? { ref, name: this.nameOf(ref) } : null),
      onGroundClick: (gx, gy) => this.groundClick(gx, gy),
      onPan: (dx, dy) => this.camCtl.pan(dx, dy),
      locate: (ref) => this.locate(ref),
      rectOf: (ref) => this.rectOf(ref),
    });

    this.wireBus();
    const unbind = () => {
      this.offBus.forEach((f) => f());
      this.offBus = [];
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unbind);
    this.events.once(Phaser.Scenes.Events.DESTROY, unbind);
    bus.emit('game:ready');
    bus.emit('game:log', { text: 'Ambiente carregado. Dados demonstrativos — não representam a operação real.', kind: 'sistema' });
  }

  private wireBus() {
    const on = <K extends keyof BusEvents>(k: K, fn: (p: BusEvents[K]) => void) => this.offBus.push(bus.on(k, fn));
    on('cmd:zoom', (d) => this.camCtl.zoomStep(d));
    on('cmd:center', () => this.camCtl.center());
    on('cmd:fit', () => this.camCtl.fit());
    on('cmd:focus', (ref) => this.focus(ref));
    on('cmd:select', (ref) => {
      this.interaction.selected = ref;
      if (ref) this.focus(ref);
    });
    on('cmd:mode', (m) => this.setMode(m));
    on('cmd:flows', (ids) => this.flow.setVisibleFlows(ids));
    on('cmd:daymode', (m) => this.light.setMode(m));
    on('cmd:machineStatus', ({ id, status }) => {
      this.machines.setStatus(id, status);
      const m = this.world.machine(id);
      bus.emit('game:log', { text: `${m?.name ?? id}: status alterado para ${status.replace(/_/g, ' ').toLowerCase()} (simulação)`, kind: 'equipamento' });
    });
  }

  private setMode(m: ViewMode) {
    this.flow.setActive(m === 'operacional');
    this.map.setLabelsVisible(m !== 'operacional');
    if (m === 'operacional') this.camCtl.fit();
  }

  /** Clique no chão: prédio (piso interno), senão área/setor, senão limpa a seleção. */
  private groundClick(gx: number, gy: number) {
    const b = this.world.buildingAt(gx, gy);
    if (b) return this.interaction.select({ kind: 'building', id: b.id });
    const z = this.world.zoneAt(gx, gy);
    this.interaction.select(z ? { kind: 'zone', id: z.id } : null);
  }

  nameOf(ref: EntityRef): string {
    const d = this.world.data;
    switch (ref.kind) {
      case 'building':
        return d.buildings.find((b) => b.id === ref.id)?.name ?? ref.id;
      case 'machine':
        return d.machines.find((m) => m.id === ref.id)?.name ?? ref.id;
      case 'vehicle': {
        const v = d.vehicles.find((x) => x.id === ref.id);
        return v ? `${v.kind === 'carro' ? 'Carro' : 'Caminhão'} ${v.plate}` : ref.id;
      }
      case 'employee': {
        const e = d.employees.find((x) => x.id === ref.id);
        return e ? `${e.name} — ${e.role}` : ref.id;
      }
      case 'zone':
        return d.zones.find((z) => z.id === ref.id)?.name ?? ref.id;
      default:
        return ref.id;
    }
  }

  private locate(ref: EntityRef): { x: number; y: number } | null {
    if (ref.kind === 'vehicle') {
      const v = this.vehicles.get(ref.id);
      return v && v.visible ? { x: v.x, y: v.y } : null;
    }
    if (ref.kind === 'employee') {
      const b = this.people.get(ref.id);
      return b && !b.agent.isHidden ? { x: b.agent.x, y: b.agent.y } : null;
    }
    return null;
  }

  private rectOf(ref: EntityRef): Rect[] | null {
    if (ref.kind === 'building') return [this.world.building(ref.id)!.rect];
    if (ref.kind === 'machine') return [this.world.machine(ref.id)!.rect];
    if (ref.kind === 'zone') return this.world.data.zones.find((z) => z.id === ref.id)?.rects ?? null;
    return null;
  }

  private focus(ref: EntityRef) {
    if (ref.kind === 'vehicle') {
      const v = this.vehicles.get(ref.id);
      if (v?.visible) this.camCtl.follow(v.sprite);
      return;
    }
    if (ref.kind === 'employee') {
      const b = this.people.get(ref.id);
      if (b) this.camCtl.follow(b.agent.sprite);
      return;
    }
    const rects = this.rectOf(ref);
    if (!rects?.length) return;
    const r = rects[0];
    this.camCtl.focusGrid(r.x + r.w / 2, r.y + r.h / 2);
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.clock += dt;
    this.camCtl.update(dt);
    this.people.update(dt);
    this.vehicles.night = this.light.darkness > 0.35;
    this.vehicles.update(dt);
    this.machines.update(dt);
    this.map.update(dt);
    this.flow.update(dt);
    this.light.update(dt);
    this.map.scaleLabels(this.cameras.main.zoom);
    this.interaction.update(dt);

    this.snapTimer -= dt;
    if (this.snapTimer <= 0) {
      this.snapTimer = 0.4;
      bus.emit('game:snapshot', this.snapshot());
      bus.emit('game:zoom', this.cameras.main.zoom);
      bus.emit('game:clock', { hour: this.light.hour, dark: this.light.darkness, mode: this.light.mode });
    }
  }

  private snapshot(): Snapshot {
    const vehicles: Snapshot['vehicles'] = {};
    for (const v of this.vehicles.agents)
      vehicles[v.def.id] = { state: v.state, label: v.label, inside: this.vehicles.isInside(v), visible: v.visible };
    const employees: Snapshot['employees'] = {};
    for (const b of this.people.brains) employees[b.def.id] = { state: b.agent.state, activity: b.activity };
    const machines: Snapshot['machines'] = {};
    for (const [id, s] of this.machines.status) machines[id] = s;
    return { time: this.clock, vehicles, employees, machines, counters: { ...this.vehicles.counters } };
  }
}
