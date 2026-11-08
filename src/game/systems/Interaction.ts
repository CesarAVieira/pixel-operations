import Phaser from 'phaser';
import type { EntityRef, Rect } from '../../types/world';
import { LAYER } from '../depth';
import { gridToScreen, screenToGrid } from '../projection';
import type { WorldModel } from '../world/WorldModel';

export interface InteractionHooks {
  onSelect(ref: EntityRef | null): void;
  onHover(ref: EntityRef | null): void;
  onGroundClick(gx: number, gy: number): void;
  onPan(dx: number, dy: number): void;
  /** Posição atual (grade) e ângulo de uma entidade móvel, para desenhar o anel de seleção. */
  locate(ref: EntityRef): { x: number; y: number } | null;
  rectOf(ref: EntityRef): Rect[] | null;
}

/**
 * Entrada do mouse: arrastar = mover câmera; clique em objeto = selecionar;
 * clique no chão = caminhar (modo livre) ou identificar área (modo operacional).
 * Também desenha o destaque do item selecionado e o realce de hover.
 */
export class Interaction {
  selected: EntityRef | null = null;
  private hovered: Phaser.GameObjects.Image | null = null;
  private dragging = false;
  private downAt: { x: number; y: number } | null = null;
  private g: Phaser.GameObjects.Graphics;
  private t = 0;

  constructor(private scene: Phaser.Scene, private world: WorldModel, private hooks: InteractionHooks) {
    this.g = scene.add.graphics().setDepth(LAYER.overlay + 20);
    const input = scene.input;
    input.setTopOnly(true);
    input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downAt = { x: p.x, y: p.y };
      this.dragging = false;
    });
    input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown && this.downAt) {
        if (!this.dragging && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 6) this.dragging = true;
        if (this.dragging) hooks.onPan(p.x - p.prevPosition.x, p.y - p.prevPosition.y);
        return;
      }
      this.hover(this.topRef(p));
    });
    input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const wasDrag = this.dragging;
      this.downAt = null;
      this.dragging = false;
      if (wasDrag || p.button !== 0) return;
      const top = this.topRef(p);
      if (top) {
        this.select(top.getData('ref') as EntityRef);
        return;
      }
      const w = p.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;
      const gpt = screenToGrid(w.x, w.y, world.origin);
      hooks.onGroundClick(gpt.x, gpt.y);
    });
    input.on('gameout', () => this.hover(null));
  }

  private topRef(p: Phaser.Input.Pointer): Phaser.GameObjects.Image | null {
    const hits = this.scene.input.hitTestPointer(p) as Phaser.GameObjects.Image[];
    const withRef = hits.filter((h) => h.visible && h.getData('ref'));
    if (!withRef.length) return null;
    withRef.sort((a, b) => b.depth - a.depth);
    return withRef[0];
  }

  private hover(obj: Phaser.GameObjects.Image | null) {
    if (obj === this.hovered) return;
    this.hovered?.clearTint();
    this.hovered = obj;
    obj?.setTint(0xfff1c7);
    this.hooks.onHover(obj ? (obj.getData('ref') as EntityRef) : null);
  }

  select(ref: EntityRef | null) {
    this.selected = ref;
    this.hooks.onSelect(ref);
  }

  private s(x: number, y: number) {
    return gridToScreen(x, y, this.world.origin);
  }

  update(dt: number) {
    this.t += dt;
    const g = this.g;
    g.clear();
    const ref = this.selected;
    if (!ref) return;
    const a = 0.65 + Math.sin(this.t * 4) * 0.3;
    const rects = this.hooks.rectOf(ref);
    if (rects) {
      for (const r of rects) {
        const pts = [this.s(r.x, r.y), this.s(r.x + r.w, r.y), this.s(r.x + r.w, r.y + r.h), this.s(r.x, r.y + r.h)].map((p) => new Phaser.Math.Vector2(p.x, p.y));
        g.lineStyle(2, 0xf2b632, a);
        g.strokePoints(pts, true);
        g.fillStyle(0xf2b632, 0.08);
        g.fillPoints(pts, true);
      }
      return;
    }
    const pos = this.hooks.locate(ref);
    if (!pos) return;
    const p = this.s(pos.x, pos.y);
    g.lineStyle(2, 0xf2b632, a);
    g.strokeEllipse(p.x, p.y + (ref.kind === 'vehicle' ? 0 : 5), ref.kind === 'vehicle' ? 64 : 18, ref.kind === 'vehicle' ? 40 : 8);
  }
}
