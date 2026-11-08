/** Geometria da faixa de cada pedido (pixels lógicos; a faixa é ampliada sem suavização). */
export const W = 636;
export const H = 88;
/** Fim do céu / início do chão. */
export const HORIZONTE = 51;
/** Início do asfalto. */
export const VIA_Y = 55;
/** Linha do chão onde as rodas encostam. */
export const CHAO = 71;
/** Linha (y) onde o motorista caminha (frente da via). */
export const PISO_MOTORISTA = 84;
/** Linha tracejada central. */
export const TRACEJADO_Y = 78;

export const ZONA = { expedicao: 0, carregamento: 212, preparo: 424, largura: 212 } as const;

/** Sprite do caminhão (inclui margem p/ contorno). Desenhado em (x, CHAO - chaoSprite). */
export const CAMINHAO = {
  largura: 112,
  altura: 52,
  /** y do sprite onde fica o chão (base das rodas). */
  chaoSprite: 50,
  /** Centro da boca de carregamento (x no sprite). */
  boca: 72,
  /** Porta da cabine (x no sprite). */
  porta: 18,
  /** Topo da chaminé (x, y no sprite). */
  escape: [33, 4] as const,
  /** Centros das rodas (x no sprite), y do centro e raio. */
  rodas: [16, 40, 74, 87, 100] as const,
  rodaY: 44,
  rodaR: 6.5,
  /** Casco do tanque (retângulo envolvente; as pontas são arredondadas). */
  tanque: { x0: 36, x1: 108, y0: 13, y1: 38 },
  /** Linha do nível 100% dentro do tanque (deixa um espaço livre no topo). */
  nivelCheioY: 17,
  /** Janela da porta (onde aparece o motorista dirigindo). */
  janela: { x: 13, y: 17, w: 11, h: 9 },
  /** Faróis (dianteira) e lanternas (traseira), y no sprite. */
  farolY: 34,
  lanternaY: 35,
} as const;

/** x do braço de carregamento (centro da coluna do meio). */
export const BRACO_X = ZONA.carregamento + 106;
/** y do piso da plataforma de onde desce o braço. */
export const DECK_Y = 13;
/** y do topo da boca do tanque. */
export const BOCA_Y = CHAO - CAMINHAO.chaoSprite + 9;

export const POS = {
  entrada: W + 14,
  patio: ZONA.preparo + 106 - CAMINHAO.largura / 2,
  carga: BRACO_X - CAMINHAO.boca,
  /** Virado para a direita (espelhado), a boca fica do outro lado do sprite. */
  cargaDireita: BRACO_X - (CAMINHAO.largura - 1 - CAMINHAO.boca),
  balanca: ZONA.expedicao + 106 - CAMINHAO.largura / 2,
  saidaEsquerda: -CAMINHAO.largura - 12,
  saidaDireita: W + 14,
};

/** Balança (plataforma na via). */
export const BALANCA = { x0: 34, x1: 178 };
/** Visor da balança e semáforo. */
export const VISOR = { x: 174, y: 22, w: 28, h: 11 };
export const SEMAFORO = { x: 204, y: 30 };
/** Giroflex no alto da plataforma de carregamento. */
export const SINALEIRO = { x: BRACO_X - 22, y: 5 };
