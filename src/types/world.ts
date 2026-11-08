/**
 * Tipos de domínio do CBB Asfaltos Virtual (v0.3 — vista de cima 3/4).
 * Coordenadas em tiles de 16 px. Pedestres andam por CENTROS de tile; veículos andam
 * pelos VÉRTICES da grade (cantos), o que os centraliza nas faixas de 2 tiles.
 */
export type Vec2 = [number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** De onde veio a informação: marcada pelo usuário, vista na imagem aérea, ou criada para demonstração. */
export type DataOrigin = 'informado' | 'aerea' | 'demonstrativo';

export type MachineStatus = 'PARADA' | 'EM_FUNCIONAMENTO' | 'EM_MANUTENCAO' | 'COM_PROBLEMA';

export type CharacterState = 'IDLE' | 'WALKING' | 'WORKING' | 'TALKING' | 'WAITING' | 'ENTERING' | 'EXITING';

export type VehicleState =
  | 'ESTACIONADO'
  | 'EM_MOVIMENTO'
  | 'AGUARDANDO'
  | 'PESAGEM'
  | 'CARREGANDO'
  | 'DESCARREGANDO'
  | 'ABASTECENDO'
  | 'EM_MANUTENCAO'
  | 'FORA_DA_PLANTA';

/** Via reta: `points` = linha central (em vértices inteiros), `width` em tiles (4 = mão dupla). */
export interface Road {
  id: string;
  points: Vec2[];
  width: number;
}

export interface Containment {
  id: string;
  rect: Rect;
  /** Tiles da mureta abertos (escadas). */
  gaps: Vec2[];
}

export interface ParkingArea {
  id: string;
  rect: Rect;
  /** Direção em que os veículos ficam (separadores perpendiculares). */
  axis: 'x' | 'y';
  /** Distância entre vagas (tiles). */
  pitch: number;
}

export type TreeKind = 'round' | 'pine' | 'bush';

/** Calçada de pedestres (polilinha reta, largura em tiles). */
export interface Walkway {
  id: string;
  points: Vec2[];
  width: number;
}

export interface LayoutData {
  width: number;
  height: number;
  /** Retângulo envolvente da planta (câmera, testes). */
  boundary: Rect;
  /** Contorno real da planta (polígono em vértices de tile; pode ter lados diagonais). Sem ele, vale o retângulo. */
  perimeter?: Vec2[];
  /** Abertura no alambrado (tiles). */
  gate: Rect;
  avenue: Rect;
  /** Canteiro central da avenida: pista norte = sentido oeste, pista sul = sentido leste. */
  median?: Rect;
  sidewalks: Rect[];
  /** Caminhos de pedestres dentro da planta (os funcionários preferem andar por eles). */
  walkways?: Walkway[];
  lawns: Rect[];
  roads: Road[];
  crosswalks: Rect[];
  containments: Containment[];
  trees: { at: Vec2; kind: TreeKind }[];
  hedges: Rect[];
  lamps: Vec2[];
  benches: Vec2[];
  parking: ParkingArea[];
  signs: { at: Vec2; text: string }[];
}

export interface Zone {
  id: string;
  name: string;
  color: string;
  rects: Rect[];
  description: string;
  origin: DataOrigin;
}

export type BuildingKind =
  | 'portaria'
  | 'escritorio'
  | 'fabrica'
  | 'galpao'
  | 'manutencao'
  | 'descanso'
  | 'apoio'
  | 'deposito'
  | 'laboratorio'
  | 'refeitorio'
  | 'cobertura';

/** Tipo de sala (define o mobiliário). */
export type RoomKind =
  | 'escritorio'
  | 'diretoria'
  | 'reuniao'
  | 'recepcao'
  | 'refeitorio'
  | 'cozinha'
  | 'vestiario'
  | 'ti'
  | 'laboratorio'
  | 'almoxarifado'
  | 'oficina'
  | 'descanso';

/** Sala interna: área de piso dentro do prédio. O que sobra entre as salas vira divisória. */
export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  rect: Rect;
}

export type FloorKind = 'wood' | 'tile' | 'epoxy' | 'carpet' | 'concrete';

export interface Building {
  id: string;
  name: string;
  kind: BuildingKind;
  zoneId: string | null;
  /** Retângulo externo, incluindo paredes. A parede norte ocupa as 2 primeiras linhas. */
  rect: Rect;
  /** Tiles do perímetro que são portas. Porta na parede norte: informar a linha de cima (rect.y). */
  doors: Vec2[];
  /** Salas internas (opcional). Sem salas, o prédio é um ambiente único. */
  rooms?: Room[];
  /** Vãos nas divisórias entre salas. */
  innerDoors?: Vec2[];
  floor?: FloorKind;
  wall?: string;
  /** Área interna onde veículos podem entrar (oficina). */
  vehicleBay?: Rect;
  status?: MachineStatus;
  chimney?: boolean;
  origin: DataOrigin;
  description: string;
}

export type MachineKind =
  | 'tanque-vertical'
  | 'tanque-horizontal'
  | 'bomba'
  | 'bomba-diesel'
  | 'braco-carregamento'
  | 'balanca'
  | 'reator'
  | 'misturador'
  | 'caldeira'
  | 'painel';

export interface Machine {
  id: string;
  name: string;
  kind: MachineKind;
  zoneId: string;
  rect: Rect;
  status: MachineStatus;
  workSpot?: Vec2;
  walkable?: boolean;
  /** Para onde o braço de carregamento alcança (padrão: oeste). */
  facing?: GridDir;
  color?: string;
  info: Record<string, string>;
  origin: DataOrigin;
}

export type Uniform = 'operacional' | 'administrativo' | 'manutencao' | 'seguranca' | 'motorista' | 'visitante';

export type Task =
  | { type: 'work'; machineId: string; duration: number }
  | { type: 'enter'; buildingId: string; duration: number }
  | { type: 'talk'; at: Vec2; duration: number }
  | { type: 'wait'; at: Vec2; duration: number };

export interface Employee {
  id: string;
  name: string;
  role: string;
  zoneId: string;
  uniform: Uniform;
  spawn: Vec2;
  tasks: Task[];
  /** Variação de aparência (cabelo/pele). */
  look?: number;
  origin: DataOrigin;
}

export type VehicleKind = 'carreta-tanque' | 'caminhao' | 'carro';
export type GridDir = 'E' | 'W' | 'N' | 'S';

export interface VehicleDef {
  id: string;
  plate: string;
  kind: VehicleKind;
  company: string;
  color: string;
  /** Vaga (vértice). null = veículo externo (surge na avenida). */
  parked: Vec2 | null;
  dir: GridDir;
  flowId?: string;
  startDelay?: number;
  info: Record<string, string>;
  origin: DataOrigin;
}

export interface FlowStop {
  id: string;
  label: string;
  zoneId?: string;
  /** Vértice onde o veículo para. */
  at: Vec2;
  /** Pontos de passagem (invisíveis) antes de chegar aqui — para seguir o circuito do pátio. */
  via?: Vec2[];
  wait: number;
  state: VehicleState;
}

export interface Flow {
  id: string;
  name: string;
  color: string;
  origin: DataOrigin;
  note: string;
  ambient?: boolean;
  spawn?: Vec2;
  despawn?: Vec2;
  stops: FlowStop[];
  /** Pontos de passagem da última perna (volta para a vaga ou saída). */
  returnVia?: Vec2[];
  interval: number;
  counter?: 'expedicoes' | 'recebimentos' | 'abastecimentos' | 'manutencoes';
}

export interface MaterialFlow {
  id: string;
  name: string;
  color: string;
  origin: DataOrigin;
  note: string;
  points: Vec2[];
}

export interface WorldData {
  layout: LayoutData;
  zones: Zone[];
  buildings: Building[];
  machines: Machine[];
  employees: Employee[];
  vehicles: VehicleDef[];
  flows: Flow[];
  materials: MaterialFlow[];
}

export type EntityKind = 'building' | 'machine' | 'vehicle' | 'employee' | 'zone';

export interface EntityRef {
  kind: EntityKind;
  id: string;
}
