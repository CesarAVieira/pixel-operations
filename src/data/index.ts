/**
 * Ponto único de acesso aos dados demonstrativos.
 * Hoje lê JSON locais; no futuro, este é o lugar para trocar por um serviço de API
 * (ver services/dataSource.ts e a nota DADOS-E-SEGURANCA no Obsidian).
 */
import type { Building, Employee, Flow, LayoutData, Machine, MaterialFlow, VehicleDef, WorldData, Zone } from '../types/world';
import layout from './layout.json';
import zones from './zones.json';
import buildings from './buildings.json';
import machines from './machines.json';
import employees from './employees.json';
import vehicles from './vehicles.json';
import flows from './flows.json';

/** Dados em coordenadas de autoria (como estão nos JSON). */
export function rawWorldData(): WorldData {
  return {
    layout: layout as unknown as LayoutData,
    zones: zones as unknown as Zone[],
    buildings: buildings as unknown as Building[],
    machines: machines as unknown as Machine[],
    employees: employees as unknown as Employee[],
    vehicles: vehicles as unknown as VehicleDef[],
    flows: flows.flows as unknown as Flow[],
    materials: flows.materials as unknown as MaterialFlow[],
  };
}

/** Dados prontos para o jogo. Sempre uma cópia nova (os JSON já estão em coordenadas de jogo). */
export function loadWorldData(): WorldData {
  return structuredClone(rawWorldData());
}

let cached: WorldData | null = null;
/** Instância compartilhada (jogo + interface leem os mesmos dados). */
export function getWorldData(): WorldData {
  if (!cached) cached = loadWorldData();
  return cached;
}
