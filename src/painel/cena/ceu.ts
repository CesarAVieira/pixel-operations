/**
 * Iluminação pela hora do dia (puro). Na demonstração segue o relógio da simulação; com a API,
 * a hora real. Devolve o peso de cada céu, a cor ambiente (tingimento do cenário) e quanto as
 * luzes artificiais acendem.
 */
import { mix } from '../../game/art/core/color';

export interface Ambiente {
  /** Opacidade do céu de entardecer/amanhecer (sobre o céu de dia). */
  crepusculo: number;
  /** Opacidade do céu noturno (sobre os anteriores). */
  noite: number;
  /** 0 = dia claro, 1 = noite fechada: intensidade das luzes artificiais. */
  escuridao: number;
  /** Cor de tingimento do cenário e dos veículos (#rrggbb). */
  tom: string;
}

const suave = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Sino entre a..b com pico em m. */
const sino = (a: number, m: number, b: number, x: number) => (x <= m ? suave(a, m, x) : 1 - suave(m, b, x));

export function ambiente(hora: number): Ambiente {
  const h = ((hora % 24) + 24) % 24;
  const noite = h >= 12 ? suave(18.4, 19.6, h) : 1 - suave(5.2, 6.3, h);
  const crepusculo = Math.max(sino(16.9, 18.4, 19.8, h), sino(4.8, 6.0, 7.2, h));
  const escuridao = Math.min(1, noite + crepusculo * 0.35);
  let tom = mix('#ffffff', '#f6c9a4', crepusculo * (1 - noite));
  tom = mix(tom, '#5b6aa0', noite);
  return { crepusculo, noite, escuridao, tom };
}

export const horaDoDia = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
};
