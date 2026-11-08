import { TILE } from '../projection';
import { PixelBuf } from './core/pixbuf';

/** Sprite pronto: buffer + âncora (px) = canto superior esquerdo do footprint. */
export interface Sprite {
  buf: PixelBuf;
  ax: number;
  ay: number;
}

/**
 * Folha de desenho para um objeto de footprint w×h tiles. As coordenadas de desenho têm
 * (0,0) no canto superior esquerdo do footprint; `up` px de espaço acima (altura do objeto).
 */
export function sheet(wT: number, hT: number, up: number, pad = 4, down = 4): Sprite {
  const buf = new PixelBuf(Math.ceil(wT * TILE + pad * 2), Math.ceil(up + hT * TILE + down));
  buf.ox = pad;
  buf.oy = up;
  return { buf, ax: pad, ay: up };
}

/** Finaliza: contorno automático e (opcional) sombra de contato sob a base. */
export function finish(s: Sprite, shadow?: { cx: number; cy: number; rx: number; ry: number; a?: number }): Sprite {
  const { buf } = s;
  const ox = buf.ox;
  const oy = buf.oy;
  buf.ox = 0;
  buf.oy = 0;
  buf.outline();
  buf.ox = ox;
  buf.oy = oy;
  if (shadow) buf.shadow(shadow.cx, shadow.cy, shadow.rx, shadow.ry, shadow.a ?? 0.26);
  return s;
}
