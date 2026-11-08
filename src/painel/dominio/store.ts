/**
 * Estado do painel: aplica movimentações e notifica a interface (compatível com useSyncExternalStore).
 * Independe de onde vêm os eventos (simulador hoje, API amanhã).
 */
import { aplicar } from './pedido';
import type { Movimentacao, Pedido } from './tipos';

export class PainelStore {
  private mapa = new Map<string, Pedido>();
  private lista: Pedido[] = [];
  private ouvintes = new Set<() => void>();
  private lote = 0;
  private sujo = false;

  constructor(readonly agora: () => number) {}

  aplicar(ev: Movimentacao) {
    const antes = this.mapa.get(ev.pedidoId);
    const depois = aplicar(antes, ev);
    if (!depois || depois === antes) return;
    this.mapa.set(depois.id, depois);
    this.sujo = true;
    if (!this.lote) this.emitir();
  }

  /** Aplica vários eventos notificando uma única vez. */
  aplicarVarios(evs: Movimentacao[]) {
    this.lote++;
    try {
      evs.forEach((e) => this.aplicar(e));
    } finally {
      this.lote--;
    }
    if (!this.lote && this.sujo) this.emitir();
  }

  /** Remove do painel um pedido encerrado (chamado quando o caminhão sai de cena). */
  descartar(id: string) {
    const p = this.mapa.get(id);
    if (!p || p.etapa !== 'ENCERRADO') return;
    this.mapa.delete(id);
    this.sujo = true;
    this.emitir();
  }

  get(id: string) {
    return this.mapa.get(id);
  }

  private emitir() {
    this.sujo = false;
    this.lista = [...this.mapa.values()].sort((a, b) => a.chegadaEm - b.chegadaEm || a.id.localeCompare(b.id));
    this.ouvintes.forEach((f) => f());
  }

  subscribe = (f: () => void) => {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  };

  getSnapshot = () => this.lista;
}
