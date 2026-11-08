/**
 * Fonte de movimentações SIMULADA. Gera roteiros realistas (montagem, carregamento, balança,
 * eventual divergência de peso, notas fiscais com eventual rejeição) e os despacha num relógio
 * acelerado. Será substituída pela fonte da API sem que o restante do painel mude.
 */
import { rng } from '../../game/art/core/pixbuf';
import type { PainelStore } from '../dominio/store';
import type { Movimentacao, TipoNota } from '../dominio/tipos';
import { chaveAcesso, gerarCarga, numeroNota } from './dadosFicticios';
import type { FonteMovimentacoes } from './fonte';

const MIN = 60_000;
export type Marco = 'chegada' | 'montado' | 'carga' | 'fimCarga' | 'pesagem' | 'notas' | 'viagem' | 'fim';

export interface OpcoesRoteiro {
  divergente?: boolean;
  notaRejeitada?: boolean;
}

export interface Roteiro {
  eventos: Movimentacao[];
  marcos: Record<Marco, number>;
}

/** Roteiro completo de um pedido a partir de `inicio` (ms). Puro, dado o gerador. */
export function roteiro(r: () => number, seq: number, inicio: number, op: OpcoesRoteiro = {}): Roteiro {
  const id = `P${seq}`;
  const carga = gerarCarga(r, seq, inicio);
  const qtd = carga.pedido.quantidadeKg;
  const tara = carga.veiculo.taraKg;
  const ev: Movimentacao[] = [];
  const marcos = {} as Record<Marco, number>;
  let t = inicio;

  marcos.chegada = t;
  ev.push({ tipo: 'VEICULO_CHEGOU', pedidoId: id, em: t, ...carga });
  t += (10 + r() * 12) * MIN;
  marcos.montado = t;
  ev.push({ tipo: 'PEDIDO_MONTADO', pedidoId: id, em: t });

  const carregar = (deKg: number, ateKg: number, minutos: number) => {
    ev.push({ tipo: 'CARREGAMENTO_INICIADO', pedidoId: id, em: t });
    const n = Math.max(2, Math.round(minutos));
    for (let i = 1; i < n; i++) {
      ev.push({ tipo: 'CARREGAMENTO_PROGRESSO', pedidoId: id, em: t + (i * minutos * MIN) / n, carregadoKg: Math.round(deKg + ((ateKg - deKg) * i) / n) });
    }
    t += minutos * MIN;
    ev.push({ tipo: 'CARREGAMENTO_CONCLUIDO', pedidoId: id, em: t, carregadoKg: ateKg });
  };
  const pesar = (liquido: number) => {
    t += 3 * MIN;
    ev.push({ tipo: 'PESAGEM', pedidoId: id, em: t, taraKg: tara, brutoKg: tara + liquido });
  };

  t += (2 + r() * 2) * MIN;
  marcos.carga = t;
  const primeira = op.divergente ? Math.round(qtd * (0.9 + r() * 0.04)) : qtd;
  carregar(0, primeira, 16 + r() * 8);
  marcos.fimCarga = t;
  pesar(primeira + Math.round((r() - 0.5) * 60));
  marcos.pesagem = t;

  if (op.divergente) {
    t += 4 * MIN;
    carregar(primeira, qtd, 5);
    pesar(qtd + Math.round((r() - 0.5) * 60));
  }

  marcos.notas = t;
  const nota = (tipo: TipoNota, rejeitar: boolean) => {
    t += 0.8 * MIN;
    ev.push({ tipo: 'NOTA', pedidoId: id, em: t, nota: tipo, status: 'EMITINDO' });
    t += (1.6 + r()) * MIN;
    if (rejeitar) {
      ev.push({ tipo: 'NOTA', pedidoId: id, em: t, nota: tipo, status: 'REJEITADA', motivo: 'Rejeição 539: duplicidade de NF-e com diferença na chave' });
      t += 3 * MIN;
      ev.push({ tipo: 'NOTA', pedidoId: id, em: t, nota: tipo, status: 'EMITINDO' });
      t += 1.5 * MIN;
    }
    ev.push({ tipo: 'NOTA', pedidoId: id, em: t, nota: tipo, status: 'AUTORIZADA', numero: numeroNota(r), chave: chaveAcesso(r) });
  };
  nota('NFe', !!op.notaRejeitada);
  nota('CTe', false);
  nota('MDFe', false);
  marcos.viagem = t;
  t += 14 * MIN;
  marcos.fim = t;
  ev.push({ tipo: 'ENCERRADO', pedidoId: id, em: t });
  return { eventos: ev, marcos };
}

export class Simulador implements FonteMovimentacoes {
  readonly nome = 'Simulação (dados fictícios)';
  readonly simulada = true;
  /** 1 s real = ESCALA s simulados (com velocidade 1x). */
  static ESCALA = 30;
  static ATIVOS = 6;

  tempo: number;
  velocidade = 1;
  pausado = false;
  private fila: Movimentacao[] = [];
  private r: () => number;
  private seq = 4810;
  private store?: PainelStore;
  private proximaChegada = 0;
  private abertos = new Set<string>();

  constructor(seed = 20261108, inicio = Date.now()) {
    this.r = rng(seed);
    this.tempo = inicio;
  }

  agora = () => this.tempo;

  conectar(store: PainelStore) {
    this.store = store;
    this.semear();
    let ultimo = performance.now();
    const id = setInterval(() => {
      const t = performance.now();
      this.avancar(t - ultimo);
      ultimo = t;
    }, 100);
    return () => clearInterval(id);
  }

  /** Avança o relógio simulado em `realMs` de tempo real. */
  avancar(realMs: number) {
    if (this.pausado) return;
    this.tempo += realMs * Simulador.ESCALA * this.velocidade;
    this.despachar();
    if (this.tempo >= this.proximaChegada && this.abertos.size < Simulador.ATIVOS) {
      this.novoPedido();
    }
  }

  novoPedido(op?: OpcoesRoteiro, atrasoMs = 0) {
    const opcoes = op ?? { divergente: this.r() < 0.22, notaRejeitada: this.r() < 0.12 };
    const ro = roteiro(this.r, ++this.seq, this.tempo + atrasoMs, opcoes);
    this.agendar(ro.eventos);
    this.proximaChegada = this.tempo + (7 + this.r() * 8) * MIN;
    return ro;
  }

  private agendar(evs: Movimentacao[]) {
    evs.forEach((e) => this.abertos.add(e.pedidoId));
    this.fila.push(...evs);
    this.fila.sort((a, b) => a.em - b.em);
    this.despachar();
  }

  private despachar() {
    if (!this.store) return;
    const prontos: Movimentacao[] = [];
    while (this.fila.length && this.fila[0].em <= this.tempo) prontos.push(this.fila.shift()!);
    if (!prontos.length) return;
    prontos.forEach((e) => e.tipo === 'ENCERRADO' && this.abertos.delete(e.pedidoId));
    this.store.aplicarVarios(prontos);
  }

  /** Cenário inicial: um caminhão em cada ponto do fluxo (inclui uma divergência a caminho). */
  private semear() {
    const cenas: [Marco, number, OpcoesRoteiro][] = [
      ['viagem', 4 * MIN, {}],
      ['notas', 2.2 * MIN, { notaRejeitada: true }],
      ['fimCarga', -1.2 * MIN, { divergente: true }],
      ['carga', 7 * MIN, {}],
      ['chegada', 4 * MIN, {}],
    ];
    for (const [marco, apos, op] of cenas) {
      // gera a partir de "agora" (validades de documentos coerentes) e depois desloca no tempo
      const ro = roteiro(this.r, ++this.seq, this.tempo, op);
      const desloc = this.tempo - (ro.marcos[marco] + apos);
      this.agendar(ro.eventos.map((e) => ({ ...e, em: e.em + desloc })));
    }
    this.novoPedido({}, 0.4 * MIN);
  }
}
