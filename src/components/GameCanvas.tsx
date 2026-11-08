import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createGame } from '../game/createGame';

/**
 * Hospeda o Phaser. O jogo só é criado quando o contêiner já tem tamanho real
 * (BUG-002: criado com 0×16 px, o WebGL falhava com "Framebuffer incomplete").
 * Mudanças de tamanho do contêiner atualizam a escala do jogo.
 */
export function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = el;
      if (w < 2 || h < 2) return;
      if (!game.current) game.current = createGame(el);
      else game.current.scale.refresh();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      game.current?.destroy(true);
      game.current = null;
    };
  }, []);

  return <div ref={host} className="game-host" onContextMenu={(e) => e.preventDefault()} />;
}
