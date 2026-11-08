/**
 * Modelo de domínio do Painel de Pedidos.
 *
 * O painel é alimentado por MOVIMENTAÇÕES (eventos) — exatamente o que a API da empresa deverá
 * entregar. O estado de cada pedido (etapa, carga, pesagens, notas) é sempre DERIVADO desses eventos
 * pelo reducer em `pedido.ts`; a animação apenas persegue esse estado.
 */

export type TipoNota = 'NFe' | 'CTe' | 'MDFe';
export const TIPOS_NOTA: readonly TipoNota[] = ['NFe', 'CTe', 'MDFe'];
export type StatusNota = 'PENDENTE' | 'EMITINDO' | 'AUTORIZADA' | 'REJEITADA';

export interface Nota {
  tipo: TipoNota;
  status: StatusNota;
  numero?: string;
  chave?: string;
  motivo?: string;
  em?: number;
}

export interface DocumentoVeiculo {
  sigla: string;
  nome: string;
  numero: string;
  /** Data ISO (aaaa-mm-dd). */
  validade: string;
}

export interface Veiculo {
  placaCavalo: string;
  placaReboque: string;
  modelo: string;
  tipo: string;
  transportadora: string;
  capacidadeKg: number;
  taraKg: number;
  /** Cor da cabine (só para o desenho). */
  corCabine: string;
  /** Frota própria CBB (desenhada com a pintura da empresa) ou transportadora terceira. */
  frotaPropria: boolean;
  documentos: DocumentoVeiculo[];
}

export interface Motorista {
  nome: string;
  cpf: string;
  telefone: string;
  cnh: { numero: string; categoria: string; validade: string };
  mopp: { validade: string };
}

export interface DadosPedido {
  numero: string;
  cliente: { nome: string; cnpj: string };
  produto: string;
  quantidadeKg: number;
  destino: { cidade: string; uf: string };
  temperaturaC?: number;
}

/** Movimentações do fluxo (contrato proposto para a API). `em` = epoch em ms. */
export type Movimentacao =
  | { tipo: 'VEICULO_CHEGOU'; pedidoId: string; em: number; pedido: DadosPedido; veiculo: Veiculo; motorista: Motorista }
  | { tipo: 'PEDIDO_MONTADO'; pedidoId: string; em: number }
  | { tipo: 'CARREGAMENTO_INICIADO'; pedidoId: string; em: number }
  | { tipo: 'CARREGAMENTO_PROGRESSO'; pedidoId: string; em: number; carregadoKg: number }
  | { tipo: 'CARREGAMENTO_CONCLUIDO'; pedidoId: string; em: number; carregadoKg: number }
  | { tipo: 'PESAGEM'; pedidoId: string; em: number; brutoKg: number; taraKg: number }
  | { tipo: 'NOTA'; pedidoId: string; em: number; nota: TipoNota; status: StatusNota; numero?: string; chave?: string; motivo?: string }
  | { tipo: 'ENCERRADO'; pedidoId: string; em: number };

export type TipoMovimentacao = Movimentacao['tipo'];

export type Etapa =
  | 'AGUARDANDO_MONTAGEM'
  | 'PEDIDO_MONTADO'
  | 'CARREGANDO'
  | 'AGUARDANDO_PESAGEM'
  | 'PESO_DIVERGENTE'
  | 'EMITINDO_NOTAS'
  | 'EM_VIAGEM'
  | 'ENCERRADO';

export interface Pesagem {
  em: number;
  brutoKg: number;
  taraKg: number;
  liquidoKg: number;
  esperadoKg: number;
  diferencaKg: number;
  ok: boolean;
}

export interface EventoHistorico {
  em: number;
  tipo: TipoMovimentacao;
  texto: string;
  alerta?: boolean;
}

export interface Pedido {
  id: string;
  dados: DadosPedido;
  veiculo: Veiculo;
  motorista: Motorista;
  etapa: Etapa;
  etapaDesde: number;
  chegadaEm: number;
  carregadoKg: number;
  pesagens: Pesagem[];
  notas: Record<TipoNota, Nota>;
  retornos: number;
  historico: EventoHistorico[];
}
