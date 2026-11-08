/**
 * Reducer puro: aplica uma movimentação ao pedido e devolve o novo estado (imutável).
 * Toda regra de negócio do fluxo mora aqui (etapas, tolerância da balança, notas).
 */
import { TIPOS_NOTA, type Etapa, type Movimentacao, type Nota, type Pedido, type Pesagem, type TipoNota } from './tipos';

/** Tolerância da balança: o maior entre 0,5% do pedido e 100 kg. */
export const TOLERANCIA = { percentual: 0.005, minimoKg: 100 };
export const toleranciaKg = (esperadoKg: number) => Math.max(TOLERANCIA.minimoKg, esperadoKg * TOLERANCIA.percentual);

export const fmtKg = (kg: number) => `${(kg / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`;

const notasIniciais = (): Record<TipoNota, Nota> => ({
  NFe: { tipo: 'NFe', status: 'PENDENTE' },
  CTe: { tipo: 'CTe', status: 'PENDENTE' },
  MDFe: { tipo: 'MDFe', status: 'PENDENTE' },
});

function comEtapa(p: Pedido, etapa: Etapa, em: number): Pedido {
  return p.etapa === etapa ? p : { ...p, etapa, etapaDesde: em };
}

function hist(p: Pedido, ev: Movimentacao, texto: string, alerta = false): Pedido {
  return { ...p, historico: [...p.historico, { em: ev.em, tipo: ev.tipo, texto, alerta }] };
}

export function aplicar(atual: Pedido | undefined, ev: Movimentacao): Pedido | undefined {
  if (ev.tipo === 'VEICULO_CHEGOU') {
    if (atual) return atual; // idempotente
    const p: Pedido = {
      id: ev.pedidoId,
      dados: ev.pedido,
      veiculo: ev.veiculo,
      motorista: ev.motorista,
      etapa: 'AGUARDANDO_MONTAGEM',
      etapaDesde: ev.em,
      chegadaEm: ev.em,
      carregadoKg: 0,
      pesagens: [],
      notas: notasIniciais(),
      retornos: 0,
      historico: [],
    };
    return hist(p, ev, `Veículo ${ev.veiculo.placaCavalo} chegou ao pátio · motorista ${ev.motorista.nome}`);
  }
  if (!atual || atual.etapa === 'ENCERRADO') return atual;
  let p = atual;

  switch (ev.tipo) {
    case 'PEDIDO_MONTADO':
      p = comEtapa(p, 'PEDIDO_MONTADO', ev.em);
      return hist(p, ev, 'Pedido montado · motorista liberado para o carregamento');

    case 'CARREGAMENTO_INICIADO': {
      const retorno = p.etapa === 'PESO_DIVERGENTE';
      p = comEtapa(p, 'CARREGANDO', ev.em);
      if (retorno) p = { ...p, retornos: p.retornos + 1 };
      return hist(p, ev, retorno ? 'Retorno à fábrica · complemento de carga iniciado' : 'Carregamento iniciado');
    }

    case 'CARREGAMENTO_PROGRESSO':
      // progresso não gera histórico (seria ruído); só atualiza a quantidade
      return { ...comEtapa(p, 'CARREGANDO', p.etapa === 'CARREGANDO' ? p.etapaDesde : ev.em), carregadoKg: ev.carregadoKg };

    case 'CARREGAMENTO_CONCLUIDO':
      p = { ...comEtapa(p, 'AGUARDANDO_PESAGEM', ev.em), carregadoKg: ev.carregadoKg };
      return hist(p, ev, `Carregamento concluído · ${fmtKg(ev.carregadoKg)}`);

    case 'PESAGEM': {
      const esperadoKg = p.dados.quantidadeKg;
      const liquidoKg = ev.brutoKg - ev.taraKg;
      const diferencaKg = liquidoKg - esperadoKg;
      const ok = Math.abs(diferencaKg) <= toleranciaKg(esperadoKg);
      const pes: Pesagem = { em: ev.em, brutoKg: ev.brutoKg, taraKg: ev.taraKg, liquidoKg, esperadoKg, diferencaKg, ok };
      p = { ...comEtapa(p, ok ? 'EMITINDO_NOTAS' : 'PESO_DIVERGENTE', ev.em), pesagens: [...p.pesagens, pes] };
      return ok
        ? hist(p, ev, `Pesagem OK · líquido ${fmtKg(liquidoKg)}`)
        : hist(p, ev, `Peso divergente · líquido ${fmtKg(liquidoKg)} de ${fmtKg(esperadoKg)} (${diferencaKg > 0 ? '+' : ''}${Math.round(diferencaKg)} kg)`, true);
    }

    case 'NOTA': {
      const nota: Nota = { ...p.notas[ev.nota], status: ev.status, em: ev.em, motivo: ev.motivo };
      if (ev.numero) nota.numero = ev.numero;
      if (ev.chave) nota.chave = ev.chave;
      const notas = { ...p.notas, [ev.nota]: nota };
      p = { ...p, notas };
      const todas = TIPOS_NOTA.every((t) => notas[t].status === 'AUTORIZADA');
      p = comEtapa(p, todas ? 'EM_VIAGEM' : p.etapa === 'AGUARDANDO_PESAGEM' ? 'EMITINDO_NOTAS' : p.etapa, ev.em);
      const txt: Record<string, string> = {
        EMITINDO: `${ev.nota} em emissão`,
        AUTORIZADA: `${ev.nota} autorizada${ev.numero ? ` nº ${ev.numero}` : ''}`,
        REJEITADA: `${ev.nota} rejeitada${ev.motivo ? ` · ${ev.motivo}` : ''}`,
        PENDENTE: `${ev.nota} pendente`,
      };
      p = hist(p, ev, txt[ev.status], ev.status === 'REJEITADA');
      return todas ? hist(p, ev, 'Todas as notas autorizadas no eDocs · liberado para viagem') : p;
    }

    case 'ENCERRADO':
      p = comEtapa(p, 'ENCERRADO', ev.em);
      return hist(p, ev, 'Viagem registrada · pedido encerrado no painel');
  }
}

/** Fração carregada (0..1) em relação ao pedido. */
export const fracaoCarga = (p: Pedido) => Math.max(0, Math.min(1.05, p.carregadoKg / p.dados.quantidadeKg));

export const ultimaPesagem = (p: Pedido): Pesagem | undefined => p.pesagens[p.pesagens.length - 1];

export const notaRejeitada = (p: Pedido) => TIPOS_NOTA.some((t) => p.notas[t].status === 'REJEITADA');
