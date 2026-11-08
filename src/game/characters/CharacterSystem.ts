import type { Employee, Task, Vec2 } from '../../types/world';
import { routeBetween } from '../map/pathfinding';
import { machineWorkSpot, type WorldModel } from '../world/WorldModel';
import { Agent, type ActorContext, type Activity } from './Agent';
import type { MachineKind } from '../../types/world';
import type { PropType } from '../world/interiors';

/** Pose ao usar cada tipo de assento/móvel. */
const SEAT_ACTIVITY: Partial<Record<PropType, Activity>> = {
  desk: { pose: 'type', seated: true },
  gatedesk: { pose: 'type', seated: true },
  chair: { pose: 'talk', seated: true },
  sofa: { pose: 'sit', seated: true },
  bench: { pose: 'sit', seated: true },
  table: { pose: 'sit', seated: true },
  coffeetable: { pose: 'sit', seated: true },
  forklift: { pose: 'sit', seated: true },
  toolbench: { pose: 'use', seated: false },
  labbench: { pose: 'use', seated: false },
  hood: { pose: 'use', seated: false },
  stove: { pose: 'use', seated: false },
  sink: { pose: 'use', seated: false },
  counter: { pose: 'use', seated: false },
};

/** Pose ao trabalhar em cada tipo de equipamento: conferir (prancheta) ou operar (volante/painel). */
const MACHINE_ACTIVITY: Record<MachineKind, Activity> = {
  'tanque-vertical': { pose: 'check', seated: false },
  'tanque-horizontal': { pose: 'check', seated: false },
  balanca: { pose: 'check', seated: false },
  'bomba-diesel': { pose: 'check', seated: false },
  bomba: { pose: 'use', seated: false },
  'braco-carregamento': { pose: 'use', seated: false },
  reator: { pose: 'use', seated: false },
  misturador: { pose: 'use', seated: false },
  caldeira: { pose: 'use', seated: false },
  painel: { pose: 'use', seated: false },
};

type Phase = 'idle' | 'moving' | 'acting';

interface Brain {
  def: Employee;
  agent: Agent;
  taskIndex: number;
  phase: Phase;
  timer: number;
  activity: string;
  seat: Vec2 | null;
  face: 'N' | 'S' | 'E' | 'W' | null;
  act: Activity;
}

/**
 * Funcionários fictícios. Cada um percorre ciclicamente sua lista de tarefas:
 * trabalhar numa máquina, entrar num prédio (ocupar uma mesa/bancada lá dentro),
 * conversar ou aguardar. Estados: IDLE, WALKING, WORKING, TALKING, WAITING, ENTERING, EXITING.
 */
export class CharacterSystem {
  readonly brains: Brain[] = [];
  private taken = new Set<string>();

  constructor(ctx: ActorContext, private world: WorldModel) {
    world.data.employees.forEach((def, i) => {
      const agent = new Agent(ctx, { kind: 'employee', id: def.id }, def.uniform, def.look ?? i, def.spawn[0] + 0.5, def.spawn[1] + 0.5);
      this.brains.push({ def, agent, taskIndex: 0, phase: 'idle', timer: Math.random() * 2.5, activity: 'Aguardando', seat: null, face: null, act: { pose: 'stand', seated: false } });
    });
  }

  get(id: string) {
    return this.brains.find((b) => b.def.id === id);
  }

  /** Escolhe um assento livre no prédio (mesa, bancada, sofá...). */
  private pickSeat(b: Brain, buildingId: string): { at: Vec2; face: Brain['face']; act: Activity } | null {
    const seats = this.world.props.filter((p) => p.buildingId === buildingId && p.seat);
    if (!seats.length) return null;
    const start = this.brains.indexOf(b) % seats.length;
    for (let k = 0; k < seats.length; k++) {
      const p = seats[(start + k) % seats.length];
      const key = `${p.seat![0]},${p.seat![1]}`;
      if (!this.taken.has(key)) return { at: p.seat!, face: p.face ?? 'N', act: SEAT_ACTIVITY[p.type] ?? { pose: 'stand', seated: false } };
    }
    return null;
  }

  private target(b: Brain, t: Task): { at: Vec2; face: Brain['face']; act: Activity } | null {
    switch (t.type) {
      case 'work': {
        const m = this.world.machine(t.machineId);
        if (!m) return null;
        const ws = machineWorkSpot(m);
        const cx = m.rect.x + m.rect.w / 2;
        const cy = m.rect.y + m.rect.h / 2;
        const dx = cx - (ws[0] + 0.5);
        const dy = cy - (ws[1] + 0.5);
        return { at: ws, face: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N', act: MACHINE_ACTIVITY[m.kind] };
      }
      case 'enter':
        return this.pickSeat(b, t.buildingId);
      default:
        return { at: t.at, face: null, act: { pose: t.type === 'talk' ? 'talk' : 'wait', seated: false } };
    }
  }

  private describe(t: Task): string {
    switch (t.type) {
      case 'work':
        return `Trabalhando em ${this.world.machine(t.machineId)?.name ?? t.machineId}`;
      case 'enter':
        return `Trabalhando em ${this.world.building(t.buildingId)?.name ?? t.buildingId}`;
      case 'talk':
        return 'Conversando';
      case 'wait':
        return 'Aguardando';
    }
  }

  private release(b: Brain) {
    if (b.seat) this.taken.delete(`${b.seat[0]},${b.seat[1]}`);
    b.seat = null;
  }

  private start(b: Brain) {
    const task = b.def.tasks[b.taskIndex];
    const tgt = this.target(b, task);
    if (!tgt) return this.next(b);
    const goal: Vec2 = [tgt.at[0] + 0.5, tgt.at[1] + 0.5];
    const route = routeBetween(this.world.walk, [b.agent.x, b.agent.y], goal);
    if (!route) return this.next(b);
    this.release(b);
    if (task.type === 'enter') {
      b.seat = tgt.at;
      this.taken.add(`${tgt.at[0]},${tgt.at[1]}`);
    }
    b.face = tgt.face;
    b.act = tgt.act;
    b.agent.setPath([...route.slice(0, -1), goal]);
    b.agent.setIcon(null);
    b.phase = 'moving';
    b.activity = task.type === 'enter' ? `Indo para ${this.world.building(task.buildingId)?.name}` : `A caminho: ${this.describe(task)}`;
  }

  private next(b: Brain) {
    b.taskIndex = (b.taskIndex + 1) % b.def.tasks.length;
    b.phase = 'idle';
    b.timer = 0.6 + Math.random() * 1.4;
    b.agent.state = 'IDLE';
    b.agent.setIcon(null);
    b.activity = 'Parado';
  }

  private arrive(b: Brain) {
    const task = b.def.tasks[b.taskIndex];
    b.phase = 'acting';
    b.timer = task.duration;
    b.activity = this.describe(task);
    const a = b.agent;
    if (b.face) a.face(b.face);
    a.setActivity(b.act);
    switch (task.type) {
      case 'work':
      case 'enter':
        a.state = 'WORKING';
        a.setIcon(null); // a própria animação mostra o trabalho
        break;
      case 'talk':
        a.state = 'TALKING';
        a.setIcon('bubble');
        break;
      case 'wait':
        a.state = 'WAITING';
        break;
    }
  }

  /** Enquanto anda: ENTERING ao cruzar para dentro do prédio de destino, EXITING ao sair de um prédio. */
  private walkingState(b: Brain) {
    const task = b.def.tasks[b.taskIndex];
    const here = this.world.buildingAt(b.agent.x, b.agent.y);
    const dest = task.type === 'enter' ? task.buildingId : null;
    if (here && here.kind !== 'cobertura' && here.id !== dest) return 'EXITING' as const;
    if (dest && here?.id !== dest) {
      const bd = this.world.building(dest);
      if (bd && Math.abs(b.agent.x - (bd.rect.x + bd.rect.w / 2)) < bd.rect.w / 2 + 2 && Math.abs(b.agent.y - (bd.rect.y + bd.rect.h)) < 2.5) return 'ENTERING' as const;
    }
    return 'WALKING' as const;
  }

  update(dt: number) {
    for (const b of this.brains) {
      switch (b.phase) {
        case 'idle':
          b.timer -= dt;
          if (b.timer <= 0) this.start(b);
          break;
        case 'moving':
          if (!b.agent.moving) this.arrive(b);
          else b.agent.state = this.walkingState(b);
          break;
        case 'acting':
          b.timer -= dt;
          if (b.timer <= 0) this.next(b);
          break;
      }
      b.agent.update(dt);
    }
  }
}
