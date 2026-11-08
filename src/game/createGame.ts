import Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#4f6b3a',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    input: { mouse: { preventDefaultWheel: true } },
    scene: [WorldScene],
    banner: false,
  });
  if (import.meta.env.DEV) (window as unknown as { __cbb: Phaser.Game }).__cbb = game;
  return game;
}
