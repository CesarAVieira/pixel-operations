import Phaser from 'phaser';
import type { CharacterState, EntityRef, Uniform, Vec2 } from '../../types/world';
import { keys } from '../art/TextureFactory';
import { CHAR_AX, CHAR_AY, CHAR_H, CHAR_W, frameName, type Pose, type View } from '../art/characters';
import { actorDepth } from '../depth';
import { gridToScreen, type ScreenPoint } from '../projection';

export interface ActorContext {
  scene: Phaser.Scene;
  origin: ScreenPoint;
}

/** O que a pessoa faz quando chega (definido pelo CharacterSystem a partir da tarefa/assento). */
export interface Activity {
  pose: Pose;
  seated: boolean;
}

/** Passada: um quadro de caminhada a cada 0,27 tile percorrido (pés não "deslizam"). */
const STRIDE = 0.27;

/**
 * Personagem: posição contínua (tiles), caminho, animação por pose (folha de quadros),
 * piscar, respiração, digitação em rajadas, ícone de estado e profundidade pelos pés.
 */
export class Agent {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly icon: Phaser.GameObjects.Image;
  readonly texKey: string;
  state: CharacterState = 'IDLE';
  path: Vec2[] = [];
  speed = 2.2;
  facing: View = 'down';
  flip = false;
  activity: Activity = { pose: 'stand', seated: false };
  private t = Math.random() * 10;
  private walked = 0;
  private blinkIn = 1 + Math.random() * 4;
  private blinkT = 0;
  /** Rajada de trabalho (digitar/falar) e pausa entre rajadas. */
  private burst = Math.random() * 3;
  private burstOn = true;
  private hidden = false;

  constructor(
    ctx: ActorContext,
    readonly ref: EntityRef,
    readonly uniform: Uniform,
    readonly look: number,
    public x: number,
    public y: number,
  ) {
    const s = ctx.scene;
    this.texKey = keys.charSheet(uniform, look);
    this.shadow = s.add.image(0, 0, 'ico_shadow');
    this.sprite = s.add.image(0, 0, this.texKey, frameName('down', 'stand', 0));
    this.sprite.setOrigin(CHAR_AX / CHAR_W, CHAR_AY / CHAR_H);
    this.sprite.setData('ref', ref);
    this.sprite.setInteractive({ pixelPerfect: true, alphaTolerance: 20, useHandCursor: true });
    this.icon = s.add.image(0, 0, 'ico_bubble').setVisible(false);
    this.render(0);
  }

  get moving() {
    return this.path.length > 0;
  }

  setPath(path: Vec2[]) {
    this.path = path.slice();
    if (this.path.length && Math.hypot(this.path[0][0] - this.x, this.path[0][1] - this.y) < 0.6) this.path.shift();
    if (this.path.length) this.state = 'WALKING';
  }

  stop() {
    this.path = [];
  }

  setActivity(a: Activity) {
    this.activity = a;
    this.burst = 1.5 + Math.random() * 3;
    this.burstOn = true;
  }

  setHidden(h: boolean) {
    this.hidden = h;
    this.sprite.setVisible(!h);
    this.shadow.setVisible(!h);
    if (h) this.icon.setVisible(false);
  }

  get isHidden() {
    return this.hidden;
  }

  setIcon(key: 'bubble' | 'gear' | null) {
    if (!key) this.icon.setVisible(false);
    else this.icon.setTexture(`ico_${key}`).setVisible(!this.hidden);
  }

  face(dir: 'N' | 'S' | 'E' | 'W') {
    this.facing = dir === 'N' ? 'up' : dir === 'S' ? 'down' : 'side';
    // o perfil é desenhado virado para a esquerda (oeste); leste = espelhado
    if (dir === 'E') this.flip = true;
    if (dir === 'W') this.flip = false;
  }

  private faceVec(dx: number, dy: number) {
    if (Math.abs(dx) > Math.abs(dy) * 1.15) this.face(dx > 0 ? 'E' : 'W');
    else if (Math.abs(dy) > Math.abs(dx) * 0.85) this.face(dy > 0 ? 'S' : 'N');
  }

  update(dt: number) {
    if (this.path.length) {
      let step = this.speed * dt;
      while (step > 0 && this.path.length) {
        const [tx, ty] = this.path[0];
        const dx = tx - this.x;
        const dy = ty - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.001) this.faceVec(dx, dy);
        if (d <= step) {
          this.x = tx;
          this.y = ty;
          this.path.shift();
          step -= d;
          this.walked += d;
        } else {
          this.x += (dx / d) * step;
          this.y += (dy / d) * step;
          this.walked += step;
          step = 0;
        }
      }
      if (!this.path.length && this.state === 'WALKING') this.state = 'IDLE';
    }
    this.render(dt);
  }

  /** Pose e quadro atuais. */
  private pick(dt: number): { pose: Pose; frame: number; seated: boolean } {
    this.t += dt;
    // piscar: a cada 2–6 s, por 0,12 s
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.12;
      this.blinkIn = 2 + Math.random() * 4;
    }
    if (this.blinkT > 0) this.blinkT -= dt;
    const blink = this.blinkT > 0;
    const breath = Math.floor(this.t / 0.9) % 2;
    const rest = (seated: boolean) => ({ pose: (seated ? 'sit' : 'stand') as Pose, frame: blink ? 2 : breath, seated });

    if (this.path.length) return { pose: 'walk', frame: Math.floor(this.walked / STRIDE) % 4, seated: false };
    const a = this.activity;
    switch (this.state) {
      case 'WORKING': {
        // rajadas: digita/opera alguns segundos, pausa, volta
        this.burst -= dt;
        if (this.burst <= 0) {
          this.burstOn = !this.burstOn;
          this.burst = this.burstOn ? 2.5 + Math.random() * 4 : 0.8 + Math.random() * 1.8;
        }
        if (a.pose === 'sit') return rest(true);
        if (!this.burstOn && (a.pose === 'type' || a.pose === 'use' || a.pose === 'check')) return rest(a.seated || a.pose === 'type');
        if (a.pose === 'type') return { pose: 'type', frame: Math.floor(this.t / 0.11) % 4, seated: true };
        if (a.pose === 'use') return { pose: 'use', frame: Math.floor(this.t / 0.16) % 4, seated: false };
        if (a.pose === 'check') return { pose: 'check', frame: Math.floor(this.t / 0.55) % 2, seated: a.seated };
        if (a.pose === 'talk') return { pose: 'talk', frame: Math.floor(this.t / 0.2) % 2, seated: a.seated };
        return rest(a.seated);
      }
      case 'TALKING': {
        this.burst -= dt;
        if (this.burst <= 0) {
          this.burstOn = !this.burstOn;
          this.burst = this.burstOn ? 1.2 + Math.random() * 2 : 0.6 + Math.random() * 1.4;
        }
        return this.burstOn ? { pose: 'talk', frame: Math.floor(this.t / 0.2) % 2, seated: a.seated } : rest(a.seated);
      }
      case 'WAITING':
        return { pose: 'wait', frame: Math.floor(this.t / 0.55) % 2, seated: false };
      default:
        return rest(false);
    }
  }

  render(dt: number) {
    const { pose, frame, seated } = this.pick(dt);
    this.sprite.setFrame(frameName(this.facing, pose, frame, seated)).setFlipX(this.facing === 'side' && this.flip);
    const p = gridToScreen(this.x, this.y);
    const sx = Math.round(p.x);
    const sy = Math.round(p.y + 4);
    this.sprite.setPosition(sx, sy);
    this.shadow.setPosition(sx, sy).setScale(seated ? 1.25 : 1, 1);
    this.icon.setPosition(sx + 7, sy - 33 + (seated ? 4 : 0) + (Math.floor(this.t * 2) % 2));
    const d = actorDepth(this.y + 0.3);
    this.shadow.setDepth(d - 0.02);
    this.sprite.setDepth(d);
    this.icon.setDepth(d + 2000);
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.icon.destroy();
  }
}
