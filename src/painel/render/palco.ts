/**
 * Palco PixiJS: UM canvas WebGL sobre o quadro; cada linha (pedido) é um Container posicionado
 * exatamente sobre o espaço reservado da sua faixa no HTML. A pixel art é ampliada sem suavização;
 * as luzes (postes, holofotes, faróis, visores, alerta) são brilhos aditivos suaves por cima.
 *
 * Camadas de cada linha (de trás para frente):
 *   céu (dia/entardecer/noite) · cenário tingido pela hora · janelas acesas · emissivos (LED,
 *   semáforo, giroflex) · caminhão/motorista tingidos · luzes aditivas · alerta e divisórias
 */
import { Application, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { PixelBuf } from '../../game/art/core/pixbuf';
import { LUZES, ceu, cenario, estradaChao, larguraTexto, morros, pixelsTexto, type Ceu, type Luz } from '../arte/cenario';
import { araucaria, arvore, interiorTanque, linhaTanque, motoristaCabine, motoristaQuadros, nuvem, partesCaminhao, rodaQuadros } from '../arte/sprites';
import type { Ator } from '../cena/ator';
import type { Ambiente } from '../cena/ceu';
import { BOCA_Y, BRACO_X, CAMINHAO, CHAO, DECK_Y, H, HORIZONTE, PISO_MOTORISTA, SEMAFORO, SINALEIRO, TRACEJADO_Y, VISOR, W, ZONA } from '../cena/geometria';

// ------------------------------------------------------------------ texturas
function textura(b: PixelBuf): Texture {
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  c.getContext('2d')!.putImageData(new ImageData(b.data, b.w, b.h), 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

function texturaBrilho(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  gr.addColorStop(0.65, 'rgba(255,255,255,0.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return Texture.from(c);
}

/** Cone de luz apontando para baixo (ápice no topo, centro). */
function texturaCone(): Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.filter = 'blur(5px)';
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(29, 4);
  g.lineTo(35, 4);
  g.lineTo(60, 124);
  g.lineTo(4, 124);
  g.closePath();
  g.fill();
  return Texture.from(c);
}

interface Arte {
  ceu: Record<Ceu, Texture>;
  expedicao: Texture;
  resto: Texture;
  estrada: Texture;
  morros: Texture;
  arvores: Texture[];
  nuvens: Texture[];
  rodas: Texture[];
  motorista: Texture[];
  cabine: Texture;
  corpos: Map<string, { base: Texture; casco: Texture }>;
  interior: Texture;
  brilho: Texture;
  cone: Texture;
}

let arte: Arte | null = null;
function obterArte(): Arte {
  if (!arte) {
    const cen = cenario();
    arte = {
      ceu: { dia: textura(ceu('dia')), crepusculo: textura(ceu('crepusculo')), noite: textura(ceu('noite')) },
      expedicao: textura(cen.expedicao),
      resto: textura(cen.resto),
      estrada: textura(estradaChao()),
      morros: textura(morros()),
      arvores: [textura(araucaria(1)), textura(arvore(0)), textura(arvore(1)), textura(araucaria(0.8))],
      nuvens: [textura(nuvem(0)), textura(nuvem(1))],
      rodas: rodaQuadros().map(textura),
      motorista: motoristaQuadros().map(textura),
      cabine: textura(motoristaCabine()),
      corpos: new Map(),
      interior: textura(interiorTanque()),
      brilho: texturaBrilho(),
      cone: texturaCone(),
    };
  }
  return arte;
}

function corpo(cor: string, cbb: boolean) {
  const a = obterArte();
  const k = cbb ? 'cbb' : cor;
  let t = a.corpos.get(k);
  if (!t) {
    const pt = partesCaminhao({ cor, cbb });
    t = { base: textura(pt.base), casco: textura(pt.casco) };
    a.corpos.set(k, t);
  }
  return t;
}

const TQ = CAMINHAO.tanque;
/** Para cada coluna do tanque, o intervalo vertical [topo, base] ocupado pelo casco (recorte do líquido). */
const COLUNAS_TANQUE: [number, number][] = [];
for (let x = TQ.x0; x <= TQ.x1; x++) {
  let a = Infinity, b = -Infinity;
  for (let y = TQ.y0; y <= TQ.y1; y++) {
    const f = linhaTanque(y);
    if (f && x >= f[0] && x <= f[1]) {
      a = Math.min(a, y);
      b = Math.max(b, y);
    }
  }
  COLUNAS_TANQUE.push([a, b]);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const corNum = (hex: string) => parseInt(hex.slice(1), 16);

// ------------------------------------------------------------------ uma linha
class FaixaPixi {
  readonly raiz = new Container();
  private mascara = new Graphics();

  private ceuCrep: Sprite;
  private ceuNoite: Sprite;
  private fundo = new Container();
  private nuvens: Sprite[] = [];
  private cenExp: Sprite;
  private estrada = new Container();
  private morros: TilingSprite;
  private arvores: Sprite[] = [];
  private estradaG = new Graphics();
  private estradaChao: Sprite;
  private janelasZ0 = new Graphics();
  private janelasResto = new Graphics();
  private emissivo = new Graphics();
  private atores = new Container();
  private caminhao = new Container();
  private base: Sprite;
  private casco: Sprite;
  /** Interior do tanque ("raio-x"): fundo escuro + asfalto + jato, recortados pelo perfil do tanque. */
  private interior = new Container();
  private liquido = new Graphics();
  private cabine: Sprite;
  private rodas: Sprite[] = [];
  private braco = new Graphics();
  private particulas = new Graphics();
  private motorista: Sprite;
  private luzes = new Container();
  private luzesFixas: { s: Sprite[]; l: Luz }[] = [];
  private farol: Sprite;
  private farolBrilho: Sprite;
  private lanterna: Sprite;
  private brilhoLed: Sprite;
  private brilhoSemaforo: Sprite;
  private brilhoGiro: Sprite;
  private brilhoCalor: Sprite;
  private brilhoAlerta: Sprite;
  private frente = new Graphics();
  private chaveCorpo = '';

  constructor(private fase: number) {
    const a = obterArte();
    const r = this.raiz;
    this.mascara.rect(0, 0, W, H).fill(0xffffff);
    r.addChild(this.mascara);
    r.mask = this.mascara;

    // céu (não tingido)
    r.addChild(new Sprite(a.ceu.dia));
    this.ceuCrep = r.addChild(new Sprite(a.ceu.crepusculo));
    this.ceuNoite = r.addChild(new Sprite(a.ceu.noite));

    // cenário (tingido)
    r.addChild(this.fundo);
    for (let i = 0; i < 3; i++) this.nuvens.push(this.fundo.addChild(new Sprite(a.nuvens[i % 2])));
    this.cenExp = this.fundo.addChild(new Sprite(a.expedicao));
    this.fundo.addChild(new Sprite(a.resto)).x = ZONA.carregamento;
    this.morros = new TilingSprite({ texture: a.morros, width: ZONA.largura, height: 22 });
    this.morros.y = HORIZONTE - 20;
    this.estrada.addChild(this.morros);
    for (let i = 0; i < 6; i++) this.arvores.push(this.estrada.addChild(new Sprite(a.arvores[i % a.arvores.length])));
    this.estradaChao = this.estrada.addChild(new Sprite(a.estrada));
    this.estrada.addChild(this.estradaG);
    const mascEstrada = new Graphics().rect(0, 0, ZONA.largura, H).fill(0xffffff);
    this.estrada.addChild(mascEstrada);
    this.estrada.mask = mascEstrada;
    // fora do contêiner tingido: com máscara o tingimento não se propaga, então tingimos as peças
    r.addChild(this.estrada);

    // janelas acesas e emissivos (não tingidos)
    for (const l of LUZES) {
      const g = l.zona === 0 ? this.janelasZ0 : this.janelasResto;
      if (l.tipo === 'janela') g.rect(l.x, l.y, l.w ?? 1, l.h ?? 1).fill({ color: 0xffd98a, alpha: 0.85 });
      else if (l.tipo === 'cidade') g.rect(l.x, l.y, 1, 1).fill({ color: (l.x * 7 + l.y) % 3 ? 0xffe2a0 : 0xfff6d8 });
      else if (l.tipo === 'poste') g.rect(l.x - 2, l.y, 5, 1).fill(0xfff6c8);
      else if (l.tipo === 'holofote') g.rect(l.x - 1, l.y, 3, 1).fill(0xffffff);
    }
    r.addChild(this.janelasZ0, this.janelasResto, this.emissivo);

    // atores (tingidos)
    r.addChild(this.atores);
    const sombra = new Graphics()
      .rect(3, CAMINHAO.chaoSprite - 1, CAMINHAO.largura - 6, 2)
      .fill({ color: 0x0a0e18, alpha: 0.3 })
      .rect(7, CAMINHAO.chaoSprite + 1, CAMINHAO.largura - 14, 1)
      .fill({ color: 0x0a0e18, alpha: 0.16 });
    this.caminhao.addChild(sombra);
    this.base = this.caminhao.addChild(new Sprite(a.rodas[0]));
    // sem máscara (máscara dentro da máscara da linha falha no PixiJS): o interior já tem o formato
    // do tanque e o líquido é recortado coluna a coluna pelo perfil do casco
    this.interior.addChild(new Sprite(a.interior), this.liquido);
    this.caminhao.addChild(this.interior);
    this.casco = this.caminhao.addChild(new Sprite(a.rodas[0]));
    this.cabine = this.caminhao.addChild(new Sprite(a.cabine));
    this.cabine.position.set(CAMINHAO.janela.x, CAMINHAO.janela.y);
    this.cabine.alpha = 0.8;
    for (const rx of CAMINHAO.rodas) {
      const s = this.caminhao.addChild(new Sprite(a.rodas[0]));
      s.position.set(rx - 7, CAMINHAO.rodaY - 7);
      this.rodas.push(s);
    }
    this.atores.addChild(this.caminhao, this.braco, this.particulas);
    this.motorista = this.atores.addChild(new Sprite(a.motorista[4]));
    this.motorista.anchor.set(0.5, 1);

    // luzes aditivas
    r.addChild(this.luzes);
    const add = (tex: Texture, tint: number) => {
      const s = this.luzes.addChild(new Sprite(tex));
      s.blendMode = 'add';
      s.tint = tint;
      return s;
    };
    for (const l of LUZES) {
      const s: Sprite[] = [];
      if (l.tipo === 'poste') {
        const g = add(a.brilho, 0xffd27a);
        g.anchor.set(0.5);
        g.position.set(l.x, l.y);
        g.scale.set(36 / 64);
        const c = add(a.cone, 0xffd890);
        c.anchor.set(0.5, 0);
        c.position.set(l.x, l.y);
        c.width = 46;
        c.height = CHAO + 6 - l.y;
        c.alpha = 0.5;
        s.push(g, c);
      } else if (l.tipo === 'holofote') {
        const c = add(a.cone, 0xfff3c4);
        c.anchor.set(0.5, 0);
        c.position.set(l.x, l.y);
        c.width = 54;
        c.height = CHAO + 8 - l.y;
        c.alpha = 0.55;
        s.push(c);
      } else if (l.tipo === 'janela') {
        const g = add(a.brilho, 0xffc870);
        g.anchor.set(0.5);
        g.position.set(l.x + (l.w ?? 1) / 2, l.y + (l.h ?? 1) / 2);
        g.width = (l.w ?? 1) * 2.6;
        g.height = (l.h ?? 1) * 2.6;
        g.alpha = 0.4;
        s.push(g);
      } else if (l.tipo === 'torre') {
        const g = add(a.brilho, 0xff3b3b);
        g.anchor.set(0.5);
        g.position.set(l.x, l.y);
        g.scale.set(12 / 64);
        s.push(g);
      }
      if (s.length) this.luzesFixas.push({ s, l });
    }
    this.farol = add(a.cone, 0xfff4cc);
    this.farol.anchor.set(0.5, 0);
    this.farol.width = 34;
    this.farol.height = 70;
    this.farolBrilho = add(a.brilho, 0xfff0c0);
    this.farolBrilho.anchor.set(0.5);
    this.farolBrilho.scale.set(16 / 64);
    this.lanterna = add(a.brilho, 0xff2a2a);
    this.lanterna.anchor.set(0.5);
    this.lanterna.scale.set(12 / 64);
    this.brilhoLed = add(a.brilho, 0x5dff7a);
    this.brilhoLed.anchor.set(0.5);
    this.brilhoLed.position.set(VISOR.x + VISOR.w / 2, VISOR.y + VISOR.h / 2);
    this.brilhoLed.width = VISOR.w * 1.9;
    this.brilhoLed.height = VISOR.h * 2.6;
    this.brilhoSemaforo = add(a.brilho, 0xff3b30);
    this.brilhoSemaforo.anchor.set(0.5);
    this.brilhoSemaforo.scale.set(16 / 64);
    this.brilhoGiro = add(a.brilho, 0xffb020);
    this.brilhoGiro.anchor.set(0.5);
    this.brilhoGiro.position.set(SINALEIRO.x + 1, SINALEIRO.y + 1);
    this.brilhoGiro.scale.set(30 / 64);
    this.brilhoCalor = add(a.brilho, 0xff7a20);
    this.brilhoCalor.anchor.set(0.5);
    this.brilhoCalor.position.set(BRACO_X, BOCA_Y);
    this.brilhoCalor.width = 40;
    this.brilhoCalor.height = 22;
    this.brilhoAlerta = add(a.brilho, 0xff2020);
    this.brilhoAlerta.anchor.set(0.5);
    this.brilhoAlerta.position.set(ZONA.largura / 2, H / 2);
    this.brilhoAlerta.width = ZONA.largura * 1.4;
    this.brilhoAlerta.height = H * 1.6;

    r.addChild(this.frente);
  }

  /**
   * Asfalto dentro do tanque: corpo preto brilhante com superfície ondulando, reflexos e bolhas,
   * jato caindo da boca enquanto despeja e a marca amarela do nível 100%.
   */
  private desenharLiquido(at: Ator, rel: number) {
    const g = this.liquido.clear();
    const cheio = CAMINHAO.nivelCheioY;
    const fundoY = TQ.y1;
    const nivel = fundoY - Math.min(1.02, at.carga) * (fundoY - cheio);
    const despeja = at.despejando;
    const amp = despeja ? 0.9 : 0.35;
    // marca do nível 100% (tracejada)
    const faixaCheio = linhaTanque(cheio)!;
    for (let x = faixaCheio[0] + 2; x < faixaCheio[1] - 2; x += 4) g.rect(x, cheio, 2, 1);
    g.fill({ color: 0xffcc00, alpha: 0.85 });
    if (at.carga <= 0.001 && !despeja) return;
    // corpo do líquido, coluna a coluna (a superfície ondula; perto do jato, ondas maiores)
    const sup: number[] = [];
    for (let x = TQ.x0; x <= TQ.x1; x++) {
      const perto = despeja ? Math.max(0, 1 - Math.abs(x - CAMINHAO.boca) / 14) : 0;
      const y = Math.round(nivel + Math.sin(x * 0.42 + rel * 5.2) * amp + Math.sin(x * 0.17 - rel * 3.1) * amp * 0.6 + Math.sin(rel * 16 + x) * perto * 1.2);
      const [cTopo, cBase] = COLUNAS_TANQUE[x - TQ.x0];
      const y0 = Math.max(y, cTopo);
      sup[x - TQ.x0] = y0;
      if (y0 <= cBase) g.rect(x, y0, 1, cBase - y0 + 1);
    }
    g.fill(0x121216);
    // fundo mais escuro (recortado)
    COLUNAS_TANQUE.forEach(([, cBase], i) => {
      const y0 = Math.max(sup[i], cBase - 3);
      if (y0 <= cBase) g.rect(TQ.x0 + i, y0, 1, cBase - y0 + 1);
    });
    g.fill({ color: 0x050507, alpha: 0.6 });
    // superfície brilhante e reflexos que correm
    sup.forEach((y, i) => {
      if (y <= COLUNAS_TANQUE[i][1] && y > COLUNAS_TANQUE[i][0]) g.rect(TQ.x0 + i, y, 1, 1);
    });
    g.fill(0x4b4b57);
    for (let k = 0; k < 3; k++) {
      const i = 4 + Math.floor((rel * (9 + k * 4) + k * 23) % (TQ.x1 - TQ.x0 - 10));
      const y = sup[i];
      if (y !== undefined && y < COLUNAS_TANQUE[i][1] && y > COLUNAS_TANQUE[i][0]) g.rect(TQ.x0 + i, y, 3, 1).fill(0xa4a4b4);
    }
    // bolhas subindo (asfalto quente)
    if (despeja)
      for (let k = 0; k < 6; k++) {
        const bx = TQ.x0 + 6 + ((k * 37) % (TQ.x1 - TQ.x0 - 12));
        const ciclo = (rel * 0.8 + k * 0.37) % 1;
        const by = Math.round(fundoY - ciclo * (fundoY - nivel));
        if (by > nivel + 1) g.rect(bx, by, 1, 1).fill({ color: 0x3a3a46, alpha: 0.9 });
      }
    // jato caindo da boca de carregamento até a superfície
    if (despeja) {
      const topo = TQ.y0 - 1;
      const yS = sup[CAMINHAO.boca - TQ.x0] ?? nivel;
      g.rect(CAMINHAO.boca - 1, topo, 3, Math.max(0, yS - topo)).fill(0x16161b);
      g.rect(CAMINHAO.boca, topo, 1, Math.max(0, yS - topo)).fill(0x2c2c35);
      const brilhoY = topo + Math.floor((rel * 40) % Math.max(1, yS - topo));
      g.rect(CAMINHAO.boca, brilhoY, 1, 2).fill(0x8a8a9a);
      // respingos na superfície
      for (let k = -1; k <= 1; k += 2) g.rect(CAMINHAO.boca + k * (2 + (Math.floor(rel * 12) % 3)), yS - 1, 1, 1).fill(0x55555f);
    }
  }

  /** Desenha o quadro atual do ator. */
  atualizar(at: Ator, rel: number, amb: Ambiente) {
    const a = obterArte();
    const pisca = (hz: number) => Math.floor(rel * hz) % 2 === 0;
    const viajando = at.local === 'viagem';
    const esc = amb.escuridao;
    const tom = corNum(amb.tom);

    // ---- céu, tingimento e nuvens
    this.ceuCrep.alpha = amb.crepusculo;
    this.ceuNoite.alpha = amb.noite;
    this.fundo.tint = tom;
    this.atores.tint = tom;
    this.nuvens.forEach((n, i) => {
      n.x = Math.round(mod(rel * (2.2 + i * 0.8) + this.fase * 131 + i * 229, W + 80) - 50);
      n.y = 3 + ((i * 7 + this.fase * 5) % 14);
      n.alpha = 0.95 - amb.noite * 0.55;
    });

    // ---- coluna Expedição: prédio ou estrada
    this.cenExp.visible = !viajando;
    this.estrada.visible = viajando;
    this.janelasZ0.visible = !viajando;
    this.janelasZ0.alpha = esc;
    this.janelasResto.alpha = esc;
    if (viajando) {
      this.morros.tilePosition.x = Math.round(at.viagem * 0.22);
      const esp = 44;
      this.arvores.forEach((s, i) => {
        const base = i * esp;
        s.x = Math.round(mod(base + at.viagem, esp * this.arvores.length) - esp);
        s.y = HORIZONTE + 2 - s.height;
      });
      for (const s of [this.morros, this.estradaChao, this.estradaG, ...this.arvores]) s.tint = tom;
      const g = this.estradaG.clear();
      for (let x = -16 + mod(at.viagem, 16); x < ZONA.largura; x += 16) g.rect(Math.round(x), TRACEJADO_Y, 8, 1).fill(0xe6e2cf);
      for (let x = -18 + mod(at.viagem, 18); x < ZONA.largura; x += 18) g.rect(Math.round(x), HORIZONTE - 4, 1, 6).fill(0x8a6b4a);
      g.rect(0, HORIZONTE - 3, ZONA.largura, 1).fill({ color: 0x8a6b4a, alpha: 0.55 });
    }

    // ---- emissivos: visor da balança, semáforo, giroflex
    const e = this.emissivo.clear();
    let ledCor = 0x5dff7a;
    let ledOn = false;
    if (!viajando) {
      const naBalanca = at.local === 'balanca' && at.parado;
      const pes = at.pesagemExibida;
      let txt = '  0,0t';
      let cor = 0x1f4a2a;
      if (naBalanca && !pes) {
        txt = pisca(2) ? ' --,-t' : '';
        cor = 0x5dff7a;
        ledOn = true;
      } else if (naBalanca && pes) {
        txt = `${(at.visorKg / 1000).toFixed(1).replace('.', ',')}t`.padStart(6, ' ');
        cor = at.emAlerta ? (pisca(2.5) ? 0xff5d5d : 0x9a2e2e) : 0x5dff7a;
        ledCor = at.emAlerta ? 0xff4040 : 0x5dff7a;
        ledOn = true;
      }
      const x0 = VISOR.x + Math.floor((VISOR.w - larguraTexto(txt || ' ')) / 2);
      for (const [px, py] of pixelsTexto(txt)) e.rect(x0 + px, VISOR.y + 3 + py, 1, 1);
      if (txt) e.fill(cor);
      const vermelho = naBalanca && (!at.emAlerta || pisca(3));
      e.rect(SEMAFORO.x + 2, SEMAFORO.y + 2, 3, 3).fill(vermelho ? 0xff4b3e : 0x3e1716);
      e.rect(SEMAFORO.x + 2, SEMAFORO.y + 6, 3, 3).fill(0x3b2e10);
      e.rect(SEMAFORO.x + 2, SEMAFORO.y + 10, 3, 3).fill(naBalanca ? 0x12301a : 0x3dff6a);
      this.brilhoSemaforo.visible = true;
      this.brilhoSemaforo.tint = vermelho ? 0xff3b30 : 0x3dff6a;
      this.brilhoSemaforo.position.set(SEMAFORO.x + 3.5, SEMAFORO.y + (vermelho ? 3.5 : 11.5));
      this.brilhoSemaforo.alpha = vermelho || !naBalanca ? 0.55 + esc * 0.4 : 0;
    } else this.brilhoSemaforo.visible = false;
    this.brilhoLed.visible = ledOn;
    this.brilhoLed.tint = ledCor;
    this.brilhoLed.alpha = 0.32 + esc * 0.35;

    const carregando = at.despejando;
    const giro = carregando && Math.floor(rel * 4) % 2 === 0;
    e.rect(SINALEIRO.x - 1, SINALEIRO.y, 4, 3).fill(carregando ? (giro ? 0xffc040 : 0x9a5a10) : 0x4a2e10);
    this.brilhoGiro.alpha = carregando ? (giro ? 0.85 : 0.25) : 0;
    this.brilhoCalor.alpha = carregando ? 0.28 + Math.sin(rel * 3) * 0.06 : 0;
    // torre piscando
    const torreOn = pisca(0.8);

    // ---- luzes fixas noturnas
    for (const { s, l } of this.luzesFixas) {
      const vis = esc > 0.02 && !(viajando && l.zona === 0);
      for (const sp of s) {
        sp.visible = vis;
        if (vis) sp.alpha = (l.tipo === 'torre' ? (torreOn ? 1 : 0.15) : l.tipo === 'janela' ? 0.4 : l.tipo === 'holofote' ? 0.55 : sp.texture === obterArte().cone ? 0.5 : 0.9) * esc;
      }
    }

    // ---- caminhão
    const quique = viajando ? Math.floor(rel * 7) % 2 : 0;
    const x = Math.round(at.x);
    const topo = CHAO - CAMINHAO.chaoSprite - quique;
    const L = CAMINHAO.largura;
    const visivel = x < W + 4 && x > -L - 4;
    this.caminhao.visible = visivel;
    if (visivel) {
      const v = at.p.veiculo;
      const chave = v.frotaPropria ? 'cbb' : v.corCabine;
      if (chave !== this.chaveCorpo) {
        const t = corpo(v.corCabine, v.frotaPropria);
        this.base.texture = t.base;
        this.casco.texture = t.casco;
        this.chaveCorpo = chave;
      }
      this.caminhao.scale.x = at.direita ? -1 : 1;
      this.caminhao.position.set(at.direita ? x + L : x, topo);
      this.cabine.visible = at.motoristaDentro;
      const q = Math.floor(at.roda / 2.6);
      const fr = a.rodas[((q % 4) + 4) % 4];
      for (const s of this.rodas) s.texture = fr;
      // tanque "raio-x": o casco de inox fica transparente e o asfalto aparece enchendo por dentro
      const tr = at.transp;
      this.casco.alpha = 1 - 0.8 * tr;
      this.interior.visible = tr > 0.01;
      if (this.interior.visible) {
        this.interior.alpha = Math.min(1, tr * 1.25);
        this.desenharLiquido(at, rel);
      }
      // faróis e lanternas (acendem ao entardecer/noite)
      const frente = at.direita ? x + L - 1 : x;
      const tras = at.direita ? x + 1 : x + L - 2;
      const fy = topo + CAMINHAO.farolY + 1;
      const luzVeic = esc > 0.05;
      this.farol.visible = this.farolBrilho.visible = this.lanterna.visible = luzVeic;
      if (luzVeic) {
        this.farol.position.set(frente, fy);
        this.farol.rotation = at.direita ? -Math.PI / 2 : Math.PI / 2;
        this.farol.alpha = 0.55 * esc;
        this.farolBrilho.position.set(frente, fy);
        this.farolBrilho.alpha = 0.9 * esc;
        this.lanterna.position.set(tras, topo + CAMINHAO.lanternaY);
        this.lanterna.alpha = 0.8 * esc;
      }
    } else this.farol.visible = this.farolBrilho.visible = this.lanterna.visible = false;

    // ---- braço de carregamento
    const fim = DECK_Y + 2 + Math.round(at.braco * (BOCA_Y - DECK_Y - 2));
    const b = this.braco.clear();
    b.rect(BRACO_X - 1, DECK_Y + 2, 3, fim - DECK_Y - 1).fill(0x2c3036);
    b.rect(BRACO_X - 1, DECK_Y + 2, 1, fim - DECK_Y - 1).fill(0x6b737c);
    if (at.braco > 0.05) b.rect(BRACO_X - 3, DECK_Y + 4 + Math.round((fim - DECK_Y - 4) * 0.4), 7, 2).fill(0xffcc00);
    b.rect(BRACO_X - 3, fim, 7, 2).fill(0x1f2228);
    b.rect(BRACO_X - 3, fim, 7, 1).fill(0x4a4f57);

    // ---- partículas
    const p = this.particulas.clear();
    for (const q of at.particulas) {
      const al = Math.max(0, Math.min(1, q.vida * 1.1));
      const cor = corNum(q.cor);
      p.rect(Math.round(q.x), Math.round(q.y), q.vida > 0.8 && q.cor !== '#6f747c' ? 2 : 1, 1).fill({ color: cor, alpha: al });
    }

    // ---- motorista a pé
    const m = at.motorista;
    this.motorista.visible = m.visivel;
    if (m.visivel) {
      const f = a.motorista[Math.floor(m.passos / 3.2) % 4];
      this.motorista.texture = f;
      this.motorista.scale.x = m.dir < 0 ? -1 : 1;
      this.motorista.position.set(Math.round(m.x) + 7, PISO_MOTORISTA + 1);
    }

    // ---- alerta de divergência e divisórias
    const fr = this.frente.clear();
    this.brilhoAlerta.visible = at.emAlerta;
    if (at.emAlerta) {
      const al = 0.14 + 0.1 * Math.sin(rel * 6);
      fr.rect(0, 0, ZONA.largura, H).fill({ color: 0xe63232, alpha: al });
      fr.rect(1, 1, ZONA.largura - 2, H - 2).stroke({ color: 0xff4646, width: 2, alpha: 0.9 });
      this.brilhoAlerta.alpha = 0.25 + 0.15 * Math.sin(rel * 6);
    }
    fr.rect(ZONA.carregamento - 1, 0, 1, H).fill({ color: 0x141820, alpha: 0.55 });
    fr.rect(ZONA.preparo - 1, 0, 1, H).fill({ color: 0x141820, alpha: 0.55 });
  }
}

// ------------------------------------------------------------------ palco
export class Palco {
  private app = new Application();
  private pronto = false;
  private faixas = new Map<string, { el: HTMLElement; f: FaixaPixi }>();
  private pendentes = new Map<string, HTMLElement>();
  private camada?: HTMLElement;
  private larg = 0;
  private alt = 0;
  private seq = 0;

  async iniciar(camada: HTMLElement) {
    this.camada = camada;
    await this.app.init({
      backgroundAlpha: 0,
      antialias: false,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      autoStart: false,
      width: Math.max(1, camada.clientWidth),
      height: Math.max(1, camada.clientHeight),
      preference: 'webgl',
    });
    camada.appendChild(this.app.canvas);
    this.pronto = true;
    for (const [id, el] of this.pendentes) this.registrar(id, el);
    this.pendentes.clear();
  }

  registrar(id: string, el: HTMLElement) {
    if (!this.pronto) {
      this.pendentes.set(id, el);
      return;
    }
    const atual = this.faixas.get(id);
    if (atual) {
      atual.el = el;
      return;
    }
    const f = new FaixaPixi(this.seq++ % 7);
    this.app.stage.addChild(f.raiz);
    this.faixas.set(id, { el, f });
  }

  remover(id: string) {
    this.pendentes.delete(id);
    const r = this.faixas.get(id);
    if (!r) return;
    r.f.raiz.destroy({ children: true });
    this.faixas.delete(id);
  }

  /** Cópia 2D do quadro atual (depuração/inspeção visual). */
  capturar(): HTMLCanvasElement | null {
    if (!this.pronto) return null;
    return this.app.renderer.extract.canvas(this.app.stage) as HTMLCanvasElement;
  }

  desenhar(atores: Map<string, Ator>, rel: number, amb: Ambiente) {
    if (!this.pronto || !this.camada) return;
    const cam = this.camada;
    if (cam.clientWidth !== this.larg || cam.clientHeight !== this.alt) {
      this.larg = cam.clientWidth;
      this.alt = cam.clientHeight;
      this.app.renderer.resize(Math.max(1, this.larg), Math.max(1, this.alt));
    }
    const base = cam.getBoundingClientRect();
    const vh = window.innerHeight;
    for (const [id, { el, f }] of this.faixas) {
      const a = atores.get(id);
      const r = el.getBoundingClientRect();
      const naTela = !!a && r.width > 0 && r.bottom > 0 && r.top < vh;
      f.raiz.visible = naTela;
      if (!naTela) continue;
      f.raiz.position.set(Math.round(r.left - base.left), Math.round(r.top - base.top));
      f.raiz.scale.set(r.width / W);
      f.atualizar(a!, rel, amb);
    }
    this.app.render();
  }
}
