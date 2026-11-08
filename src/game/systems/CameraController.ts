import Phaser from 'phaser';
import { gridToScreen } from '../projection';
import type { WorldModel } from '../world/WorldModel';

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;
const KEY_PAN_SPEED = 520; // px de tela por segundo

/**
 * Câmera: zoom (botões, roda do mouse), arrastar, WASD/setas para mover,
 * enquadrar a planta, centralizar, focar e acompanhar entidades.
 */
export class CameraController {
  readonly cam: Phaser.Cameras.Scene2D.Camera;
  following: Phaser.GameObjects.Image | null = null;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  /**
   * Limites da câmera conforme o zoom: com o mundo menor que a tela (zoom bem afastado), a folga cresce
   * para a planta poder ficar centralizada (sem isso, o Phaser "gruda" a vista no canto).
   */
  refreshBounds(z = this.cam.zoom) {
    const vw = this.cam.width / z;
    const vh = this.cam.height / z;
    const px = Math.max(400, (vw - this.size.width) / 2 + 60);
    const py = Math.max(300, (vh - this.size.height) / 2 + 60);
    this.cam.setBounds(-px, -py, this.size.width + 2 * px, this.size.height + 2 * py);
  }

  constructor(scene: Phaser.Scene, private world: WorldModel, private size: { width: number; height: number }) {
    this.cam = scene.cameras.main;
    this.cam.setBackgroundColor('#4f6b3a');
    this.refreshBounds(ZOOM_MIN);
    this.cam.setRoundPixels(true);
    scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomAt(dy > 0 ? 1 / 1.15 : 1.15, p.x, p.y);
    });
    const kb = scene.input.keyboard;
    if (kb) {
      kb.disableGlobalCapture();
      for (const k of ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT'])
        this.keys[k] = kb.addKey(Phaser.Input.Keyboard.KeyCodes[k as keyof typeof Phaser.Input.Keyboard.KeyCodes], false);
    }
  }

  follow(target: Phaser.GameObjects.Image) {
    this.following = target;
    this.cam.startFollow(target, true, 0.12, 0.12);
  }

  unfollow() {
    this.following = null;
    this.cam.stopFollow();
  }

  /** Zoom mantendo fixo o ponto de tela (px,py). */
  zoomAt(factor: number, px?: number, py?: number) {
    const cam = this.cam;
    const z = Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    this.refreshBounds(Math.min(z, cam.zoom));
    if (px === undefined || py === undefined || this.following) {
      cam.setZoom(z);
      return;
    }
    const before = cam.getWorldPoint(px, py);
    cam.setZoom(z);
    cam.preRender();
    const after = cam.getWorldPoint(px, py);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  zoomStep(dir: 1 | -1) {
    this.zoomAt(dir > 0 ? 1.25 : 0.8);
  }

  pan(dx: number, dy: number) {
    if (this.following) this.unfollow();
    this.cam.scrollX -= dx / this.cam.zoom;
    this.cam.scrollY -= dy / this.cam.zoom;
  }

  private plantBounds() {
    const r = this.world.data.layout.boundary;
    const a = gridToScreen(r.x, r.y);
    const b = gridToScreen(r.x + r.w, r.y + r.h + 8);
    return { minX: a.x, maxX: b.x, minY: a.y - 30, maxY: b.y };
  }

  /** Enquadra todo o perímetro da planta. */
  fit(duration = 500) {
    this.unfollow();
    const b = this.plantBounds();
    // reserva a faixa inferior da tela ocupada pela barra de mensagens
    const padBottom = Math.min(170, this.cam.height * 0.22);
    const z = Phaser.Math.Clamp(Math.min(this.cam.width / (b.maxX - b.minX), (this.cam.height - padBottom) / (b.maxY - b.minY)) * 0.94, ZOOM_MIN, ZOOM_MAX);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2 + padBottom / 2 / z;
    this.refreshBounds(Math.min(z, this.cam.zoom));
    if (duration <= 0) {
      this.cam.setZoom(z);
      this.cam.centerOn(cx, cy);
      return;
    }
    this.cam.zoomTo(z, duration, 'Sine.easeInOut');
    this.cam.pan(cx, cy, duration, 'Sine.easeInOut');
  }

  /** Centraliza a planta mantendo o zoom atual. */
  center() {
    this.unfollow();
    const b = this.plantBounds();
    this.cam.pan((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 450, 'Sine.easeInOut');
  }

  focusGrid(gx: number, gy: number, zoom = 2.5) {
    this.unfollow();
    const p = gridToScreen(gx, gy, this.world.origin);
    this.cam.pan(p.x, p.y - 10, 550, 'Sine.easeInOut');
    this.cam.zoomTo(Math.max(this.cam.zoom, zoom), 550, 'Sine.easeInOut');
  }

  private typing(): boolean {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);
  }

  /** WASD / setas movem a câmera. */
  update(dt: number) {
    if (this.typing()) return;
    const k = this.keys;
    const sx = (k.D?.isDown || k.RIGHT?.isDown ? 1 : 0) - (k.A?.isDown || k.LEFT?.isDown ? 1 : 0);
    const sy = (k.S?.isDown || k.DOWN?.isDown ? 1 : 0) - (k.W?.isDown || k.UP?.isDown ? 1 : 0);
    if (sx || sy) this.pan(-sx * KEY_PAN_SPEED * dt, -sy * KEY_PAN_SPEED * dt);
  }
}
