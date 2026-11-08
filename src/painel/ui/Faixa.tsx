import { useEffect, useRef, useState } from 'react';
import { H, W } from '../cena/geometria';
import type { Teatro } from '../cena/teatro';

interface Props {
  id: string;
  teatro: Teatro;
  onAbrir: () => void;
}

/**
 * Espaço da faixa em pixel art de um pedido. O desenho é feito pelo palco PixiJS (um único canvas
 * sobre o quadro), alinhado a este elemento; aqui ficam só a área de clique e os rótulos.
 */
export function Faixa({ id, teatro, onAbrir }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const [mira, setMira] = useState(false);

  useEffect(() => {
    const el = raiz.current!;
    const q = (s: string) => el.querySelector<HTMLElement>(s)!;
    teatro.registrar(id, el, {
      notas: q('.r-notas'),
      nfs: [...el.querySelectorAll<HTMLElement>('.nf')],
      alerta: q('.r-alerta'),
      alertaTxt: q('.r-alerta b'),
      carga: q('.r-carga'),
      preparo: q('.r-preparo'),
      preparoTxt: q('.r-preparo b'),
      destino: q('.r-destino'),
    });
    return () => teatro.remover(id);
  }, [id, teatro]);

  const fracao = (e: React.MouseEvent) => {
    const r = raiz.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
  };

  return (
    <div
      className={'faixa' + (mira ? ' mira' : '')}
      ref={raiz}
      style={{ aspectRatio: `${W} / ${H}` }}
      onClick={(e) => teatro.acertou(id, ...fracao(e)) && onAbrir()}
      onMouseMove={(e) => setMira(teatro.acertou(id, ...fracao(e)))}
      onMouseLeave={() => setMira(false)}
      role="img"
      aria-label="Faixa animada do pedido — clique no caminhão para ver a ficha"
    >
      <div className="rot r-notas">
        <span className="nf">NFe</span>
        <span className="nf">CTe</span>
        <span className="nf">MDFe</span>
      </div>
      <div className="rot r-destino" />
      <div className="rot r-alerta">
        <i>⚠</i>
        <b />
      </div>
      <div className="rot r-carga" />
      <div className="rot r-preparo">
        <i />
        <b />
      </div>
    </div>
  );
}
