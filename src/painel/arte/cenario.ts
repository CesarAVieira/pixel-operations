/**
 * Cenário estático das 3 colunas (puro). Pintado uma vez e compartilhado por todas as faixas.
 *  - Fundo: horizonte de Curitiba (com a torre panorâmica) e araucárias, em tons de névoa
 *  - Expedição: escritório com placa CBB, balança rodoviária, visor e semáforo
 *  - Carregamento: tanques de armazenagem com a marca, plataforma de carregamento, escada, tubulação
 *  - Preparando o pedido: pátio com alambrado, postes, portaria CBB e cancela
 * O céu é separado (dia, entardecer e noite) para o ciclo de iluminação; `LUZES` lista o que acende à noite.
 */
import { MAT, mix, ramp } from '../../game/art/core/color';
import { PixelBuf, hash3, noise } from '../../game/art/core/pixbuf';
import { BALANCA, BRACO_X, CHAO, DECK_Y, H, HORIZONTE, SEMAFORO, SINALEIRO, TRACEJADO_Y, VIA_Y, VISOR, W, ZONA } from '../cena/geometria';
import { CBB, logoCbb, logoHex } from './marca';
import { araucaria, arbusto } from './sprites';

// ------------------------------------------------------------------ luzes noturnas
export type TipoLuz = 'poste' | 'janela' | 'holofote' | 'cidade' | 'torre';
export interface Luz {
  tipo: TipoLuz;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Coluna à qual pertence (as da Expedição somem quando a coluna vira estrada). */
  zona: 0 | 1 | 2;
}
export const LUZES: Luz[] = [];
const zonaDe = (x: number): 0 | 1 | 2 => (x < ZONA.carregamento ? 0 : x < ZONA.preparo ? 1 : 2);
const luz = (l: Omit<Luz, 'zona'>) => LUZES.push({ ...l, zona: zonaDe(l.x) });

// ------------------------------------------------------------------ céu
export type Ceu = 'dia' | 'crepusculo' | 'noite';
const CEUS: Record<Ceu, [string, string]> = {
  dia: ['#7fc0e8', '#d8eef8'],
  crepusculo: ['#5a5f9e', '#f6b36a'],
  noite: ['#08102a', '#26355f'],
};
export function ceu(tipo: Ceu): PixelBuf {
  const b = new PixelBuf(W, HORIZONTE);
  const [topo, base] = CEUS[tipo];
  for (let y = 0; y < HORIZONTE; y++) {
    const t = Math.pow(y / (HORIZONTE - 1), tipo === 'crepusculo' ? 1.6 : 1.3);
    // leve "dithering" de 2 tons para a transição não ficar em faixas lisas
    const c0 = mix(topo, base, t);
    const c1 = mix(topo, base, Math.min(1, t + 0.03));
    for (let x = 0; x < W; x++) b.set(x, y, (x + y) % 2 ? c0 : c1);
  }
  if (tipo === 'noite') {
    for (let i = 0; i < 140; i++) {
      const x = Math.floor(hash3(i, 1, 91) * W);
      const y = Math.floor(hash3(i, 2, 91) * (HORIZONTE - 14));
      const forte = hash3(i, 3, 91) > 0.85;
      b.set(x, y, forte ? '#ffffff' : hash3(i, 4, 91) > 0.5 ? '#c9d6ff' : '#8e9ccc');
      if (forte) {
        b.set(x + 1, y, 'rgba(200,214,255,0.5)');
        b.set(x - 1, y, 'rgba(200,214,255,0.5)');
      }
    }
    // lua
    b.ellipse(560, 10, 5, 5, '#f4f1dc');
    b.ellipse(562, 9, 4.2, 4.2, '#0d1633');
  }
  return b;
}

// ------------------------------------------------------------------ fundo (cidade e araucárias)
function horizonteCidade(b: PixelBuf) {
  const base = HORIZONTE - 3;
  let x = 0;
  let i = 0;
  while (x < W) {
    const larg = 7 + Math.floor(hash3(i, 7, 3) * 14);
    const alt = 5 + Math.floor(Math.pow(hash3(i, 8, 3), 1.6) * 20);
    const vazio = hash3(i, 9, 3) < 0.18;
    if (!vazio) {
      const topo = base - alt;
      const tom = hash3(i, 10, 3) > 0.5 ? '#b3c5d3' : '#a9bdcd';
      b.rect(x, topo, larg, alt, tom);
      b.vline(x + larg - 1, topo, base - 1, '#9fb3c4');
      b.hline(x, x + larg - 1, topo, '#bfd0dc');
      for (let wy = topo + 2; wy < base - 1; wy += 3)
        for (let wx = x + 1; wx < x + larg - 2; wx += 2)
          if (hash3(wx, wy, 5) < 0.45) {
            b.set(wx, wy, '#c3d2de');
            if (hash3(wx, wy, 6) < 0.18) luz({ tipo: 'cidade', x: wx, y: wy });
          }
    }
    x += larg + (vazio ? 6 : 0);
    i++;
  }
  // torre panorâmica de Curitiba (silhueta)
  const tx = 548;
  b.rect(tx, 15, 3, base - 15, '#a2b6c7');
  b.vline(tx, 15, base - 1, '#b6c7d5');
  b.rect(tx - 4, 17, 11, 3, '#9db1c3');
  b.hline(tx - 4, tx + 6, 17, '#bccbd8');
  b.vline(tx + 1, 6, 14, '#9db1c3');
  luz({ tipo: 'torre', x: tx + 1, y: 6 });
  // linha de mata distante
  for (let x2 = 0; x2 < W; x2++) {
    const n = noise(x2, 0, 11, 41) * 0.7 + noise(x2, 5, 4, 42) * 0.3;
    const topo = Math.round(HORIZONTE - 2 - n * 6);
    for (let y = topo; y < HORIZONTE; y++) b.set(x2, y, y === topo ? '#a6c8b4' : '#96bca6');
  }
  // araucárias em névoa
  const nevoa = ramp('#8fb4a0', 0.06);
  for (const [ax, esc] of [[118, 0.7], [196, 0.55], [470, 0.62], [602, 0.8]] as const) {
    const a = araucaria(esc, nevoa);
    b.draw(a, ax - Math.round(a.w / 2), HORIZONTE - a.h + 1);
  }
}

function chaoEVia(b: PixelBuf, x0: number, x1: number, tracejado = true) {
  for (let x = x0; x < x1; x++) {
    b.set(x, HORIZONTE, '#9ccb78');
    b.set(x, HORIZONTE + 1, hash3(x, 1, 5) < 0.3 ? '#7fb35f' : '#8cc06a');
    b.set(x, HORIZONTE + 2, '#cfcbc1');
    b.set(x, HORIZONTE + 3, '#bdb9ae');
    b.set(x, VIA_Y - 1, '#8a867c'); // meio-fio
  }
  for (let x = x0; x < x1; x += 11) b.vline(x, HORIZONTE + 2, HORIZONTE + 3, '#a8a499');
  for (let y = VIA_Y; y < H; y++)
    for (let x = x0; x < x1; x++) {
      const n = hash3(x, y, 77);
      b.set(x, y, n < 0.07 ? '#565a61' : n > 0.95 ? '#3d4147' : y === VIA_Y ? '#373b41' : y > H - 3 ? '#41454b' : '#4a4e55');
    }
  for (let x = x0; x < x1; x++) if (hash3(x, 2, 9) > 0.12) b.set(x, VIA_Y + 2, 'rgba(232,232,222,0.6)');
  if (tracejado) for (let x = x0; x < x1; x++) if (x % 16 < 8) b.set(x, TRACEJADO_Y, '#e6e2cf');
}

function poste(b: PixelBuf, x: number, topo: number) {
  b.vline(x, topo, HORIZONTE + 2, '#6b737c');
  b.vline(x + 1, topo + 1, HORIZONTE + 2, '#4b525b');
  b.hline(x - 6, x + 1, topo, '#5a626c');
  b.rect(x - 9, topo, 5, 2, '#3a4048');
  b.hline(x - 9, x - 5, topo + 2, '#fff2b0');
  luz({ tipo: 'poste', x: x - 7, y: topo + 2 });
}

// ------------------------------------------------------------------ Expedição
function expedicao(b: PixelBuf) {
  const par = ramp('#ecebe6', 0.05);
  const e0 = 6, e1 = 98, et = 18;
  // placa CBB sobre o prédio
  b.rect(16, 2, 50, 13, '#f7f7f4');
  b.rect(16, 2, 50, 1, '#ffffff');
  b.rect(16, 14, 50, 1, '#c9c7bf');
  b.vline(16, 2, 14, '#d8d6cf');
  b.vline(65, 2, 14, '#bdbbb3');
  logoCbb(b, 20, 8.5, 4.6, CBB.cinzaLogo);
  b.rect(24, 15, 2, 3, '#5a626c');
  b.rect(56, 15, 2, 3, '#5a626c');
  // prédio de dois andares
  b.rect(e0, et, e1 - e0, HORIZONTE + 1 - et, par.base);
  b.vline(e1 - 1, et, HORIZONTE, par.dk);
  b.vline(e0, et, HORIZONTE, par.lt);
  b.rect(e0 - 2, et - 2, e1 - e0 + 4, 3, '#4b5361'); // platibanda
  b.hline(e0 - 2, e1 + 1, et - 2, '#6b7482');
  b.rect(e0, et + 2, e1 - e0, 2, CBB.amarelo); // faixa amarela institucional
  b.hline(e0, e1 - 1, et + 4, 'rgba(0,0,0,0.12)');
  b.hline(e0, e1 - 1, 34, '#d6d4cc'); // laje entre pisos
  // janelas (andar de cima e de baixo)
  const jan = (x: number, y: number, w: number, h: number) => {
    b.rect(x, y, w, h, '#4e5866');
    b.rect(x + 1, y + 1, w - 2, h - 2, '#96c6e3');
    b.vline(x + Math.floor(w / 2), y + 1, y + h - 2, '#4e5866');
    b.set(x + 1, y + 1, '#e6f6ff');
    b.set(x + 2, y + 1, '#e6f6ff');
    b.set(x + 1, y + 2, '#e6f6ff');
    b.hline(x - 1, x + w, y + h, '#cfccc2');
    luz({ tipo: 'janela', x: x + 1, y: y + 1, w: w - 2, h: h - 2 });
  };
  for (const x of [11, 27, 43, 59, 75]) jan(x, 24, 12, 8);
  for (const x of [11, 27, 43]) jan(x, 38, 12, 9);
  // porta de vidro com marquise
  b.rect(62, 37, 18, HORIZONTE + 1 - 37, '#4e5866');
  b.rect(63, 38, 16, HORIZONTE - 38, '#8fc3e0');
  b.vline(70, 38, HORIZONTE, '#4e5866');
  b.vline(71, 38, HORIZONTE, '#4e5866');
  b.rect(60, 35, 22, 2, '#3d4450');
  b.hline(60, 81, 35, CBB.amarelo);
  luz({ tipo: 'janela', x: 63, y: 38, w: 16, h: HORIZONTE - 38 });
  // ar-condicionado e calha
  b.rect(85, 26, 9, 6, '#d6d8da');
  b.rect(86, 27, 4, 4, '#9aa0a6');
  b.vline(96, et, HORIZONTE, '#9a9890');
  b.draw(arbusto(1), 100, HORIZONTE - 8);
  b.draw(arbusto(0), 140, HORIZONTE - 8);
  // visor da balança
  b.vline(VISOR.x + 13, VISOR.y + VISOR.h, HORIZONTE + 2, '#59616b');
  b.vline(VISOR.x + 14, VISOR.y + VISOR.h, HORIZONTE + 2, '#3d434b');
  b.rect(VISOR.x - 2, VISOR.y - 2, VISOR.w + 4, VISOR.h + 4, '#2b2f36');
  b.hline(VISOR.x - 2, VISOR.x + VISOR.w + 1, VISOR.y - 2, '#4b525c');
  b.rect(VISOR.x, VISOR.y, VISOR.w, VISOR.h, '#0b0e12');
  // semáforo
  b.vline(SEMAFORO.x + 3, SEMAFORO.y + 14, HORIZONTE + 2, '#3d434b');
  b.rect(SEMAFORO.x, SEMAFORO.y, 7, 14, '#1c2026');
  b.vline(SEMAFORO.x, SEMAFORO.y, SEMAFORO.y + 13, '#363b43');
  b.rect(SEMAFORO.x - 1, SEMAFORO.y - 1, 9, 1, '#363b43');
  // balança rodoviária
  for (let x = BALANCA.x0; x <= BALANCA.x1; x++) {
    b.set(x, CHAO, '#a3aab1');
    b.set(x, CHAO + 1, x % 3 ? '#858c94' : '#adb4bb');
    b.set(x, CHAO + 2, (x + 1) % 3 ? '#7c838b' : '#9aa1a8');
    b.set(x, CHAO + 3, '#5a6067');
    b.set(x, CHAO + 4, '#3e4248');
  }
  for (let i = 0; i < 8; i++) {
    const c = Math.floor(i / 2) % 2 ? '#1c1c1c' : CBB.amarelo;
    b.vline(BALANCA.x0 + i, CHAO, CHAO + 3, c);
    b.vline(BALANCA.x1 - i, CHAO, CHAO + 3, c);
  }
}

// ------------------------------------------------------------------ Carregamento
function tanqueVertical(b: PixelBuf, x0: number, w: number, topo: number, logo: boolean) {
  const m = MAT.steel;
  for (let x = x0; x < x0 + w; x++) {
    const t = (x - x0) / (w - 1);
    const col = t < 0.08 ? m.dd : t < 0.16 ? m.dk : t < 0.3 ? m.lt : t < 0.4 ? m.hi : t < 0.66 ? m.base : t < 0.86 ? m.dk : m.dd;
    b.vline(x, topo, HORIZONTE + 1, col);
  }
  for (let i = 0; i < 4; i++) b.hline(x0 + 2 + i * 3, x0 + w - 3 - i * 3, topo - 1 - i, i % 2 ? m.lt : m.base);
  for (let y = topo + 8; y < HORIZONTE; y += 8) b.hline(x0, x0 + w - 1, y, 'rgba(58,68,80,0.22)');
  // escada com gaiola
  b.vline(x0 + w - 5, topo - 3, HORIZONTE, '#4a525d');
  b.vline(x0 + w - 2, topo - 3, HORIZONTE, '#4a525d');
  for (let y = topo; y < HORIZONTE; y += 2) b.hline(x0 + w - 4, x0 + w - 3, y, '#6b737c');
  // faixa amarela da marca + logo
  b.rect(x0 + 1, topo + 6, w - 7, 3, CBB.amarelo);
  b.hline(x0 + 1, x0 + w - 7, topo + 6, '#ffe066');
  if (logo) logoHex(b, x0 + (w - 6) / 2, topo + 19, 7, '#e9edf0');
}

function carregamento(b: PixelBuf) {
  tanqueVertical(b, 215, 44, 9, true);
  tanqueVertical(b, 388, 34, 15, false);
  // laje de concreto da baia (na via)
  const l0 = BRACO_X - 58, l1 = BRACO_X + 58;
  for (let y = VIA_Y; y < H; y++)
    for (let x = l0; x <= l1; x++) b.set(x, y, hash3(x, y, 13) < 0.1 ? '#8c8a84' : '#9d9a92');
  for (let x = l0; x <= l1; x += 29) b.vline(x, VIA_Y, H - 1, '#7b7973');
  b.vline(l0 - 1, VIA_Y, H - 1, '#6a6863');
  b.vline(l1 + 1, VIA_Y, H - 1, '#6a6863');
  b.hline(l0 + 2, l1 - 2, H - 3, '#4b4a46');
  for (let x = l0 + 2; x <= l1 - 2; x += 2) b.set(x, H - 3, '#2f2e2b');
  // faixas de parada amarelas
  for (const sx of [l0 + 4, l1 - 6]) for (let y = VIA_Y + 2; y < CHAO - 1; y++) b.rect(sx, y, 2, 1, Math.floor(y / 2) % 2 ? CBB.amarelo : '#1c1c1c');

  // plataforma de carregamento (estrutura amarela)
  const y = ramp(CBB.amarelo, 0.1);
  const c0 = BRACO_X - 40, c1 = BRACO_X + 36;
  for (const cx of [c0, c1]) {
    b.rect(cx, DECK_Y - 4, 4, CHAO - DECK_Y + 4, y.base);
    b.vline(cx, DECK_Y - 4, CHAO - 1, y.hi);
    b.vline(cx + 3, DECK_Y - 4, CHAO - 1, y.dk);
    b.rect(cx - 1, CHAO - 1, 6, 2, '#5d636a');
  }
  b.line(c0 + 4, DECK_Y + 4, c1 - 1, DECK_Y + 16, 'rgba(160,110,20,0.5)');
  b.line(c0 + 4, DECK_Y + 16, c1 - 1, DECK_Y + 4, 'rgba(160,110,20,0.5)');
  // piso (grade) e guarda-corpo
  b.rect(c0 - 6, DECK_Y - 4, c1 - c0 + 16, 4, '#56606a');
  b.hline(c0 - 6, c1 + 9, DECK_Y - 4, '#7d858f');
  for (let x = c0 - 5; x < c1 + 9; x += 2) b.set(x, DECK_Y - 2, '#3c424a');
  b.hline(c0 - 6, c1 + 9, DECK_Y - 9, y.hi);
  b.hline(c0 - 6, c1 + 9, DECK_Y - 8, y.base);
  b.hline(c0 - 6, c1 + 9, DECK_Y - 6, y.dk);
  for (let x = c0 - 6; x <= c1 + 9; x += 6) b.vline(x, DECK_Y - 8, DECK_Y - 5, y.dk);
  // holofotes sob a plataforma
  for (const hx of [c0 + 12, c1 - 10]) {
    b.rect(hx - 2, DECK_Y, 5, 2, '#2c3138');
    b.hline(hx - 1, hx + 1, DECK_Y + 2, '#fff2b0');
    luz({ tipo: 'holofote', x: hx, y: DECK_Y + 2 });
  }
  // escada descendo à direita
  for (let i = 0; i < 19; i++) b.hline(c1 + 9 + i, c1 + 11 + i, DECK_Y + i * 2, '#5a626c');
  b.line(c1 + 9, DECK_Y + 1, c1 + 28, DECK_Y + 39, '#3c424a');
  b.line(c1 + 9, DECK_Y - 4, c1 + 28, DECK_Y + 34, y.base);
  // tubulação do tanque até a plataforma
  for (const [yy, c] of [[DECK_Y + 1, '#2c3036'], [DECK_Y + 2, '#4a5058'], [DECK_Y + 3, '#22252a']] as const) b.hline(259, BRACO_X + 3, yy, c);
  for (let x = 266; x < BRACO_X; x += 14) b.rect(x, DECK_Y, 1, 5, '#8a929c');
  b.rect(BRACO_X - 4, DECK_Y, 9, 4, '#2c3036'); // junta giratória
  b.hline(BRACO_X - 3, BRACO_X + 3, DECK_Y, '#5a626c');
  // giroflex (a luz é pintada a cada quadro)
  b.rect(SINALEIRO.x - 2, SINALEIRO.y + 3, 6, 2, '#2c3036');
  b.rect(SINALEIRO.x - 1, SINALEIRO.y, 4, 3, '#5a3a12');
}

// ------------------------------------------------------------------ Preparando o pedido
function preparo(b: PixelBuf) {
  const z = ZONA.preparo;
  for (let x = z + 2; x < z + 160; x++) {
    for (let yy = 37; yy < HORIZONTE; yy++) if ((x + yy) % 4 === 0 || (x - yy) % 4 === 0) b.set(x, yy, 'rgba(112,124,136,0.42)');
    b.set(x, 36, '#a3acb6');
  }
  for (let x = z + 2; x < z + 160; x += 14) {
    b.vline(x, 34, HORIZONTE + 1, '#6b737c');
    b.set(x, 33, '#4b525b');
  }
  [z + 16, z + 74, z + 128].forEach((x, i) => b.draw(arbusto(i), x, HORIZONTE - 8));
  poste(b, z + 46, 6);
  poste(b, z + 132, 6);
  // placa de estacionamento
  b.vline(z + 154, 26, HORIZONTE, '#6b737c');
  b.rect(z + 148, 15, 13, 12, '#2361b0');
  b.hline(z + 148, z + 160, 15, '#5b93d4');
  b.vline(z + 152, 17, 24, '#ffffff');
  b.hline(z + 153, z + 155, 17, '#ffffff');
  b.vline(z + 156, 18, 19, '#ffffff');
  b.hline(z + 153, z + 155, 20, '#ffffff');
  // portaria com marca
  const p0 = z + 168, p1 = z + 208;
  const par = ramp('#efede6', 0.05);
  b.rect(p0, 26, p1 - p0, HORIZONTE + 1 - 26, par.base);
  b.vline(p1 - 1, 26, HORIZONTE, par.dk);
  b.rect(p0 - 3, 21, p1 - p0 + 6, 5, '#3d4450');
  b.hline(p0 - 3, p1 + 2, 21, '#5a626c');
  b.hline(p0 - 3, p1 + 2, 25, CBB.amarelo);
  logoHex(b, p0 + 6, 23.5, 2.6);
  b.rect(p0 + 4, 31, 18, 9, '#4e5866');
  b.rect(p0 + 5, 32, 16, 7, '#96c6e3');
  b.set(p0 + 5, 32, '#e6f6ff');
  b.set(p0 + 6, 32, '#e6f6ff');
  luz({ tipo: 'janela', x: p0 + 5, y: 32, w: 16, h: 7 });
  b.rect(p0 + 26, 33, 9, HORIZONTE + 1 - 33, '#8a6a4a');
  b.set(p0 + 32, 42, '#e8c27a');
  // cancela (levantada)
  b.rect(p0 - 9, 40, 5, 12, '#e8e8e0');
  b.rect(p0 - 9, 40, 5, 2, '#d22f2a');
  for (let i = 0; i < 20; i++) b.set(p0 - 7 + Math.round(i * 0.22), 39 - i, Math.floor(i / 3) % 2 ? '#d22f2a' : '#f2f2ee');
  // vagas pintadas
  for (const vx of [z + 36, z + 176]) for (let yy = VIA_Y + 4; yy < CHAO - 1; yy++) b.set(vx, yy, '#dddac9');
}

function recortar(src: PixelBuf, x0: number, w: number): PixelBuf {
  const b = new PixelBuf(w, src.h);
  for (let y = 0; y < src.h; y++) b.data.set(src.data.subarray((y * src.w + x0) * 4, (y * src.w + x0 + w) * 4), y * w * 4);
  return b;
}

let cache: { expedicao: PixelBuf; resto: PixelBuf } | null = null;
/** Cenário (sem céu) dividido em: coluna Expedição e colunas Carregamento + Preparo. */
export function cenario() {
  if (!cache) {
    LUZES.length = 0;
    const b = new PixelBuf(W, H);
    horizonteCidade(b);
    chaoEVia(b, 0, W);
    expedicao(b);
    carregamento(b);
    preparo(b);
    cache = { expedicao: recortar(b, 0, ZONA.largura), resto: recortar(b, ZONA.carregamento, W - ZONA.carregamento) };
  }
  return cache;
}

/** Chão da coluna Expedição em modo "em viagem" (sem tracejado: ele corre a cada quadro). */
export function estradaChao(): PixelBuf {
  const b = new PixelBuf(ZONA.largura, H);
  chaoEVia(b, 0, ZONA.largura, false);
  for (let x = 0; x < ZONA.largura; x++) {
    b.set(x, HORIZONTE, '#86c06a');
    b.set(x, HORIZONTE + 1, '#78b25d');
    b.set(x, HORIZONTE + 2, '#6fa857');
    b.set(x, HORIZONTE + 3, '#6fa857');
  }
  return b;
}

/** Ladrilho de morros para o paralaxe da viagem. */
export function morros(): PixelBuf {
  const w = 160, h = 22;
  const b = new PixelBuf(w, h);
  for (let x = 0; x < w; x++) {
    const a = Math.sin((x / w) * Math.PI * 2) * 4 + Math.sin((x / w) * Math.PI * 6 + 1) * 1.6;
    const top = Math.round(7 + a);
    for (let y = top; y < h; y++) b.set(x, y, y === top ? '#9bd384' : y < top + 3 ? '#86c770' : '#79bb63');
    const top2 = Math.round(13 + Math.sin((x / w) * Math.PI * 4 + 2) * 2.5);
    for (let y = top2; y < h; y++) b.set(x, y, y === top2 ? '#64ad56' : '#57a04c');
  }
  return b;
}

/** Fonte 3×5 para o visor da balança. */
const GLIFOS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', ',': '000000000010100', t: '010111010010011',
  '-': '000000111000000', ' ': '000000000000000',
};
export function pixelsTexto(txt: string): [number, number][] {
  const px: [number, number][] = [];
  [...txt].forEach((ch, i) => {
    const g = GLIFOS[ch] ?? GLIFOS[' '];
    for (let k = 0; k < 15; k++) if (g[k] === '1') px.push([i * 4 + (k % 3), Math.floor(k / 3)]);
  });
  return px;
}
export const larguraTexto = (txt: string) => txt.length * 4 - 1;
