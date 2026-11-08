/**
 * Mobiliário procedural e determinístico dos prédios (puro, testável).
 * Prédio sem salas: arranjo pelo tipo do prédio. Prédio com salas: cada sala é mobiliada pelo
 * seu tipo (escritório, reunião, refeitório, TI...). Os assentos (seat) são os pontos onde os
 * funcionários trabalham ao "entrar" no prédio.
 */
import type { Building, Machine, Rect, RoomKind, Vec2 } from '../../types/world';
import { rectContains, rectsOverlap } from '../geometry';
import { interiorOf, isNorthDoor } from '../map/terrain';

export type PropType =
  | 'desk'
  | 'chair'
  | 'plant'
  | 'shelf'
  | 'cabinet'
  | 'cooler'
  | 'printer'
  | 'sofa'
  | 'coffeetable'
  | 'tvstand'
  | 'fridge'
  | 'counter'
  | 'table'
  | 'locker'
  | 'bench'
  | 'toolbench'
  | 'tires'
  | 'compressor'
  | 'drums'
  | 'pallet'
  | 'rack'
  | 'forklift'
  | 'rug'
  | 'liftbay'
  | 'gatedesk'
  | 'boxes'
  | 'meetingtable'
  | 'bin'
  | 'coatrack'
  | 'server'
  | 'labbench'
  | 'hood'
  | 'stove'
  | 'sink';

export interface Prop {
  id: string;
  buildingId: string;
  type: PropType;
  rect: Rect;
  block: boolean;
  /** Tile onde uma pessoa fica para usar o móvel (cadeira, frente da bancada...). */
  seat?: Vec2;
  /** Para onde a pessoa olha quando está no assento. */
  face?: 'N' | 'S' | 'E' | 'W';
  variant: number;
}

export type WallItemType = 'window' | 'clock' | 'board' | 'toolwall' | 'shelfwall' | 'tv' | 'sign' | 'poster';

export interface WallItem {
  buildingId: string;
  type: WallItemType;
  /** Coluna (tile) inicial na parede norte e largura em tiles. */
  x: number;
  w: number;
  variant: number;
}

export interface Interior {
  props: Prop[];
  wallItems: WallItem[];
}

const DIRS4: Vec2[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Estado compartilhado de um prédio: móveis, itens de parede e contador de ids. */
class Furnisher {
  readonly props: Prop[] = [];
  readonly items: WallItem[] = [];
  n = 0;
  constructor(readonly b: Building) {}

  wall(type: WallItemType, x: number, w: number, range?: [number, number]) {
    const lo = Math.max(this.b.rect.x + 1, range ? range[0] : -Infinity);
    const hi = Math.min(this.b.rect.x + this.b.rect.w - 1, range ? range[1] : Infinity);
    if (x < lo || x + w > hi) return;
    for (let c = x; c < x + w; c++) if (isNorthDoor(this.b, c)) return;
    if (this.items.some((i) => i.x < x + w && x < i.x + i.w)) return;
    this.items.push({ buildingId: this.b.id, type, x, w, variant: this.items.length });
  }

  windows(every = 3, range?: [number, number]) {
    const x0 = range ? range[0] : this.b.rect.x + 1;
    const x1 = range ? range[1] : this.b.rect.x + this.b.rect.w - 1;
    for (let c = x0; c + 2 <= x1; c += every) this.wall('window', c, 2, range);
  }
}

/** Posicionador numa área retangular (o interior inteiro ou uma sala). */
class Placer {
  private occ: Uint8Array;

  constructor(
    readonly F: Furnisher,
    readonly I: Rect,
    blocked: Rect[],
    doorTiles: Vec2[],
  ) {
    this.occ = new Uint8Array(I.w * I.h);
    for (const r of blocked) this.mark(r, 1);
    // corredor de 2 tiles para dentro, a partir de cada porta que encosta na área
    for (const [dx, dy] of doorTiles)
      for (const [ox, oy] of DIRS4) {
        const a: Vec2 = [dx + ox, dy + oy];
        if (!this.inside(a)) continue;
        this.mark({ x: a[0], y: a[1], w: 1, h: 1 }, 2);
        this.mark({ x: a[0] + ox, y: a[1] + oy, w: 1, h: 1 }, 2);
      }
  }

  get b() {
    return this.F.b;
  }

  private inside([x, y]: Vec2) {
    return rectContains(this.I, x + 0.5, y + 0.5);
  }

  private mark(r: Rect, v: number) {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const lx = x - this.I.x;
        const ly = y - this.I.y;
        if (lx < 0 || ly < 0 || lx >= this.I.w || ly >= this.I.h) continue;
        this.occ[ly * this.I.w + lx] = Math.max(this.occ[ly * this.I.w + lx], v);
      }
  }

  free(r: Rect): boolean {
    if (r.x < this.I.x || r.y < this.I.y || r.x + r.w > this.I.x + this.I.w || r.y + r.h > this.I.y + this.I.h) return false;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) if (this.occ[(y - this.I.y) * this.I.w + (x - this.I.x)]) return false;
    return true;
  }

  add(type: PropType, x: number, y: number, w: number, h: number, opts: { block?: boolean; seat?: Vec2; face?: Prop['face']; force?: boolean } = {}): Prop | null {
    const r = { x, y, w, h };
    const block = opts.block ?? true;
    if (!opts.force && !this.free(r)) return null;
    if (opts.seat && !this.free({ x: opts.seat[0], y: opts.seat[1], w: 1, h: 1 })) return null;
    const p: Prop = { id: `${this.b.id}:${type}:${this.F.n++}`, buildingId: this.b.id, type, rect: r, block, seat: opts.seat, face: opts.face, variant: this.F.n };
    this.F.props.push(p);
    if (block) this.mark(r, 1);
    if (opts.seat) this.mark({ x: opts.seat[0], y: opts.seat[1], w: 1, h: 1 }, 3);
    return p;
  }

  /** Cadeira solta que também é assento (pessoa sentada olhando para `face`). */
  chair(x: number, y: number, face: Prop['face']): Prop | null {
    if (!this.free({ x, y, w: 1, h: 1 })) return null;
    const p: Prop = { id: `${this.b.id}:chair:${this.F.n++}`, buildingId: this.b.id, type: 'chair', rect: { x, y, w: 1, h: 1 }, block: false, seat: [x, y], face, variant: this.F.n };
    this.F.props.push(p);
    this.mark(p.rect, 3);
    return p;
  }

  /** Item decorativo/rasteiro (não bloqueia, pode sobrepor livres). */
  flat(type: PropType, x: number, y: number, w: number, h: number) {
    this.F.props.push({ id: `${this.b.id}:${type}:${this.F.n++}`, buildingId: this.b.id, type, rect: { x, y, w, h }, block: false, variant: this.F.n });
  }

  /** Esta área encosta na parede norte do prédio (itens de parede ficam visíveis)? */
  get onNorthWall() {
    return this.I.y === interiorOf(this.b).y;
  }

  wall(type: WallItemType, x: number, w: number) {
    if (this.onNorthWall) this.F.wall(type, x, w, [this.I.x, this.I.x + this.I.w]);
  }

  windows(every = 3) {
    if (this.onNorthWall) this.F.windows(every, [this.I.x, this.I.x + this.I.w]);
  }
}

/** Mobília de uma área conforme o tipo de sala. */
function furnishRoom(P: Placer, kind: RoomKind) {
  const { I } = P;
  const L = I.x;
  const R = I.x + I.w - 1;
  const Tp = I.y;
  const B = I.y + I.h - 1;
  const midX = Math.floor((L + R) / 2);
  switch (kind) {
    case 'escritorio':
    case 'diretoria': {
      P.windows(3);
      P.wall('board', R - 2, 2);
      P.add('shelf', L, Tp, 2, 1);
      P.add('cabinet', R, Tp, 1, 1);
      if (kind === 'diretoria') {
        P.add('desk', midX - 1, Tp + 2, 3, 1, { seat: [midX, Tp + 3], face: 'N' });
        P.add('sofa', L, B, 2, 1);
        P.add('plant', R, B, 1, 1);
        P.flat('rug', midX - 1, B - 1, 3, 2);
        break;
      }
      P.add('printer', R - 1, Tp, 1, 1);
      // mesas voltadas para o norte (pessoa ao sul da mesa)
      for (let y = Tp + 1; y + 1 <= B; y += 3)
        for (let x = L; x + 1 <= R; x += 3) P.add('desk', x, y, 2, 1, { seat: [x, y + 1], face: 'N' });
      P.add('plant', L, B, 1, 1);
      P.add('plant', R, B, 1, 1);
      break;
    }
    case 'reuniao': {
      P.wall('tv', midX - 1, 2);
      P.windows(4);
      const tw = Math.max(2, Math.min(I.w - 4, 6));
      const tx = Math.floor(L + (I.w - tw) / 2);
      const ty = Tp + Math.max(1, Math.floor((I.h - 2) / 2));
      if (P.add('meetingtable', tx, ty, tw, 1)) {
        for (let x = tx; x < tx + tw; x += 2) {
          P.chair(x, ty - 1, 'S');
          P.chair(x + 1 < tx + tw ? x + 1 : x, ty + 1, 'N');
        }
      }
      P.add('plant', L, Tp, 1, 1);
      P.add('plant', R, B, 1, 1);
      P.add('cooler', R, Tp, 1, 1);
      break;
    }
    case 'recepcao': {
      P.windows(3);
      P.add('gatedesk', L, Tp + 1, Math.min(3, I.w), 1, { seat: [L + 1, Tp + 2], face: 'N' });
      P.add('plant', R, Tp, 1, 1);
      P.add('sofa', R - 1, B, 2, 1);
      break;
    }
    case 'refeitorio': {
      P.windows(3);
      P.wall('clock', R - 1, 1);
      // mesas de 3 lugares procurando espaço livre (desviando dos corredores das portas)
      for (let y = Tp + 1; y + 1 <= B; y += 2)
        for (let x = L; x + 2 <= R; x++) {
          if (!P.free({ x, y: y - 1, w: 3, h: 3 })) continue;
          P.add('meetingtable', x, y, 3, 1);
          P.chair(x, y - 1, 'S');
          P.chair(x + 2, y - 1, 'S');
          P.chair(x, y + 1, 'N');
          P.chair(x + 2, y + 1, 'N');
          x += 3;
        }
      P.add('cooler', R, B, 1, 1);
      P.add('plant', L, B, 1, 1);
      break;
    }
    case 'cozinha': {
      P.windows(4);
      P.add('stove', L, Tp, 2, 1, { seat: [L, Tp + 1], face: 'N' });
      P.add('sink', L + 2, Tp, 2, 1, { seat: [L + 2, Tp + 1], face: 'N' });
      P.add('counter', L + 4, Tp, 3, 1, { seat: [L + 5, Tp + 1], face: 'N' });
      P.add('fridge', R, Tp, 1, 1);
      P.add('counter', midX - 1, B, 3, 1);
      P.add('cabinet', R, B, 1, 1);
      break;
    }
    case 'vestiario': {
      P.wall('poster', L + 1, 1);
      for (let x = L; x <= R; x++) P.add('locker', x, Tp, 1, 1);
      P.add('bench', L + 1, Tp + 2, Math.min(3, I.w - 2), 1, { block: false, seat: [L + 2, Tp + 3], face: 'N' });
      P.add('sink', L, B, 2, 1);
      P.add('plant', R, B, 1, 1);
      break;
    }
    case 'ti': {
      P.wall('board', L + 1, 2);
      for (let x = L; x <= R && x < L + 3; x++) P.add('server', x, Tp, 1, 1);
      P.add('cabinet', R, Tp, 1, 1);
      for (let x = L; x + 1 <= R; x += 3) P.add('desk', x, B - 1, 2, 1, { seat: [x, B], face: 'N' });
      break;
    }
    case 'laboratorio': {
      P.windows(4);
      P.add('hood', L, Tp, 2, 1, { seat: [L, Tp + 1], face: 'N' });
      P.add('cabinet', L + 2, Tp, 1, 1);
      P.add('sink', R - 1, Tp, 2, 1);
      for (let y = Tp + 2; y + 1 <= B; y += 3)
        for (let x = L + 1; x + 2 <= R - 1; x += 5) P.add('labbench', x, y, 3, 1, { seat: [x + 1, y + 1], face: 'N' });
      P.add('desk', R - 1, B, 2, 1);
      P.add('shelf', L, B, 2, 1);
      break;
    }
    case 'almoxarifado': {
      P.windows(4);
      for (let x = L; x + 3 <= R; x += 5) for (let y = Tp; y + 1 <= B - 2; y += 3) P.add('rack', x, y, 4, 1);
      P.add('boxes', R, B, 1, 1);
      P.add('pallet', R - 1, B, 1, 1);
      P.add('desk', L, B - 1, 2, 1, { seat: [L, B], face: 'N' });
      break;
    }
    case 'descanso': {
      P.windows(3);
      P.wall('tv', L + 1, 2);
      P.add('tvstand', L, Tp, 3, 1);
      P.add('sofa', L, Tp + 3, 3, 1, { seat: [L + 1, Tp + 2], face: 'N' });
      P.add('coffeetable', L + 1, Tp + 2, 1, 1, { block: false });
      P.add('counter', R - 2, Tp, 3, 1, { seat: [R - 1, Tp + 1], face: 'N' });
      P.add('fridge', R, B, 1, 1);
      P.add('table', R - 2, B - 1, 2, 1, { seat: [R - 2, B], face: 'N' });
      P.add('plant', L, B, 1, 1);
      break;
    }
    case 'oficina': {
      P.wall('toolwall', L + 1, 4);
      for (let x = L; x + 2 <= R; x += 4) P.add('toolbench', x, Tp, 3, 1, { seat: [x + 1, Tp + 1], face: 'N' });
      P.add('tires', R, B, 1, 1);
      P.add('compressor', R - 1, B, 1, 1);
      break;
    }
  }
}

/**
 * Decoração depois do mobiliário principal: plantas nos cantos livres, lixeira ao lado das mesas,
 * cabideiro, tapete — deixa as salas densas como no padrão de referência.
 */
function decorate(P: Placer, kind: RoomKind) {
  const { I } = P;
  const L = I.x;
  const R = I.x + I.w - 1;
  const Tp = I.y;
  const B = I.y + I.h - 1;
  const office = kind === 'escritorio' || kind === 'diretoria' || kind === 'recepcao' || kind === 'ti' || kind === 'reuniao';
  for (const [x, y] of [[L, B], [R, B], [R, Tp], [L, Tp]] as Vec2[]) P.add('plant', x, y, 1, 1);
  if (office || kind === 'laboratorio') {
    for (const d of P.F.props.filter((p) => p.type === 'desk' && rectContains(I, p.rect.x + 0.5, p.rect.y + 0.5)))
      P.add('bin', d.rect.x + d.rect.w, d.rect.y + 1, 1, 1, { block: false });
    if (I.w >= 5) P.add('coatrack', R, Math.min(B, Tp + 1), 1, 1);
  }
  if ((office || kind === 'descanso') && I.w >= 6 && I.h >= 4 && !P.F.props.some((p) => p.type === 'rug' && rectContains(I, p.rect.x + 0.5, p.rect.y + 0.5)))
    P.flat('rug', L + Math.floor((I.w - Math.min(5, I.w - 2)) / 2), B - 1, Math.min(5, I.w - 2), 2);
  if (kind === 'vestiario' || kind === 'cozinha' || kind === 'refeitorio') P.add('bin', R, B, 1, 1);
}

/** Tiles de porta (externas e internas) que encostam numa área; portas norte contam pela linha de baixo. */
function doorTilesFor(b: Building): Vec2[] {
  const out: Vec2[] = [];
  for (const [dx, dy] of b.doors) out.push(dy === b.rect.y ? [dx, dy + 1] : [dx, dy]);
  for (const d of b.innerDoors ?? []) out.push(d);
  return out;
}

export function buildInterior(b: Building, machines: Machine[]): Interior {
  if (b.kind === 'cobertura') return { props: [], wallItems: [] };
  const I = interiorOf(b);
  const inside = machines.filter((m) => rectsOverlap(m.rect, b.rect));
  const blocked = inside.map((m) => ({ x: m.rect.x - 1, y: m.rect.y - 1, w: m.rect.w + 2, h: m.rect.h + 2 }));
  if (b.vehicleBay) blocked.push(b.vehicleBay);
  const F = new Furnisher(b);
  const doors = doorTilesFor(b);

  if (b.rooms && b.rooms.length > 0) {
    for (const rm of b.rooms) {
      const P = new Placer(F, rm.rect, blocked, doors);
      furnishRoom(P, rm.kind);
      decorate(P, rm.kind);
    }
  } else {
    const P = new Placer(F, I, blocked, doors);
    furnishBuilding(P, b);
    const asRoom: Partial<Record<Building['kind'], RoomKind>> = { escritorio: 'escritorio', laboratorio: 'laboratorio', refeitorio: 'refeitorio', descanso: 'descanso', apoio: 'vestiario', portaria: 'recepcao' };
    const rk = asRoom[b.kind];
    if (rk) decorate(P, rk);
  }
  // cadeiras nos assentos de mesas (a pessoa sentada fica "atrás" do encosto)
  for (const p of [...F.props])
    if ((p.type === 'desk' || p.type === 'gatedesk') && p.seat)
      F.props.push({ id: `${p.id}:cadeira`, buildingId: b.id, type: 'chair', rect: { x: p.seat[0], y: p.seat[1], w: 1, h: 1 }, block: false, variant: p.variant });
  return { props: F.props, wallItems: F.items };
}

/** Prédio de ambiente único: arranjo pelo tipo. */
function furnishBuilding(P: Placer, b: Building) {
  const { I } = P;
  const L = I.x;
  const R = I.x + I.w - 1;
  const Tp = I.y;
  const B = I.y + I.h - 1;
  switch (b.kind) {
    case 'escritorio':
      furnishRoom(P, 'escritorio');
      break;
    case 'laboratorio':
      furnishRoom(P, 'laboratorio');
      break;
    case 'refeitorio':
      furnishRoom(P, 'refeitorio');
      break;
    case 'descanso':
      furnishRoom(P, 'descanso');
      break;
    case 'apoio':
      furnishRoom(P, 'vestiario');
      break;
    case 'portaria': {
      P.windows(2);
      P.add('gatedesk', L, Tp, Math.min(3, I.w), 1, { seat: [L + 1, Tp + 1], face: 'N' });
      P.add('cabinet', R, B, 1, 1);
      P.add('plant', L, B, 1, 1);
      break;
    }
    case 'fabrica': {
      P.windows(4);
      P.wall('toolwall', L + 1, 3);
      P.wall('sign', R - 3, 3);
      P.add('drums', L, B, 1, 1);
      P.add('drums', L + 1, B, 1, 1);
      P.add('pallet', R, B, 1, 1);
      P.add('pallet', R - 1, B, 1, 1);
      // bancada e mesa de supervisão nos primeiros espaços livres (desviando das máquinas)
      let benches = 0;
      for (let y = Tp; y <= B - 1 && benches < 2; y++)
        for (let x = L; x + 2 <= R && benches < 2; x++) if (P.add('toolbench', x, y, 3, 1, { seat: [x + 1, y + 1], face: 'N' })) benches++;
      let desk = false;
      for (let y = B - 2; y >= Tp && !desk; y--)
        for (let x = R - 1; x >= L && !desk; x--) desk = !!P.add('desk', x, y, 2, 1, { seat: [x, y + 1], face: 'N' });
      P.add('cabinet', R, Tp, 1, 1);
      P.add('boxes', L, Tp + 3, 1, 1);
      break;
    }
    case 'galpao':
      furnishRoom(P, 'almoxarifado');
      P.add('forklift', R, B - 2, 1, 2, { seat: [R - 1, B - 1], face: 'E' });
      break;
    case 'manutencao': {
      P.windows(4);
      P.wall('toolwall', L + 1, 4);
      P.wall('clock', R - 2, 1);
      if (b.vehicleBay) P.flat('liftbay', b.vehicleBay.x, b.vehicleBay.y, b.vehicleBay.w, b.vehicleBay.h);
      for (let x = L; x + 2 <= R; x += 4) P.add('toolbench', x, Tp, 3, 1, { seat: [x + 1, Tp + 1], face: 'N' });
      P.add('tires', R, B, 1, 1);
      P.add('tires', R, B - 1, 1, 1);
      P.add('compressor', R - 1, B, 1, 1);
      P.add('drums', R, Tp + 2, 1, 1);
      for (let y = Tp + 2; y + 1 <= B - 2; y += 3) P.add('desk', R - 2, y, 2, 1, { seat: [R - 2, y + 1], face: 'N' });
      break;
    }
    case 'deposito': {
      P.windows(4);
      P.add('boxes', L, Tp, 1, 1);
      P.add('boxes', L + 1, Tp, 1, 1);
      P.add('pallet', R, Tp, 1, 1);
      P.add('drums', R, B, 1, 1);
      P.add('shelf', L + 3, Tp, 2, 1);
      P.add('table', L + 1, B - 1, 2, 1, { seat: [L + 1, B], face: 'N' });
      break;
    }
  }
}
