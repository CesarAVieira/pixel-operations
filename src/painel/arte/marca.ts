/**
 * Identidade visual CBB Asfaltos (fonte: cbbasfaltos.com.br): amarelo #FFCC00 e o anel hexagonal
 * do logo em amarelo/laranja, verde e azul, com "cbb" em cinza. Aqui ficam as cores e a versão em
 * pixel art do logo usada no cenário e nos caminhões.
 */
import type { PixelBuf } from '../../game/art/core/pixbuf';

export const CBB = {
  amarelo: '#ffcc00',
  amareloEsc: '#e0a800',
  laranja: '#f0a800',
  verde: '#189030',
  verdeClaro: '#48a830',
  azul: '#1878c0',
  azulClaro: '#0090d8',
  marinho: '#0d2a52',
  cinzaLogo: '#787878',
  grafite: '#333333',
} as const;

const K = Math.cos(Math.PI / 6);
/** Distância "hexagonal" (hexágono com vértices em cima e embaixo, lados verticais). */
const hexDist = (dx: number, dy: number) => Math.max(Math.abs(dx) / K, (0.5 * Math.abs(dx)) / K + Math.abs(dy));

/**
 * Anel hexagonal do logo centrado em (cx, cy) com raio externo r.
 * Esquerda: amarelo→laranja; topo/direita-alta: verde; direita-baixa/base: azul; dobras escurecidas.
 */
export function logoHex(b: PixelBuf, cx: number, cy: number, r: number, miolo?: string) {
  const esp = Math.max(1.2, r * 0.42);
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = hexDist(dx, dy);
      if (d > r) continue;
      if (d < r - esp) {
        if (miolo) b.set(x, y, miolo);
        continue;
      }
      let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (ang < 0) ang += 360;
      // 0° = direita, 90° = baixo, 180° = esquerda, 270° = cima
      let cor: string;
      if (ang >= 120 && ang < 240) cor = ang < 175 ? CBB.laranja : CBB.amarelo;
      else if (ang >= 240) cor = ang < 290 ? CBB.verdeClaro : CBB.verde;
      else cor = ang < 50 ? CBB.azulClaro : CBB.azul;
      // dobras (sombras nas junções dos segmentos)
      const junta = [120, 240, 0].some((j) => Math.abs(((ang - j + 540) % 360) - 180) > 168);
      b.set(x, y, junta ? CBB.marinho : cor);
    }
}

/** Letras minúsculas "cbb" (3×5 por letra), escala inteira. */
const GLIFO: Record<string, string[]> = {
  c: ['000', '111', '100', '100', '111'],
  b: ['100', '111', '101', '101', '111'],
};
export function letrasCbb(b: PixelBuf, x: number, y: number, escala: number, cor: string, sombra?: string) {
  [...'cbb'].forEach((ch, i) => {
    GLIFO[ch].forEach((linha, ly) =>
      [...linha].forEach((v, lx) => {
        if (v !== '1') return;
        const px = x + (i * 4 + lx) * escala;
        const py = y + ly * escala;
        if (sombra) b.rect(px + 1, py + 1, escala, escala, sombra);
        b.rect(px, py, escala, escala, cor);
      }),
    );
  });
}
export const larguraCbb = (escala: number) => (3 * 4 - 1) * escala;

/** Logo completo (anel + "cbb") com a altura do anel = 2r. */
export function logoCbb(b: PixelBuf, x: number, cy: number, r: number, cor = CBB.cinzaLogo, sombra?: string) {
  logoHex(b, x + r, cy, r);
  const esc = Math.max(1, Math.round(r / 3));
  letrasCbb(b, Math.round(x + 2 * r + 2), Math.round(cy - (5 * esc) / 2), esc, cor, sombra);
}
