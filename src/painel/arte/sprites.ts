/**
 * Sprites do painel em vista LATERAL (puro: PixelBuf, testável em Node).
 * Caminhão: cavalo mecânico + semirreboque tanque térmico em inox polido, voltado para a ESQUERDA
 * (sentido do fluxo); para andar à direita o desenho é espelhado.
 * Frota própria CBB: cabine branca, saia/para-choque e faixa de teto amarelos, logo na porta e no
 * tanque e o "swoosh" colorido atrás da porta — como os caminhões reais do site da empresa.
 */
import { MAT, mix, ramp, shade } from '../../game/art/core/color';
import { PixelBuf } from '../../game/art/core/pixbuf';
import { CAMINHAO } from '../cena/geometria';
import { CBB, letrasCbb, logoHex } from './marca';

/** Faixas de reflexo do inox polido (t = 0 no topo do tanque). */
export function inox(t: number): string {
  return t < 0.06 ? '#7a848e' : t < 0.14 ? '#d9e0e6' : t < 0.22 ? '#ffffff' : t < 0.3 ? '#eef2f5' : t < 0.42 ? '#c9d1d8' : t < 0.55 ? '#b0bac3' : t < 0.64 ? '#9aa6b0' : t < 0.72 ? '#b9c5cf' : t < 0.8 ? '#a3afba' : t < 0.9 ? '#87939e' : '#6a7681';
}

export interface Libre {
  cor: string;
  cbb: boolean;
}

const VIDRO = ramp('#7fbde0', 0.12);
const MOLDURA = '#26384c';

export function corpoCaminhao(lib: Libre): PixelBuf {
  const b = new PixelBuf(CAMINHAO.largura, CAMINHAO.altura);
  const c = ramp(lib.cbb ? '#eef0f2' : lib.cor, lib.cbb ? 0.06 : 0.12);
  const am = ramp(CBB.amarelo, 0.1);
  const saia = lib.cbb ? am : ramp(shade(lib.cor, -0.35), 0.1);

  // ======================= semirreboque tanque =======================
  const { x0, x1, y0, y1 } = CAMINHAO.tanque;
  const h = y1 - y0;
  for (let y = y0; y <= y1; y++) {
    const [xa, xb] = linhaTanque(y)!;
    const col = inox((y - y0) / h);
    b.hline(xa, xb, y, col);
    b.set(xa, y, shade(col, -0.26));
    b.set(xa + 1, y, shade(col, -0.14));
    b.set(xa + 2, y, shade(col, -0.05));
    b.set(xb, y, shade(col, -0.2));
    b.set(xb - 1, y, shade(col, 0.06));
  }
  // anéis de reforço (com brilho)
  for (let rx = x0 + 12; rx < x1 - 6; rx += 12) {
    for (let y = y0 + 1; y < y1; y++) {
      b.set(rx, y, 'rgba(58,68,80,0.30)');
      b.set(rx + 1, y, 'rgba(255,255,255,0.32)');
    }
  }
  // passarela, guarda-corpo rebatido e bocas de visita
  b.hline(x0 + 6, x1 - 8, y0 - 1, '#56606c');
  for (let x = x0 + 7; x < x1 - 8; x += 2) b.set(x, y0 - 1, '#7b8592');
  b.hline(x0 + 6, x1 - 8, y0 - 6, am.hi);
  b.hline(x0 + 6, x1 - 8, y0 - 5, am.base);
  for (let px = x0 + 6; px <= x1 - 8; px += 7) b.vline(px, y0 - 5, y0 - 2, am.dk);
  for (const hx of [CAMINHAO.boca - 16, CAMINHAO.boca, CAMINHAO.boca + 16]) {
    b.rect(hx - 3, y0 - 3, 7, 3, '#5a636e');
    b.hline(hx - 2, hx + 2, y0 - 4, '#c3cad1');
    b.set(hx - 2, y0 - 3, '#9aa4ae');
    b.set(hx + 3, y0 - 2, '#3e4650');
  }
  // escada traseira
  b.vline(x1 - 7, y0 - 4, y1 - 1, '#4a525d');
  b.vline(x1 - 4, y0 - 4, y1 - 1, '#4a525d');
  for (let y = y0 - 3; y < y1; y += 3) b.hline(x1 - 6, x1 - 5, y, '#7d8792');
  // logo no tanque (frota própria) ou faixa da transportadora
  if (lib.cbb) {
    logoHex(b, 53, 24.5, 6.2);
    letrasCbb(b, 62, 20, 2, '#6c7075', 'rgba(255,255,255,0.55)');
  } else {
    b.rect(x0 + 8, 21, 46, 3, lib.cor);
    b.hline(x0 + 8, x0 + 53, 21, shade(lib.cor, 0.25));
  }
  // painel laranja (ONU 99/3257) e rótulo de risco classe 9
  b.rect(86, 25, 10, 7, '#f08a24');
  b.hline(86, 95, 25, '#f7b26a');
  b.hline(86, 95, 28, '#2a1d14');
  b.rect(87, 26, 2, 1, '#2a1d14');
  b.rect(91, 30, 3, 1, '#2a1d14');
  for (let i = 0; i <= 3; i++) {
    b.hline(99 - i, 99 + i, 24 + i, '#f2f2ee');
    b.hline(99 - i, 99 + i, 30 - i, '#f2f2ee');
  }
  for (let x = 97; x <= 101; x += 2) b.vline(x, 24 + Math.abs(99 - x), 26, '#1c1c1c');
  // faixa refletiva vermelha/branca
  for (let x = x0 + 5; x <= x1 - 5; x++) b.set(x, y1 - 1, Math.floor((x - x0) / 4) % 2 ? '#d22f2a' : '#f4f4ef');

  // ======================= chassi e conjunto inferior =======================
  b.rect(4, 42, 104, 3, '#2a2d36');
  b.hline(4, 107, 42, '#3c414c');
  b.rect(33, 40, 14, 2, '#24272e'); // quinta-roda
  b.rect(52, 39, 3, 8, '#3a3f47'); // pé de apoio
  b.rect(50, 47, 7, 1, '#22252b');
  b.hline(56, 66, 45, '#8a929c'); // protetor lateral
  b.hline(56, 66, 46, '#5a616b');
  b.rect(60, 39, 9, 3, '#5b636d'); // caixa da válvula de descarga
  b.hline(60, 68, 39, '#7d858f');
  b.rect(64, 40, 2, 1, '#d22f2a');
  b.hline(68, 106, 38, '#30343c'); // para-lamas do reboque
  b.rect(67, 41, 1, 7, '#17181c'); // para-barro
  b.rect(103, 44, 7, 2, '#3a3f47'); // para-choque traseiro
  b.hline(103, 109, 44, '#5a616b');
  b.rect(108, CAMINHAO.lanternaY - 2, 2, 4, '#e23b3b');
  b.set(108, CAMINHAO.lanternaY + 2, '#f2a52b');

  // ======================= cavalo mecânico (cabine à esquerda) =======================
  // teto e corpo
  b.hline(7, 29, 12, c.lt);
  b.hline(5, 30, 13, c.base);
  b.rect(3, 14, 28, 28, c.base);
  b.hline(4, 30, 14, c.hi);
  b.vline(30, 13, 41, c.dk);
  b.vline(29, 15, 41, shade(c.base, -0.04));
  // face dianteira (vista em ângulo)
  b.rect(2, 15, 2, 26, c.dk);
  b.vline(2, 15, 40, c.dd);
  // faixa de teto amarela (frota CBB) / quebra-sol
  if (lib.cbb) {
    b.hline(3, 15, 14, am.hi);
    b.hline(2, 15, 15, am.base);
    b.hline(2, 13, 16, am.dk);
  } else {
    b.hline(2, 12, 15, c.dd);
  }
  // vidro dianteiro (borda) e janela lateral pequena
  b.rect(3, 17, 2, 10, MOLDURA);
  b.vline(4, 18, 25, VIDRO.dk);
  b.rect(6, 17, 5, 9, MOLDURA);
  b.rect(7, 18, 3, 7, VIDRO.base);
  b.set(7, 18, VIDRO.hi);
  // janela da porta (o motorista aparece aqui quando está dirigindo)
  const j = CAMINHAO.janela;
  b.rect(j.x - 1, j.y - 1, j.w + 2, j.h + 2, MOLDURA);
  b.rect(j.x, j.y, j.w, j.h, VIDRO.base);
  b.hline(j.x, j.x + j.w - 1, j.y, VIDRO.lt);
  for (let i = 0; i < 4; i++) b.set(j.x + 6 + i, j.y + 1 + i, VIDRO.hi); // reflexo diagonal
  for (let i = 0; i < 3; i++) b.set(j.x + 9 + i, j.y + 1 + i, VIDRO.lt);
  // porta
  b.vline(11, 16, 41, c.dk);
  b.vline(25, 16, 41, c.dk);
  b.hline(21, 23, 30, '#2a2d36');
  b.set(23, 29, '#4a4f57');
  // logo na porta e swoosh (frota CBB) / faixa (terceiros)
  if (lib.cbb) {
    logoHex(b, 15, 33.5, 3.4);
    letrasCbb(b, 19, 32, 1, CBB.cinzaLogo);
    // swoosh atrás da porta (verde, azul, amarelo)
    for (let i = 0; i < 22; i++) {
      const x = 28 - Math.round(i * 0.12);
      const y = 16 + i;
      b.set(x, y, CBB.verde);
      b.set(x - 1, y + 1, CBB.azul);
      if (i > 6) b.set(x - 2, y + 2, CBB.amarelo);
    }
  } else {
    b.hline(3, 28, 33, mix(c.base, '#ffffff', 0.55));
    b.hline(3, 28, 34, c.dd);
  }
  // saia lateral e para-choque
  b.rect(3, 38, 28, 4, saia.base);
  b.hline(3, 30, 38, saia.hi);
  b.hline(3, 30, 41, saia.dk);
  b.rect(0, 36, 6, 8, lib.cbb ? am.base : '#4b525c');
  b.hline(0, 5, 36, lib.cbb ? am.hi : '#7a828c');
  b.hline(0, 5, 43, '#1c1e23');
  b.rect(0, 38, 1, 4, lib.cbb ? am.dk : '#3a3f47');
  // faróis, seta, neblina
  b.rect(0, CAMINHAO.farolY, 2, 2, '#fff4c2');
  b.set(2, CAMINHAO.farolY, '#ffe38a');
  b.set(0, CAMINHAO.farolY + 2, '#f2a52b');
  b.rect(1, 40, 2, 1, '#e8eef2');
  // espelho retrovisor
  b.hline(0, 2, 19, '#23262b');
  b.rect(0, 16, 2, 7, '#23262b');
  b.set(0, 17, '#5a6470');
  // arco da roda dianteira, degrau, tanque de combustível e caixa de bateria
  b.hline(8, 24, 37, c.dd);
  b.set(7, 38, c.dd);
  b.set(25, 38, c.dd);
  b.rect(12, 42, 8, 2, '#59616b');
  b.rect(14, 43, 12, 5, '#b9c0c7');
  b.hline(14, 25, 43, '#eef2f5');
  b.hline(14, 25, 44, '#d4dade');
  b.hline(14, 25, 47, '#7d858f');
  b.vline(14, 43, 47, '#9aa2aa');
  b.rect(26, 43, 5, 4, '#2c3038');
  // chaminé de escape com protetor térmico
  b.vline(32, 5, 41, '#aeb7c0');
  b.vline(33, 5, 41, '#6b737c');
  b.rect(31, 18, 4, 10, '#c9d0d6');
  for (let y = 19; y < 28; y += 2) b.hline(31, 34, y, '#8d959e');
  b.hline(32, 33, 4, '#3a3d42');

  b.outline();
  return b;
}

/** Faixa horizontal [xa, xb] ocupada pelo casco do tanque na linha y (perfil com calotas arredondadas). */
export function linhaTanque(y: number): [number, number] | null {
  const { x0, x1, y0, y1 } = CAMINHAO.tanque;
  if (y < y0 || y > y1) return null;
  const t = (y - y0) / (y1 - y0);
  const curva = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
  const ins = Math.round(4.2 * (1 - curva));
  return [x0 + ins, x1 - ins];
}

/**
 * Separa o caminhão em duas camadas: o CASCO do tanque (inox, faixa, logo, placas) e a BASE
 * (cabine, chassi, passarela, guarda-corpo e o contorno do tanque). Com o casco semitransparente
 * o tanque vira "raio-x" e o asfalto aparece por dentro, mantendo o contorno firme.
 */
export function partesCaminhao(lib: Libre): { base: PixelBuf; casco: PixelBuf } {
  const full = corpoCaminhao(lib);
  const base = new PixelBuf(full.w, full.h);
  const casco = new PixelBuf(full.w, full.h);
  base.data.set(full.data);
  for (let y = 0; y < full.h; y++) {
    const faixa = linhaTanque(y);
    if (!faixa) continue;
    for (let x = faixa[0]; x <= faixa[1]; x++) {
      const i = (y * full.w + x) * 4;
      casco.data.set(full.data.subarray(i, i + 4), i);
      base.data.fill(0, i, i + 4);
    }
  }
  return { base, casco };
}

/** Interior do tanque (aço escuro com as cavernas de reforço) — também serve de máscara do líquido. */
export function interiorTanque(): PixelBuf {
  const b = new PixelBuf(CAMINHAO.largura, CAMINHAO.altura);
  const { x0, x1, y0, y1 } = CAMINHAO.tanque;
  for (let y = y0; y <= y1; y++) {
    const [xa, xb] = linhaTanque(y)!;
    const t = (y - y0) / (y1 - y0);
    // interior claro (aço iluminado visto "através" do casco) para o asfalto preto contrastar
    b.hline(xa, xb, y, mix('#d3dee7', '#93a3b2', t));
    b.set(xa, y, '#5b6875');
    b.set(xa + 1, y, '#7d8c9a');
    b.set(xb, y, '#5b6875');
  }
  for (let rx = x0 + 12; rx < x1 - 6; rx += 12)
    for (let y = y0 + 1; y < y1; y++) {
      b.set(rx, y, 'rgba(70,82,96,0.45)');
      b.set(rx + 1, y, 'rgba(255,255,255,0.35)');
    }
  return b;
}

/** Motorista visto pela janela (cabeça e ombros), para quando está dirigindo. */
export function motoristaCabine(): PixelBuf {
  const b = new PixelBuf(CAMINHAO.janela.w, CAMINHAO.janela.h);
  const pele = '#d9a57f';
  b.rect(3, 1, 4, 1, '#2b2118');
  b.rect(2, 2, 5, 4, pele);
  b.set(2, 2, '#2b2118');
  b.set(3, 4, '#2a1d14');
  b.rect(1, 6, 8, 3, '#3f6ea8');
  b.rect(4, 6, 2, 1, pele);
  return b;
}

/** Roda (15×15) com 4 quadros de giro. */
export function rodaQuadros(): PixelBuf[] {
  const n = 15, c = n / 2;
  return [0, 1, 2, 3].map((f) => {
    const b = new PixelBuf(n, n);
    b.ellipse(c, c, 7, 7, '#121418');
    b.ellipse(c, c, 6.2, 6.2, '#262931');
    b.ellipse(c, c, 5.2, 5.2, '#30343d');
    b.set(4, 2, '#454a56');
    b.set(3, 3, '#454a56');
    b.set(5, 1, '#3c414c');
    b.ellipse(c, c, 3.8, 3.8, '#b8c0c8');
    b.ellipse(c, c, 3.1, 3.1, '#9aa3ad');
    b.set(6, 5, '#e6ebef');
    b.set(5, 6, '#e6ebef');
    b.ellipse(c, c, 1.6, 1.6, '#5d6570');
    b.set(7, 7, '#2a2e35');
    const a0 = (f * Math.PI) / 6;
    for (let k = 0; k < 6; k++) {
      const a = a0 + (k * Math.PI) / 3;
      b.set(Math.round(7 + Math.cos(a) * 2.4), Math.round(7 + Math.sin(a) * 2.4), k % 2 ? '#7d858f' : '#f4f6f8');
    }
    return b;
  });
}

/**
 * Motorista a pé (voltado à direita), com EPI do pátio: capacete branco e colete laranja refletivo.
 * Quadros 0–3: caminhada; 4: parado.
 */
export function motoristaQuadros(): PixelBuf[] {
  const pele = '#d9a57f', cab = '#2b2118';
  const cap = ramp('#f2f2ee', 0.06);
  const camisa = ramp('#3f6ea8', 0.12);
  const colete = ramp('#f07a1c', 0.1);
  const calca = ramp('#2b3a5c', 0.1);
  const bota = '#1a1714';
  return [0, 1, 2, 3, 4].map((f) => {
    const b = new PixelBuf(14, 24);
    b.ox = 1;
    b.oy = 1;
    // capacete
    b.rect(3, 0, 6, 1, cap.lt);
    b.rect(2, 1, 8, 2, cap.base);
    b.hline(9, 10, 2, cap.dk); // aba
    b.set(4, 0, cap.hi);
    // cabeça
    b.rect(3, 3, 6, 4, pele);
    b.set(3, 3, cab);
    b.set(3, 4, cab);
    b.set(7, 4, '#2a1d14');
    b.set(8, 6, shade(pele, -0.15));
    b.rect(4, 7, 4, 1, shade(pele, -0.2)); // pescoço
    // tronco: camisa + colete com faixas refletivas
    b.rect(2, 8, 8, 7, colete.base);
    b.hline(2, 9, 8, colete.lt);
    b.vline(2, 8, 14, colete.dk);
    b.hline(2, 9, 11, '#e9ecef');
    b.hline(2, 9, 13, '#e9ecef');
    b.vline(6, 8, 14, colete.dk);
    // braço (balanço oposto às pernas)
    const bx = f === 1 ? 8 : f === 3 ? 3 : 5;
    b.rect(bx, 9, 2, 4, camisa.base);
    b.set(bx, 9, camisa.lt);
    b.rect(bx, 13, 2, 1, pele);
    // quadril
    b.rect(3, 15, 6, 1, calca.dk);
    // pernas
    const passo = f === 1 ? 2 : f === 3 ? -2 : 0;
    if (passo === 0) {
      b.rect(3, 16, 2, 5, calca.base);
      b.rect(7, 16, 2, 5, calca.dk);
      b.rect(3, 21, 3, 1, bota);
      b.rect(7, 21, 3, 1, bota);
    } else {
      const fr = passo > 0 ? 8 : 2, tr = passo > 0 ? 2 : 8;
      b.rect(5, 16, 2, 2, calca.base);
      b.line(5, 17, fr, 20, calca.base);
      b.line(6, 17, fr + 1, 20, calca.base);
      b.line(5, 17, tr, 20, calca.dk);
      b.line(6, 17, tr + 1, 20, calca.dk);
      b.rect(fr, 21, 3, 1, bota);
      b.rect(tr - 1, 21, 3, 1, bota);
    }
    b.ox = 0;
    b.oy = 0;
    b.outline();
    return b;
  });
}

/** Araucária (símbolo do Paraná): tronco alto e copa em "taça" de camadas. */
export function araucaria(escala = 1, cor = MAT.pine): PixelBuf {
  const w = Math.round(30 * escala), h = Math.round(40 * escala);
  const b = new PixelBuf(w, h);
  const cx = w / 2;
  b.rect(cx - 1, h * 0.3, 2, h * 0.7, MAT.bark.base);
  b.vline(Math.floor(cx - 1), Math.round(h * 0.3), h - 1, MAT.bark.lt);
  const camadas = 4;
  for (let i = 0; i < camadas; i++) {
    const y = Math.round(h * (0.06 + i * 0.09));
    const meia = (w / 2 - 1) * (0.55 + i * 0.15);
    for (let x = Math.round(cx - meia); x <= Math.round(cx + meia); x++) {
      const dx = Math.abs(x - cx) / meia;
      const curva = Math.round(dx * dx * 4 * escala);
      b.vline(x, y + curva - Math.round(2 * escala), y + curva, i % 2 ? cor.dk : cor.base);
      b.set(x, y + curva - Math.round(2 * escala), cor.lt);
    }
  }
  b.outline();
  return b;
}

export function arvore(variante = 0): PixelBuf {
  const b = new PixelBuf(20, 28);
  const folha = variante % 2 ? MAT.leafDark : MAT.leaf;
  b.rect(9, 16, 3, 11, MAT.bark.base);
  b.vline(9, 16, 26, MAT.bark.lt);
  b.ellipse(10, 11, 8.5, 8, folha.dk);
  b.ellipse(9.5, 10, 7.4, 7, folha.base);
  b.ellipse(8, 8, 4.4, 4, folha.lt);
  b.set(6, 5, folha.hi);
  b.set(7, 4, folha.hi);
  b.set(12, 7, folha.lt);
  b.outline();
  return b;
}

export function nuvem(v = 0): PixelBuf {
  const b = new PixelBuf(42, 15);
  const sombra = '#d3e3ee';
  b.ellipse(13, 9, 10, 5, sombra);
  b.ellipse(27, 9, 11, 5.2, sombra);
  b.ellipse(18, 6.5, 8.5, 5.2, '#ffffff');
  b.ellipse(28 + (v % 2) * 2, 7.5, 7, 4.2, '#ffffff');
  b.ellipse(10, 8.5, 6, 3.4, '#f7fbfd');
  b.hline(5, 37, 13, sombra);
  return b;
}

export function arbusto(v = 0): PixelBuf {
  const b = new PixelBuf(16, 9);
  const m = v % 2 ? MAT.leafDark : MAT.leaf;
  b.ellipse(8, 6, 7.5, 4, m.dk);
  b.ellipse(7.5, 5, 6.2, 3.5, m.base);
  b.set(5, 3, m.hi);
  b.set(9, 3, m.lt);
  b.set(11, 4, m.lt);
  return b;
}
