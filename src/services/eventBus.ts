/**
 * Barramento de eventos tipado entre a interface React e a cena Phaser.
 * Nenhum dos lados importa o outro diretamente: tudo passa por aqui.
 */
import type { EntityRef, MachineStatus, VehicleState, CharacterState } from '../types/world';

export type ViewMode = 'livre' | 'operacional';

export interface Counters {
  expedicoes: number;
  recebimentos: number;
  abastecimentos: number;
  manutencoes: number;
}

export interface Snapshot {
  time: number;
  vehicles: Record<string, { state: VehicleState; label: string; inside: boolean; visible: boolean }>;
  employees: Record<string, { state: CharacterState; activity: string }>;
  machines: Record<string, MachineStatus>;
  counters: Counters;
}

export interface LogEntry {
  id: number;
  time: number;
  text: string;
  kind: 'sistema' | 'veiculo' | 'equipamento' | 'usuario' | 'area';
  author?: string;
}

export interface BusEvents {
  'cmd:zoom': 1 | -1;
  'cmd:center': void;
  'cmd:fit': void;
  'cmd:focus': EntityRef;
  'cmd:mode': ViewMode;
  'cmd:flows': string[];
  'cmd:select': EntityRef | null;
  'cmd:machineStatus': { id: string; status: MachineStatus };
  'cmd:daymode': 'auto' | 'dia' | 'noite';
  'game:clock': { hour: number; dark: number; mode: 'auto' | 'dia' | 'noite' };
  'game:ready': void;
  'game:select': EntityRef | null;
  'game:hover': { ref: EntityRef; name: string } | null;
  'game:snapshot': Snapshot;
  'game:log': Omit<LogEntry, 'id' | 'time'>;
  'game:zoom': number;
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(key: K, fn: Handler<E[K]>): () => void {
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(fn as Handler<never>);
    return () => this.off(key, fn);
  }

  off<K extends keyof E>(key: K, fn: Handler<E[K]>) {
    this.handlers.get(key)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(key: K, ...payload: E[K] extends void ? [] : [E[K]]) {
    const set = this.handlers.get(key);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<unknown>)(payload[0]);
  }

  clear() {
    this.handlers.clear();
  }
}

/**
 * Instância única global: sobrevive ao hot reload do Vite (BUG-003 — após HMR existiam
 * duas instâncias do barramento e os comandos da interface não chegavam à cena).
 */
const g = globalThis as unknown as { __cbbBus?: EventBus<BusEvents> };
export const bus: EventBus<BusEvents> = (g.__cbbBus ??= new EventBus<BusEvents>());
