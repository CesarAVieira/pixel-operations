import { describe, expect, it } from 'vitest';
import { rng } from '../src/game/art/core/pixbuf';
import { corpoCaminhao, motoristaQuadros, partesCaminhao, rodaQuadros } from '../src/painel/arte/sprites';
import { LUZES, cenario, ceu, pixelsTexto } from '../src/painel/arte/cenario';
import { ambiente } from '../src/painel/cena/ceu';
import { Ator, localDaEtapa } from '../src/painel/cena/ator';
import { CAMINHAO, POS } from '../src/painel/cena/geometria';
import { aplicar, toleranciaKg } from '../src/painel/dominio/pedido';
import { PainelStore } from '../src/painel/dominio/store';
import type { Movimentacao, Pedido } from '../src/painel/dominio/tipos';
import { roteiro, Simulador } from '../src/painel/fonte/simulador';

const reduzir = (evs: Movimentacao[]) => evs.reduce<Pedido | undefined>((p, e) => aplicar(p, e), undefined);

describe('domínio: reducer de movimentações', () => {
  it('percorre o fluxo normal até EM_VIAGEM e ENCERRADO', () => {
    const r = roteiro(rng(1), 1, 0, {});
    const etapas: string[] = [];
    let p: Pedido | undefined;
    for (const e of r.eventos) {
      p = aplicar(p, e);
      if (p && etapas[etapas.length - 1] !== p.etapa) etapas.push(p.etapa);
    }
    expect(etapas).toEqual(['AGUARDANDO_MONTAGEM', 'PEDIDO_MONTADO', 'CARREGANDO', 'AGUARDANDO_PESAGEM', 'EMITINDO_NOTAS', 'EM_VIAGEM', 'ENCERRADO']);
    expect(p!.notas.NFe.status).toBe('AUTORIZADA');
    expect(p!.retornos).toBe(0);
  });

  it('peso fora da tolerância gera divergência, retorno e nova pesagem', () => {
    const r = roteiro(rng(2), 2, 0, { divergente: true });
    const etapas: string[] = [];
    let p: Pedido | undefined;
    for (const e of r.eventos) {
      p = aplicar(p, e);
      if (p && etapas[etapas.length - 1] !== p.etapa) etapas.push(p.etapa);
    }
    expect(etapas).toContain('PESO_DIVERGENTE');
    expect(etapas.indexOf('CARREGANDO', etapas.indexOf('PESO_DIVERGENTE'))).toBeGreaterThan(0);
    expect(p!.retornos).toBe(1);
    expect(p!.pesagens.map((x) => x.ok)).toEqual([false, true]);
  });

  it('tolerância: maior entre 0,5% e 100 kg', () => {
    expect(toleranciaKg(10000)).toBe(100);
    expect(toleranciaKg(30000)).toBe(150);
  });

  it('nota rejeitada não libera a viagem até ser reautorizada', () => {
    const r = roteiro(rng(3), 3, 0, { notaRejeitada: true });
    const ate = r.eventos.findIndex((e) => e.tipo === 'NOTA' && e.status === 'REJEITADA');
    const p = reduzir(r.eventos.slice(0, ate + 1))!;
    expect(p.etapa).toBe('EMITINDO_NOTAS');
    expect(p.notas.NFe.status).toBe('REJEITADA');
    expect(p.historico.some((h) => h.alerta)).toBe(true);
  });

  it('ignora eventos de pedido desconhecido e é idempotente na chegada', () => {
    expect(aplicar(undefined, { tipo: 'PEDIDO_MONTADO', pedidoId: 'x', em: 0 })).toBeUndefined();
    const r = roteiro(rng(4), 4, 0);
    const p = aplicar(undefined, r.eventos[0])!;
    expect(aplicar(p, r.eventos[0])).toBe(p);
  });
});

describe('store e simulador', () => {
  it('descarta apenas pedidos encerrados', () => {
    const s = new PainelStore(() => 0);
    const r = roteiro(rng(5), 5, 0);
    s.aplicarVarios(r.eventos.slice(0, 3));
    s.descartar('P5');
    expect(s.getSnapshot()).toHaveLength(1);
    s.aplicarVarios(r.eventos);
    s.descartar('P5');
    expect(s.getSnapshot()).toHaveLength(0);
  });

  it('semeia um cenário com etapas variadas e avança no tempo', () => {
    const sim = new Simulador(42, 1_700_000_000_000);
    const s = new PainelStore(sim.agora);
    sim.conectar(s)(); // conecta (semeia) e desliga o intervalo; avançamos à mão
    const etapas = new Set(s.getSnapshot().map((p) => p.etapa));
    expect(s.getSnapshot().length).toBeGreaterThanOrEqual(5);
    expect(etapas.has('EM_VIAGEM')).toBe(true);
    expect(etapas.has('CARREGANDO')).toBe(true);
    // validades de documentos ficam perto de "agora" (não em 1970)
    const ano = new Date(sim.agora()).getFullYear();
    for (const p of s.getSnapshot()) expect(Math.abs(Number(p.motorista.cnh.validade.slice(0, 4)) - ano)).toBeLessThanOrEqual(2);
    for (let i = 0; i < 200; i++) sim.avancar(1000);
    expect(s.getSnapshot().some((p) => p.pesagens.some((q) => !q.ok))).toBe(true);
  });
});

describe('ator (coreografia do caminhão)', () => {
  const rodar = (a: Ator, seg: number) => {
    for (let t = 0; t < seg; t += 0.05) a.update(0.05);
  };

  it('mapeia etapas para locais', () => {
    expect(localDaEtapa('PESO_DIVERGENTE')).toBe('balanca');
    expect(localDaEtapa('PEDIDO_MONTADO')).toBe('patio_pronto');
  });

  it('chegada: entra pela direita, estaciona e o motorista sai a pé', () => {
    const r = roteiro(rng(6), 6, 0);
    const p = reduzir(r.eventos.slice(0, 1))!;
    const a = new Ator(p, true);
    expect(a.x).toBe(POS.entrada);
    let viuMotorista = false;
    for (let t = 0; t < 30; t += 0.05) {
      a.update(0.05);
      viuMotorista ||= a.motorista.visivel;
    }
    expect(a.local).toBe('patio');
    expect(a.x).toBe(POS.patio);
    expect(viuMotorista).toBe(true);
    expect(a.motorista.visivel).toBe(false);
  });

  it('divergência: segue à esquerda, some, volta na contramão e depois contorna pela direita', () => {
    const r = roteiro(rng(7), 7, 0, { divergente: true });
    const evs = r.eventos;
    const iDiv = evs.findIndex((e) => e.tipo === 'PESAGEM');
    const a = new Ator(reduzir(evs.slice(0, iDiv + 1))!, false);
    expect(a.local).toBe('balanca');
    expect(a.emAlerta).toBe(true);

    // domínio manda voltar ao carregamento
    const iRet = evs.findIndex((e, i) => i > iDiv && e.tipo === 'CARREGAMENTO_INICIADO');
    a.sincronizar(reduzir(evs.slice(0, iRet + 1))!);
    let minX = a.x;
    for (let t = 0; t < 40; t += 0.05) {
      a.update(0.05);
      minX = Math.min(minX, a.x);
    }
    expect(minX).toBeLessThan(-CAMINHAO.largura); // saiu pela esquerda
    expect(a.local).toBe('carregamento');
    expect(a.direita).toBe(true); // voltou na contramão
    expect(a.x).toBe(POS.cargaDireita);

    // carga completa → vai à balança contornando pela direita
    const iFim = evs.findIndex((e, i) => i > iRet && e.tipo === 'CARREGAMENTO_CONCLUIDO');
    a.sincronizar(reduzir(evs.slice(0, iFim + 1))!);
    let maxX = a.x;
    for (let t = 0; t < 40; t += 0.05) {
      a.update(0.05);
      maxX = Math.max(maxX, a.x);
    }
    expect(maxX).toBeGreaterThanOrEqual(POS.saidaDireita);
    expect(a.local).toBe('balanca');
    expect(a.direita).toBe(false);
  });

  it('alcança o estado real mesmo quando o domínio pula várias etapas', () => {
    const r = roteiro(rng(8), 8, 0);
    const a = new Ator(reduzir(r.eventos.slice(0, 1))!, true);
    const iViagem = r.eventos.findIndex((e) => e.tipo === 'NOTA' && e.nota === 'MDFe' && e.status === 'AUTORIZADA');
    a.sincronizar(reduzir(r.eventos.slice(0, iViagem + 1))!);
    rodar(a, 90);
    expect(a.local).toBe('viagem');
  });

  it('encerrado: sai de cena e avisa', () => {
    const r = roteiro(rng(9), 9, 0);
    const a = new Ator(reduzir(r.eventos.slice(0, -1))!, false);
    let saiu = false;
    a.aoSair = () => (saiu = true);
    a.sincronizar(reduzir(r.eventos)!);
    rodar(a, 20);
    expect(saiu).toBe(true);
  });
});

describe('arte do painel', () => {
  const opacos = (d: Uint8ClampedArray) => d.filter((_, i) => i % 4 === 3 && d[i] > 0).length;
  it('gera caminhão, rodas, motorista e cenário', () => {
    for (const lib of [{ cor: '#d9483b', cbb: false }, { cor: '#eef0f2', cbb: true }]) {
      const c = corpoCaminhao(lib);
      expect([c.w, c.h]).toEqual([CAMINHAO.largura, CAMINHAO.altura]);
      expect(opacos(c.data)).toBeGreaterThan(2500);
    }
    expect(rodaQuadros()).toHaveLength(4);
    expect(motoristaQuadros().every((m) => opacos(m.data) > 40)).toBe(true);
    const cen = cenario();
    expect(cen.expedicao.w + cen.resto.w).toBe(636);
    // abaixo da linha do céu o cenário é opaco (sem buracos)
    const d = cen.resto.data;
    for (let y = 52; y < cen.resto.h; y++) for (let x = 0; x < cen.resto.w; x++) expect(d[(y * cen.resto.w + x) * 4 + 3]).toBe(255);
    for (const t of ['dia', 'crepusculo', 'noite'] as const) expect(opacos(ceu(t).data)).toBe(636 * 51);
    expect(LUZES.some((l) => l.tipo === 'poste')).toBe(true);
    expect(LUZES.some((l) => l.tipo === 'holofote')).toBe(true);
  });
  it('iluminação pela hora: dia claro, noite escura, transições suaves', () => {
    expect(ambiente(13)).toMatchObject({ noite: 0, escuridao: 0, tom: '#ffffff' });
    expect(ambiente(23).noite).toBe(1);
    expect(ambiente(2).escuridao).toBe(1);
    expect(ambiente(18.4).crepusculo).toBeGreaterThan(0.9);
    let ant = ambiente(17).escuridao;
    for (let h = 17; h <= 20; h += 0.1) {
      const e = ambiente(h).escuridao;
      expect(Math.abs(e - ant)).toBeLessThan(0.12);
      ant = e;
    }
  });
  it('fonte do visor', () => {
    expect(pixelsTexto('8').length).toBe(13);
  });
});

describe('integração domínio + animação (relógio real do painel)', () => {
  /** Roda eventos e ator juntos, como no painel: 1 s real = 30 s simulados × velocidade. */
  function encenar(vel: number, op: { divergente?: boolean }) {
    const r = roteiro(rng(7), 7, 0, op);
    const iPes = r.eventos.findIndex((e) => e.tipo === 'CARREGAMENTO_INICIADO');
    let p: Pedido | undefined;
    for (const e of r.eventos.slice(0, iPes + 1)) p = aplicar(p, e);
    const a = new Ator(p!, false);
    let t = r.eventos[iPes].em, k = iPes + 1;
    const visto = { alerta: false, contramao: false, minX: a.x, bracoNoRetorno: 0, cargaAoSairDoRetorno: 0, viagem: false };
    let noRetorno = false;
    for (let s = 0; s < 120; s += 0.05) {
      t += 50 * 30 * vel;
      while (k < r.eventos.length && r.eventos[k].em <= t) p = aplicar(p, r.eventos[k++]);
      a.sincronizar(p!);
      a.update(0.05 * Math.min(2.5, vel));
      visto.alerta ||= a.emAlerta;
      visto.minX = Math.min(visto.minX, a.x);
      if (a.direita && a.local === 'carregamento') noRetorno = true;
      if (noRetorno) {
        visto.contramao = true;
        visto.bracoNoRetorno = Math.max(visto.bracoNoRetorno, a.braco);
        if (a.local === 'balanca') {
          visto.cargaAoSairDoRetorno ||= a.carga;
          noRetorno = false;
        }
      }
      visto.viagem ||= a.local === 'viagem';
    }
    return visto;
  }

  for (const vel of [1, 4])
    it(`divergência a ${vel}x: alerta, contramão, braço desce e o tanque completa no retorno`, () => {
      const v = encenar(vel, { divergente: true });
      expect(v.alerta).toBe(true);
      expect(v.minX).toBeLessThan(-CAMINHAO.largura);
      expect(v.contramao).toBe(true);
      expect(v.bracoNoRetorno).toBeGreaterThan(0.95);
      expect(v.cargaAoSairDoRetorno).toBeGreaterThan(0.99);
      expect(v.viagem).toBe(true);
    });

  it('fluxo normal a 4x também chega à viagem sem alerta', () => {
    const v = encenar(4, {});
    expect(v.alerta).toBe(false);
    expect(v.contramao).toBe(false);
    expect(v.viagem).toBe(true);
  });

  it('tanque separado em base + casco sem perder pixels', () => {
    const lib = { cor: '#eef0f2', cbb: true };
    const full = corpoCaminhao(lib);
    const { base, casco } = partesCaminhao(lib);
    const op = (d: Uint8ClampedArray) => d.filter((_, i) => i % 4 === 3 && d[i] > 0).length;
    expect(op(base.data) + op(casco.data)).toBe(op(full.data));
    expect(op(casco.data)).toBeGreaterThan(1500);
  });
});
