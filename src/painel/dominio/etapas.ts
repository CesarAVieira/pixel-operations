import type { Etapa } from './tipos';

export type Setor = 'Comercial' | 'Logística' | 'Fábrica' | 'Expedição' | 'Concluído';
export type Coluna = 'preparo' | 'carregamento' | 'expedicao';

export interface InfoEtapa {
  rotulo: string;
  setor: Setor;
  coluna: Coluna;
  /** 0 preparo · 1 carregamento · 2 expedição · 3 viagem */
  passo: number;
  alerta?: boolean;
  ok?: boolean;
}

export const ETAPAS: Record<Etapa, InfoEtapa> = {
  AGUARDANDO_MONTAGEM: { rotulo: 'Montando o pedido', setor: 'Comercial', coluna: 'preparo', passo: 0 },
  PEDIDO_MONTADO: { rotulo: 'Pedido montado · liberado p/ carregar', setor: 'Logística', coluna: 'preparo', passo: 0 },
  CARREGANDO: { rotulo: 'Carregando asfalto', setor: 'Fábrica', coluna: 'carregamento', passo: 1 },
  AGUARDANDO_PESAGEM: { rotulo: 'Aguardando pesagem', setor: 'Expedição', coluna: 'expedicao', passo: 2 },
  PESO_DIVERGENTE: { rotulo: 'Peso divergente · voltar à fábrica', setor: 'Expedição', coluna: 'expedicao', passo: 2, alerta: true },
  EMITINDO_NOTAS: { rotulo: 'Emitindo notas fiscais', setor: 'Expedição', coluna: 'expedicao', passo: 2 },
  EM_VIAGEM: { rotulo: 'Notas autorizadas · em viagem', setor: 'Concluído', coluna: 'expedicao', passo: 3, ok: true },
  ENCERRADO: { rotulo: 'Encerrado', setor: 'Concluído', coluna: 'expedicao', passo: 3, ok: true },
};

export const SETORES: Setor[] = ['Comercial', 'Logística', 'Fábrica', 'Expedição', 'Concluído'];
export const PASSOS = ['Preparo', 'Carregamento', 'Expedição', 'Viagem'];
