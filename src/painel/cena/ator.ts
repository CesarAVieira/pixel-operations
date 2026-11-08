/**
 * Ator = o caminhão (e seu motorista) de um pedido na faixa. Lógica pura, sem DOM.
 *
 * O ator NÃO decide o fluxo: ele recebe o pedido (estado vindo das movimentações) e persegue o
 * "local" correspondente à etapa, encadeando trechos de animação (dirigir, motorista sai/volta,
 * braço de carregamento, manobras fora da tela). Se o domínio andar mais rápido que a animação,
 * o ator cumpre os trechos em sequência (acelerando) e alcança o estado real.
 */
import type { Etapa, Pedido, Pesagem } from '../dominio/tipos';
import { BOCA_Y, BRACO_X, CAMINHAO, CHAO, POS, W } from './geometria';

export type Local = 'fora' | 'patio' | 'patio_pronto' | 'carregamento' | 'balanca' | 'viagem' | 'saiu';
export const ORDEM: readonly Local[] = ['fora', 'patio', 'patio_pronto', 'carregamento', 'balanca', 'viagem', 'saiu'];
const idx = (l: Local) => ORDEM.indexOf(l);

export function localDaEtapa(e: Etapa): Local {
  switch (e) {
    case 'AGUARDANDO_MONTAGEM':
      return 'patio';
    case 'PEDIDO_MONTADO':
      return 'patio_pronto';
    case 'CARREGANDO':
      return 'carregamento';
    case 'AGUARDANDO_PESAGEM':
    case 'PESO_DIVERGENTE':
    case 'EMITINDO_NOTAS':
      return 'balanca';
    case 'EM_VIAGEM':
      return 'viagem';
    case 'ENCERRADO':
      return 'saiu';
  }
}

type Passo =
  | { k: 'dirigir'; x: number }
  | { k: 'esperar'; s: number }
  | { k: 'virar'; direita: boolean }
  | { k: 'teleporte'; x: number }
  | { k: 'motoristaSai' }
  | { k: 'motoristaEntra' }
  | { k: 'bracoSobe' }
  | { k: 'retornoFeito' }
  | { k: 'chegar'; local: Local };

export interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  cor: string;
}

const V_MAX = 58; // px/s
const ACEL = 48; // px/s²
const V_PE = 21; // motorista a pé
export const V_VIAGEM = 62;
/** Tempo mínimo (s) que um alerta de divergência fica visível antes de o caminhão sair. */
const SEGURAR_ALERTA = 3.2;

export class Ator {
  x: number;
  v = 0;
  direita = false;
  roda = 0;
  /** Nível de asfalto no tanque (0..1), animado. */
  carga: number;
  braco = 0;
  /** Transparência do tanque (0 = inox fechado; 1 = "raio-x" mostrando o asfalto). */
  transp = 0;
  local: Local;
  alvo: Local;
  movendo = false;
  viagem = 0;
  t = 0;
  /** Valor exibido no visor da balança (kg), animado. */
  visorKg = 0;
  motorista = { visivel: false, x: 0, dir: 1 as 1 | -1, passos: 0 };
  /** Motorista dentro da cabine (aparece na janela da porta). */
  motoristaDentro = true;
  particulas: Particula[] = [];
  aoSair?: () => void;

  private passos: Passo[] = [];
  private tPasso = 0;
  private tLocal = 0;
  private fumaca = 0;
  private vapor = 0;
  /**
   * A animação pode estar atrás do sistema (ex.: o complemento de carga termina enquanto o
   * caminhão ainda contorna). Por isso o ator conta o que JÁ ENCENOU: passagens pela balança
   * (a k-ésima mostra a k-ésima pesagem) e retornos à fábrica, e cumpre cada um visualmente.
   */
  private visitasBalanca = 0;
  private retornosAnimados = 0;
  private pesagemVistaIdx = -1;
  private pesagemVistaEm = 0;
  private bracoAbaixou = false;

  constructor(
    public p: Pedido,
    chegandoAgora: boolean,
  ) {
    const l = chegandoAgora && p.etapa === 'AGUARDANDO_MONTAGEM' ? 'fora' : localDaEtapa(p.etapa);
    this.local = l;
    this.retornosAnimados = p.retornos;
    this.visitasBalanca = idx(l) >= idx('balanca') ? p.retornos + 1 : p.retornos;
    this.alvo = this.alvoEfetivo();
    this.x = posicao(l, false);
    this.carga = idx(l) >= idx('carregamento') ? this.alvoCarga() : 0;
    if (l === 'carregamento' && p.etapa === 'CARREGANDO') {
      this.braco = 1;
      this.transp = 1;
      this.bracoAbaixou = true;
    }
    const pes = this.pesagemExibida;
    if (pes) {
      this.visorKg = pes.liquidoKg;
      this.pesagemVistaIdx = this.visitasBalanca;
    }
    this.motoristaDentro = l !== 'patio';
  }

  /** Novo estado do pedido vindo do domínio. */
  sincronizar(p: Pedido) {
    this.p = p;
    this.alvo = this.alvoEfetivo();
  }

  /** Local a perseguir: o da etapa, mas antes cumpre o retorno à fábrica que ainda não foi encenado. */
  private alvoEfetivo(): Local {
    if (this.p.retornos > this.retornosAnimados) {
      if (idx(this.local) < idx('balanca')) return 'balanca';
      if (this.local === 'balanca') return 'carregamento';
    }
    return localDaEtapa(this.p.etapa);
  }

  /** Parado (sem trecho em andamento). */
  get parado() {
    return this.passos.length === 0;
  }

  /** Pesagem mostrada nesta passagem pela balança. */
  get pesagemExibida(): Pesagem | undefined {
    return this.visitasBalanca > 0 ? this.p.pesagens[this.visitasBalanca - 1] : undefined;
  }

  /** Até onde o tanque deve encher nesta visita à baia (0..1): a pesagem seguinte, ou o carregado. */
  alvoCarga(): number {
    const pes = this.p.pesagens[this.visitasBalanca];
    const kg = pes ? pes.liquidoKg : this.p.carregadoKg;
    return Math.max(0, Math.min(1, kg / this.p.dados.quantidadeKg));
  }

  /** Alerta de divergência: caminhão parado na balança mostrando uma pesagem fora da tolerância. */
  get emAlerta() {
    const pes = this.pesagemExibida;
    return this.local === 'balanca' && this.parado && !!pes && !pes.ok;
  }

  /** Asfalto caindo no tanque agora (braço abaixado e ainda há carga a encenar ou o sistema segue carregando). */
  get despejando() {
    return this.local === 'carregamento' && this.parado && this.braco > 0.95 && (this.p.etapa === 'CARREGANDO' || this.carga < this.alvoCarga() - 0.002);
  }

  /** Quantos trechos faltam até o estado real (acelera se a animação estiver atrasada). */
  get atraso() {
    return Math.max(0, idx(this.alvo) - idx(this.local) - 1);
  }

  update(dt: number) {
    this.t += dt;
    this.tLocal += dt;
    this.movendo = false;
    this.alvo = this.alvoEfetivo();
    const pressa = 1 + Math.min(2, this.atraso) * 0.8;

    if (!this.passos.length && this.local !== this.alvo && this.podePartir()) {
      this.passos = this.planejar();
      this.tPasso = 0;
    }
    const passo = this.passos[0];
    if (passo && this.executar(passo, dt * pressa)) {
      this.passos.shift();
      this.tPasso = 0;
    }

    // braço: desce com o caminhão parado na baia enquanto há carga a encenar (ao menos uma vez por visita)
    const alvoCarga = this.alvoCarga();
    const naBaia = this.local === 'carregamento' && !this.passos.length;
    const descer = naBaia && (!this.bracoAbaixou || this.p.etapa === 'CARREGANDO' || this.carga < alvoCarga - 0.004);
    if (!(passo && passo.k === 'bracoSobe')) this.braco = aproximar(this.braco, descer ? 1 : 0, dt * 0.9);
    if (this.braco > 0.95 && this.local === 'carregamento') {
      this.bracoAbaixou = true;
      // segue o sistema; se estiver atrasado, enche num ritmo visível (nunca "salta")
      this.carga = aproximar(this.carga, alvoCarga, dt * Math.max(0.05, Math.abs(alvoCarga - this.carga) / 2.5));
    }
    // tanque fica transparente acompanhando o braço; na divergência, quase transparente mostra o nível
    const alvoT = this.local === 'carregamento' ? this.braco : this.emAlerta ? 0.85 : 0;
    this.transp = aproximar(this.transp, alvoT, dt * 1.6);

    if (this.local === 'viagem') {
      this.viagem += dt * V_VIAGEM;
      this.roda += dt * V_VIAGEM;
      this.movendo = true;
    }

    // visor da balança: mostra a pesagem desta passagem, contando até o valor
    if (this.local === 'balanca') {
      const pes = this.pesagemExibida;
      if (pes && this.pesagemVistaIdx !== this.visitasBalanca) {
        this.pesagemVistaIdx = this.visitasBalanca;
        this.pesagemVistaEm = this.t;
      }
      if (pes && this.parado) this.visorKg = aproximar(this.visorKg, pes.liquidoKg, dt * 9000);
    }

    this.atualizarParticulas(dt);
  }

  private podePartir() {
    if (this.tLocal < 0.4) return false;
    if (this.local === 'balanca') {
      const pes = this.pesagemExibida;
      // divergência fica visível um mínimo antes de o caminhão sair
      if (pes && !pes.ok && this.t - this.pesagemVistaEm < SEGURAR_ALERTA) return false;
    }
    if (this.local === 'carregamento') {
      if (!this.bracoAbaixou) return false;
      if (this.carga < this.alvoCarga() - 0.005) return false;
    }
    return true;
  }

  /** Próximo trecho entre o local atual e o alvo. */
  private planejar(): Passo[] {
    const de = this.local;
    const para = this.alvo;
    // retorno por peso divergente: segue em frente, some, manobra e volta na contramão
    if (de === 'balanca' && para === 'carregamento') {
      return [
        { k: 'dirigir', x: POS.saidaEsquerda },
        { k: 'esperar', s: 1.1 },
        { k: 'virar', direita: true },
        { k: 'dirigir', x: POS.cargaDireita },
        { k: 'retornoFeito' },
        { k: 'chegar', local: 'carregamento' },
      ];
    }
    if (idx(para) < idx(de)) {
      // correção vinda do sistema (etapa voltou): reposiciona sem animação
      return [{ k: 'virar', direita: false }, { k: 'teleporte', x: posicao(para, false) }, { k: 'chegar', local: para }];
    }
    const prox = ORDEM[idx(de) + 1];
    switch (prox) {
      case 'patio':
        return [{ k: 'dirigir', x: POS.patio }, { k: 'motoristaSai' }, { k: 'chegar', local: 'patio' }];
      case 'patio_pronto':
        return [{ k: 'motoristaEntra' }, { k: 'esperar', s: 0.5 }, { k: 'chegar', local: 'patio_pronto' }];
      case 'carregamento':
        return [{ k: 'dirigir', x: this.direita ? POS.cargaDireita : POS.carga }, { k: 'chegar', local: 'carregamento' }];
      case 'balanca': {
        const ps: Passo[] = [{ k: 'bracoSobe' }];
        // se voltou na contramão: segue à direita, sai, manobra fora da tela e retorna no sentido normal
        if (this.direita) ps.push({ k: 'dirigir', x: POS.saidaDireita }, { k: 'esperar', s: 1.1 }, { k: 'virar', direita: false });
        ps.push({ k: 'dirigir', x: POS.balanca }, { k: 'chegar', local: 'balanca' });
        return ps;
      }
      case 'viagem':
        return [{ k: 'esperar', s: 0.6 }, { k: 'chegar', local: 'viagem' }];
      case 'saiu':
        return [{ k: 'dirigir', x: POS.saidaEsquerda }, { k: 'chegar', local: 'saiu' }];
      default:
        return [{ k: 'chegar', local: prox }];
    }
  }

  private executar(ps: Passo, dt: number): boolean {
    this.tPasso += dt;
    switch (ps.k) {
      case 'dirigir':
        return this.dirigir(ps.x, dt);
      case 'esperar':
        return this.tPasso >= ps.s;
      case 'virar':
        this.direita = ps.direita;
        return true;
      case 'teleporte':
        this.x = ps.x;
        this.v = 0;
        return true;
      case 'bracoSobe':
        this.braco = aproximar(this.braco, 0, dt * 1.1);
        return this.braco <= 0;
      case 'motoristaSai': {
        const m = this.motorista;
        if (!m.visivel) Object.assign(m, { visivel: true, x: this.x + CAMINHAO.porta - 4, dir: 1, passos: 0 });
        this.motoristaDentro = false;
        if (this.tPasso < 0.5) return false;
        andar(m, dt);
        if (m.x > W + 8) {
          m.visivel = false;
          return true;
        }
        return false;
      }
      case 'motoristaEntra': {
        const m = this.motorista;
        if (!m.visivel) Object.assign(m, { visivel: true, x: W + 8, dir: -1, passos: 0 });
        andar(m, dt);
        if (m.x <= this.x + CAMINHAO.porta - 4) {
          m.visivel = false;
          this.motoristaDentro = true;
          return true;
        }
        return false;
      }
      case 'retornoFeito':
        this.retornosAnimados++;
        return true;
      case 'chegar':
        if (ps.local === 'balanca') {
          this.visitasBalanca++;
          this.visorKg = 0;
        }
        if (ps.local === 'carregamento') this.bracoAbaixou = false;
        this.local = ps.local;
        this.tLocal = 0;
        if (ps.local === 'saiu') this.aoSair?.();
        return true;
    }
  }

  private dirigir(alvo: number, dt: number): boolean {
    const d = alvo - this.x;
    const dist = Math.abs(d);
    if (dist < 0.25) {
      this.x = alvo;
      this.v = 0;
      return true;
    }
    // acelera, limita pela velocidade máxima e freia a tempo de parar no ponto
    this.v = Math.min(this.v + ACEL * dt, V_MAX, Math.sqrt(2 * ACEL * dist) + 2);
    const passo = Math.sign(d) * Math.min(dist, this.v * dt);
    this.x += passo;
    this.roda += Math.abs(passo) * (Math.sign(d) === (this.direita ? 1 : -1) ? 1 : -1);
    this.movendo = true;
    return false;
  }

  private atualizarParticulas(dt: number) {
    // fumaça do escapamento quando em movimento
    this.fumaca -= dt;
    if (this.movendo && this.fumaca <= 0) {
      this.fumaca = 0.16;
      const ex = this.direita ? CAMINHAO.largura - 1 - CAMINHAO.escape[0] : CAMINHAO.escape[0];
      this.particulas.push({ x: this.x + ex, y: CHAO - CAMINHAO.chaoSprite + CAMINHAO.escape[1], vx: (this.direita ? -1 : 1) * (5 + Math.random() * 5), vy: -5 - Math.random() * 3, vida: 0.9, cor: Math.random() < 0.5 ? '#6f747c' : '#8b9098' });
    }
    // vapor do asfalto quente durante o carregamento
    this.vapor -= dt;
    if (this.despejando && this.vapor <= 0) {
      this.vapor = 0.06;
      this.particulas.push({ x: BRACO_X + (Math.random() - 0.5) * 7, y: BOCA_Y - 1, vx: (Math.random() - 0.3) * 6, vy: -7 - Math.random() * 7, vida: 1.5, cor: Math.random() < 0.5 ? '#f4f6f8' : '#d3dae1' });
    }
    for (const q of this.particulas) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vida -= dt;
    }
    if (this.particulas.length) this.particulas = this.particulas.filter((q) => q.vida > 0);
  }
}

function aproximar(v: number, alvo: number, passo: number) {
  return v < alvo ? Math.min(alvo, v + passo) : Math.max(alvo, v - passo);
}

function andar(m: Ator['motorista'], dt: number) {
  m.x += m.dir * V_PE * dt;
  m.passos += V_PE * dt;
}

export function posicao(l: Local, direita: boolean): number {
  switch (l) {
    case 'fora':
      return POS.entrada;
    case 'patio':
    case 'patio_pronto':
      return POS.patio;
    case 'carregamento':
      return direita ? POS.cargaDireita : POS.carga;
    case 'balanca':
    case 'viagem':
      return POS.balanca;
    case 'saiu':
      return POS.saidaEsquerda;
  }
}
