/**
 * Monta a ficha de informações de qualquer entidade selecionada.
 * Fonte: dados demonstrativos + estado vivo da simulação (Snapshot).
 */
import type { DataOrigin, EntityRef, MachineStatus, WorldData } from '../types/world';
import type { Snapshot } from './eventBus';

export const ORIGIN_LABEL: Record<DataOrigin, string> = {
  informado: 'Informado',
  aerea: 'Imagem aérea',
  demonstrativo: 'Demonstrativo',
};

export const VEHICLE_STATE_LABEL: Record<string, string> = {
  ESTACIONADO: 'Estacionado',
  EM_MOVIMENTO: 'Em movimento',
  AGUARDANDO: 'Aguardando',
  PESAGEM: 'Em pesagem',
  CARREGANDO: 'Carregando',
  DESCARREGANDO: 'Descarregando',
  ABASTECENDO: 'Abastecendo',
  EM_MANUTENCAO: 'Em manutenção',
  FORA_DA_PLANTA: 'Fora da planta',
};

export const CHAR_STATE_LABEL: Record<string, string> = {
  IDLE: 'Parado',
  WALKING: 'Caminhando',
  WORKING: 'Trabalhando',
  TALKING: 'Conversando',
  WAITING: 'Aguardando',
  ENTERING: 'Entrando',
  EXITING: 'Saindo',
};

export interface InfoCard {
  title: string;
  subtitle: string;
  origin: DataOrigin;
  status?: MachineStatus;
  fields: [string, string][];
  description?: string;
  related?: { label: string; items: { ref: EntityRef; name: string }[] }[];
}

export function describeEntity(ref: EntityRef, d: WorldData, snap: Snapshot | null): InfoCard | null {
  switch (ref.kind) {
    case 'machine': {
      const m = d.machines.find((x) => x.id === ref.id);
      if (!m) return null;
      const zone = d.zones.find((z) => z.id === m.zoneId);
      return {
        title: m.name,
        subtitle: zone?.name ?? '',
        origin: m.origin,
        status: snap?.machines[m.id] ?? m.status,
        fields: [['Identificação', m.id], ...Object.entries(m.info)],
      };
    }
    case 'building': {
      const b = d.buildings.find((x) => x.id === ref.id);
      if (!b) return null;
      const zone = b.zoneId ? d.zones.find((z) => z.id === b.zoneId) : null;
      const machines = b.zoneId ? d.machines.filter((m) => m.zoneId === b.zoneId) : [];
      const people = b.zoneId ? d.employees.filter((e) => e.zoneId === b.zoneId) : [];
      return {
        title: b.name,
        subtitle: zone?.name ?? 'Sem setor definido',
        origin: b.origin,
        status: b.status,
        description: b.description,
        fields: [
          ['Funcionários no setor', String(people.length)],
          ['Equipamentos no setor', String(machines.length)],
        ],
        related: [
          { label: 'Equipamentos', items: machines.map((m) => ({ ref: { kind: 'machine', id: m.id }, name: m.name })) },
          { label: 'Funcionários', items: people.map((e) => ({ ref: { kind: 'employee', id: e.id }, name: `${e.name} — ${e.role}` })) },
        ].filter((r) => r.items.length) as InfoCard['related'],
      };
    }
    case 'vehicle': {
      const v = d.vehicles.find((x) => x.id === ref.id);
      if (!v) return null;
      const live = snap?.vehicles[v.id];
      const flow = v.flowId ? d.flows.find((f) => f.id === v.flowId) : null;
      return {
        title: `${v.kind === 'carro' ? 'Carro' : v.kind === 'caminhao' ? 'Caminhão' : 'Carreta-tanque'} ${v.plate}`,
        subtitle: v.company,
        origin: v.origin,
        fields: [
          ['Estado', live ? VEHICLE_STATE_LABEL[live.state] ?? live.state : '—'],
          ['Destino / etapa', live?.label ?? '—'],
          ['Fluxo', flow?.name ?? 'Sem fluxo (estacionado)'],
          ...Object.entries(v.info),
        ],
      };
    }
    case 'employee': {
      const e = d.employees.find((x) => x.id === ref.id);
      if (!e) return null;
      const live = snap?.employees[e.id];
      const zone = d.zones.find((z) => z.id === e.zoneId);
      return {
        title: e.name,
        subtitle: `${e.role} · personagem fictício`,
        origin: e.origin,
        fields: [
          ['Setor', zone?.name ?? '—'],
          ['Estado', live ? CHAR_STATE_LABEL[live.state] ?? live.state : '—'],
          ['Atividade', live?.activity ?? '—'],
        ],
      };
    }
    case 'zone': {
      const z = d.zones.find((x) => x.id === ref.id);
      if (!z) return null;
      const buildings = d.buildings.filter((b) => b.zoneId === z.id);
      const machines = d.machines.filter((m) => m.zoneId === z.id);
      const people = d.employees.filter((e) => e.zoneId === z.id);
      return {
        title: z.name,
        subtitle: 'Setor / área',
        origin: z.origin,
        description: z.description,
        fields: [
          ['Edificações', String(buildings.length)],
          ['Equipamentos', String(machines.length)],
          ['Funcionários', String(people.length)],
        ],
        related: [
          { label: 'Edificações', items: buildings.map((b) => ({ ref: { kind: 'building', id: b.id }, name: b.name })) },
          { label: 'Equipamentos', items: machines.map((m) => ({ ref: { kind: 'machine', id: m.id }, name: m.name })) },
        ].filter((r) => r.items.length) as InfoCard['related'],
      };
    }
    default:
      return null;
  }
}
