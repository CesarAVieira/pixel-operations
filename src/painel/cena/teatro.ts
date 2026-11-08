/**
 * Teatro: mantém um Ator por pedido, sincronizado com o store, e roda o laço de animação.
 * As faixas (espaço no HTML + rótulos) se registram aqui; o desenho é feito pelo Palco (PixiJS)
 * e os rótulos são atualizados direto no DOM, sem re-renderizar o React a cada quadro.
 */
import { mix } from '../../game/art/core/color';
import { fmtKg } from '../dominio/pedido';
import type { PainelStore } from '../dominio/store';
import { TIPOS_NOTA } from '../dominio/tipos';
import { Palco } from '../render/palco';
import { Ator } from './ator';
import { ambiente, horaDoDia, type Ambiente } from './ceu';
import { CAMINHAO, CHAO, H, W } from './geometria';

export interface Rotulos {
  notas: HTMLElement;
  nfs: HTMLElement[];
  alerta: HTMLElement;
  alertaTxt: HTMLElement;
  carga: HTMLElement;
  preparo: HTMLElement;
  preparoTxt: HTMLElement;
  destino: HTMLElement;
}

export type ModoCeu = 'auto' | 'dia' | 'noite';

const ROTULO_NOTA: Record<string, string> = { PENDENTE: '', EMITINDO: ' …', AUTORIZADA: ' ✓', REJEITADA: ' ✕' };

export class Teatro {
  readonly atores = new Map<string, Ator>();
  private rotulos = new Map<string, Rotulos>();
  private palco = new Palco();
  velocidade = 1;
  pausado = false;
  modoCeu: ModoCeu = 'auto';
  private raf = 0;
  private ultimo = 0;
  private relogio = 0;
  private proxRotulos = 0;
  private amb: Ambiente | null = null;

  constructor(private store: PainelStore) {
    this.sincronizar(false);
    store.subscribe(() => this.sincronizar(true));
  }

  private sincronizar(chegando: boolean) {
    const vivos = new Set<string>();
    for (const p of this.store.getSnapshot()) {
      vivos.add(p.id);
      const a = this.atores.get(p.id);
      if (a) a.sincronizar(p);
      else {
        const novo = new Ator(p, chegando);
        novo.aoSair = () => this.store.descartar(p.id);
        this.atores.set(p.id, novo);
      }
    }
    for (const id of [...this.atores.keys()]) if (!vivos.has(id)) this.atores.delete(id);
  }

  capturar() {
    return this.palco.capturar();
  }

  /** Liga o palco PixiJS na camada (div sobre o quadro). */
  montar(camada: HTMLElement) {
    void this.palco.iniciar(camada);
  }

  registrar(id: string, el: HTMLElement, rotulos: Rotulos) {
    this.palco.registrar(id, el);
    this.rotulos.set(id, rotulos);
    this.proxRotulos = 0;
  }

  remover(id: string) {
    this.palco.remover(id);
    this.rotulos.delete(id);
  }

  /** O clique (fração 0..1 da faixa) acertou o caminhão deste pedido? */
  acertou(id: string, fx: number, fy: number): boolean {
    const a = this.atores.get(id);
    if (!a) return false;
    const x = fx * W, y = fy * H;
    return x >= a.x - 2 && x <= a.x + CAMINHAO.largura + 2 && y >= CHAO - CAMINHAO.chaoSprite - 2 && y <= CHAO + 4;
  }

  /** Hora usada na iluminação (relógio da fonte, ou fixa no modo dia/noite). */
  private alvoAmbiente(): Ambiente {
    const hora = this.modoCeu === 'dia' ? 13 : this.modoCeu === 'noite' ? 22.5 : horaDoDia(this.store.agora());
    return ambiente(hora);
  }

  iniciar() {
    const laco = (agora: number) => {
      const dtReal = this.ultimo ? Math.min(0.1, (agora - this.ultimo) / 1000) : 0;
      this.ultimo = agora;
      const dt = this.pausado ? 0 : dtReal * Math.min(2.5, Math.max(1, this.velocidade));
      this.relogio += this.pausado ? 0 : dtReal;
      for (const a of [...this.atores.values()]) a.update(dt);

      // ambiente com transição suave (troca dia/noite não "pisca")
      const alvo = this.alvoAmbiente();
      const k = this.amb ? Math.min(1, dtReal * 2.5) : 1;
      const at = this.amb ?? alvo;
      this.amb = {
        crepusculo: at.crepusculo + (alvo.crepusculo - at.crepusculo) * k,
        noite: at.noite + (alvo.noite - at.noite) * k,
        escuridao: at.escuridao + (alvo.escuridao - at.escuridao) * k,
        tom: mix(at.tom, alvo.tom, k),
      };
      this.palco.desenhar(this.atores, this.relogio, this.amb);

      if (agora >= this.proxRotulos) {
        this.proxRotulos = agora + 120;
        for (const [id, r] of this.rotulos) {
          const a = this.atores.get(id);
          if (a) atualizarRotulos(r, a);
        }
      }
      this.raf = requestAnimationFrame(laco);
    };
    this.raf = requestAnimationFrame(laco);
    return () => cancelAnimationFrame(this.raf);
  }
}

const mostrar = (el: HTMLElement, v: boolean) => el.classList.toggle('on', v);

function atualizarRotulos(r: Rotulos, a: Ator) {
  const p = a.p;
  // notas só com o caminhão parado na balança após uma pesagem OK (ou já em viagem)
  const pesOk = a.local === 'balanca' && a.parado && !!a.pesagemExibida?.ok;
  const notasVisiveis = (a.local === 'viagem' || pesOk) && (p.etapa === 'EMITINDO_NOTAS' || p.etapa === 'EM_VIAGEM' || p.etapa === 'ENCERRADO');
  mostrar(r.notas, notasVisiveis);
  if (notasVisiveis)
    TIPOS_NOTA.forEach((t, i) => {
      const n = p.notas[t];
      const el = r.nfs[i];
      el.className = 'nf ' + n.status.toLowerCase();
      el.textContent = t + ROTULO_NOTA[n.status];
    });

  mostrar(r.alerta, a.emAlerta);
  if (a.emAlerta) {
    const pes = a.pesagemExibida;
    r.alertaTxt.textContent = pes ? `Peso divergente · ${fmtKg(pes.liquidoKg)} de ${fmtKg(pes.esperadoKg)}` : 'Peso divergente';
  }

  const naBaia = a.local === 'carregamento' && a.braco > 0.5;
  mostrar(r.carga, naBaia);
  if (naBaia) r.carga.textContent = `${Math.round(Math.min(1, a.carga) * 100)}% · ${fmtKg(Math.min(1, a.carga) * p.dados.quantidadeKg)}${p.retornos ? ' · complemento' : ''}`;

  const noPatio = (a.local === 'patio' || a.local === 'patio_pronto') && !a.movendo;
  mostrar(r.preparo, noPatio);
  if (noPatio) {
    const pronto = a.local === 'patio_pronto' || p.etapa !== 'AGUARDANDO_MONTAGEM';
    r.preparo.classList.toggle('pronto', pronto);
    r.preparoTxt.textContent = pronto ? 'Pedido montado · motorista voltando' : 'Montando pedido · motorista aguardando';
  }

  mostrar(r.destino, a.local === 'viagem');
  if (a.local === 'viagem') r.destino.textContent = `→ ${p.dados.destino.cidade}/${p.dados.destino.uf}`;
}
