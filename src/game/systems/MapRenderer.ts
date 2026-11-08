import Phaser from 'phaser';
import type { EntityRef, Rect } from '../../types/world';
import { anchorOf, keys } from '../art/TextureFactory';
import { propKeyType } from '../art/objects';
import { DEPTH_SCALE, LAYER, staticDepth } from '../depth';
import { gridToScreen, TILE, worldPixelSize } from '../projection';
import type { WorldModel } from '../world/WorldModel';

export interface StaticEntry {
  ref: EntityRef | null;
  image: Phaser.GameObjects.Image;
  rect: Rect;
}

/**
 * Monta o mundo visual: chão pré-renderizado (terreno, pisos, paredes em corte) e todos os
 * objetos com volume como imagens independentes, ordenadas pela base (y).
 */
export class MapRenderer {
  readonly entries: StaticEntry[] = [];
  readonly size: { width: number; height: number };
  /** Pontos de luz (px) para a iluminação noturna. */
  readonly lamps: { x: number; y: number }[] = [];
  readonly chimneys: { x: number; y: number }[] = [];
  readonly labels: Phaser.GameObjects.Text[] = [];
  readonly roomLabels: Phaser.GameObjects.Text[] = [];
  private trees: { img: Phaser.GameObjects.Image; kind: string; v: number; phase: number; frame: number }[] = [];
  private windT = 0;

  constructor(private scene: Phaser.Scene, private world: WorldModel) {
    this.size = worldPixelSize(world.width, world.height);
  }

  /**
   * Placas com nomes de prédios/salas: desligadas por pedido do usuário (sessão 5) — os ambientes
   * se apresentam pelo que contêm. O código das placas fica disponível (showNames).
   */
  static showNames = false;

  render() {
    this.scene.add.image(0, 0, keys.ground).setOrigin(0, 0).setDepth(LAYER.ground);
    this.renderObjects();
    if (MapRenderer.showNames) this.renderLabels();
  }

  private add(key: string, gx: number, gy: number, rect: Rect, ref: EntityRef | null, depth = staticDepth(rect)) {
    const a = anchorOf(key);
    const p = gridToScreen(gx, gy);
    const img = this.scene.add.image(Math.round(p.x), Math.round(p.y), key).setOrigin(a.x, a.y).setDepth(depth);
    if (ref) {
      img.setData('ref', ref);
      img.setInteractive({ pixelPerfect: true, alphaTolerance: 20, useHandCursor: true });
    }
    this.entries.push({ ref, image: img, rect });
    return img;
  }

  private renderObjects() {
    const { data, props } = this.world;
    for (const p of props) {
      if (p.type === 'rug' || p.type === 'liftbay') continue;
      const ref: EntityRef | null = { kind: 'building', id: p.buildingId };
      const kt = propKeyType(p);
      // cadeira de frente: o encosto fica atrás de quem senta (desenhada antes da pessoa)
      const depth = kt === 'chairS' ? p.rect.y * DEPTH_SCALE + 2 : undefined;
      this.add(keys.prop(kt, p.rect.w, p.rect.h, p.variant), p.rect.x, p.rect.y, p.rect, ref, depth);
    }
    for (const m of data.machines) {
      const flat = m.kind === 'balanca';
      this.add(keys.machine(m.id), m.rect.x, m.rect.y, m.rect, { kind: 'machine', id: m.id }, flat ? LAYER.flat + m.rect.y : staticDepth(m.rect));
    }
    data.layout.trees.forEach((t, i) => {
      const x = Math.floor(t.at[0]);
      const y = Math.floor(t.at[1]);
      const img = this.add(keys.tree(t.kind, i), x, y, { x, y, w: 1, h: 1 }, null);
      this.trees.push({ img, kind: t.kind, v: i, phase: (i * 0.37) % 1, frame: 0 });
    });
    for (const h of data.layout.hedges) this.add(keys.hedge(h.w, h.h), h.x, h.y, h, null);
    for (const [x, y] of data.layout.lamps) {
      this.add('lamp', x, y, { x, y, w: 1, h: 1 }, null);
      this.lamps.push({ x: x * TILE + 8, y: y * TILE - 30 });
    }
    for (const [x, y] of data.layout.benches) this.add('parkbench', x, y, { x, y, w: 2, h: 1 }, null);
    for (const s of data.layout.signs) {
      const img = this.add(`sign_${s.text}`, s.at[0], s.at[1], { x: s.at[0], y: s.at[1], w: 4, h: 1 }, null);
      this.scene.add
        .text(img.x + img.displayWidth / 2 - 4, img.y - 18, s.text, { fontFamily: 'Silkscreen, monospace', fontSize: '8px', color: '#f4f2ee' })
        .setOrigin(0.5, 0.5)
        .setResolution(4)
        .setDepth(img.depth + 0.1);
    }
    for (const b of data.buildings) {
      if (b.kind === 'cobertura') {
        // cobertura translúcida acima dos veículos
        this.add(keys.canopy(b.id), b.rect.x, b.rect.y, b.rect, null, LAYER.overhead + b.rect.y).setAlpha(0.92);
        continue;
      }
      if (b.chimney) {
        const cx = b.rect.x + b.rect.w - 4;
        this.add('chimney', cx, b.rect.y, { x: cx, y: b.rect.y, w: 2, h: 2 }, { kind: 'building', id: b.id }, (b.rect.y + 2) * DEPTH_SCALE);
        this.chimneys.push({ x: (cx + 1) * TILE, y: b.rect.y * TILE - 50 });
      }
    }
    // passarelas de tubulação (acima de tudo que circula)
    // tubovia: sombra no chão, suportes com sapata, tubo revestido de alumínio + linha de aquecimento
    const shadowG = this.scene.add.graphics().setDepth(LAYER.flat + 0.5);
    const g = this.scene.add.graphics().setDepth(LAYER.overhead);
    const H = 16;
    for (const mf of data.materials) {
      const pts = mf.points.map(([x, y]) => gridToScreen(x, y));
      const steam = mf.color === '#9ca3af';
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const c = pts[i + 1];
        const horiz = Math.abs(c.x - a.x) >= Math.abs(c.y - a.y);
        shadowG.lineStyle(5, 0x141824, 0.16).lineBetween(a.x + 4, a.y + 3, c.x + 4, c.y + 3);
        const len = Math.hypot(c.x - a.x, c.y - a.y);
        for (let d = 0; d <= len; d += 40) {
          const x = Math.round(a.x + ((c.x - a.x) * d) / (len || 1));
          const y = Math.round(a.y + ((c.y - a.y) * d) / (len || 1));
          shadowG.fillStyle(0x141824, 0.22).fillEllipse(x + 1, y + 1, 9, 4);
          g.fillStyle(0x6b737c, 1).fillRect(x - 3, y - 2, 7, 3); // sapata
          g.fillStyle(0x4b525d, 1).fillRect(x - 1, y - H, 3, H);
          g.fillStyle(0x8a929a, 1).fillRect(x - 1, y - H, 1, H);
          g.fillStyle(0x3b4152, 1).fillRect(horiz ? x - 4 : x - 5, y - H - 1, horiz ? 9 : 11, 2); // travessa
        }
        if (horiz) {
          // tubo principal (alumínio) e linha de aquecimento logo abaixo
          g.fillStyle(0x3b4152, 1).fillRect(Math.min(a.x, c.x), a.y - H - 6, Math.abs(c.x - a.x) + 1, 6);
          g.fillStyle(steam ? 0xe8e4dc : 0xc9d0d6, 1).fillRect(Math.min(a.x, c.x), a.y - H - 5, Math.abs(c.x - a.x) + 1, 4);
          g.fillStyle(0xffffff, 0.8).fillRect(Math.min(a.x, c.x), a.y - H - 5, Math.abs(c.x - a.x) + 1, 1);
          g.fillStyle(steam ? 0xc8463b : 0x8a929a, 1).fillRect(Math.min(a.x, c.x), a.y - H - 2, Math.abs(c.x - a.x) + 1, 1);
          // juntas/cintas do revestimento
          for (let x = Math.min(a.x, c.x) + 6; x < Math.max(a.x, c.x); x += 12) g.fillStyle(0x8a929a, 1).fillRect(x, a.y - H - 5, 1, 4);
        } else {
          g.fillStyle(0x3b4152, 1).fillRect(a.x - 3, Math.min(a.y, c.y) - H - 4, 7, Math.abs(c.y - a.y) + 2);
          g.fillStyle(steam ? 0xe8e4dc : 0xc9d0d6, 1).fillRect(a.x - 2, Math.min(a.y, c.y) - H - 4, 4, Math.abs(c.y - a.y) + 1);
          g.fillStyle(0xffffff, 0.8).fillRect(a.x - 2, Math.min(a.y, c.y) - H - 4, 1, Math.abs(c.y - a.y) + 1);
          g.fillStyle(steam ? 0xc8463b : 0x8a929a, 1).fillRect(a.x + 2, Math.min(a.y, c.y) - H - 4, 1, Math.abs(c.y - a.y) + 1);
          for (let y = Math.min(a.y, c.y) + 6; y < Math.max(a.y, c.y); y += 12) g.fillStyle(0x8a929a, 1).fillRect(a.x - 2, y - H - 4, 4, 1);
        }
      }
      // cotovelos
      for (let i = 1; i < pts.length - 1; i++) g.fillStyle(0x9aa3ad, 1).fillRect(pts[i].x - 3, pts[i].y - H - 6, 7, 7);
    }
  }

  /** Placas com o nome de cada prédio, sobre a parede norte (como plaquinhas de sala). */
  private renderLabels() {
    for (const b of this.world.data.buildings) {
      const p = gridToScreen(b.rect.x + b.rect.w / 2, b.rect.y);
      const t = this.scene.add
        .text(Math.round(p.x), Math.round(p.y) - (b.kind === 'cobertura' ? 34 : 2), b.name, {
          fontFamily: 'IBM Plex Sans, sans-serif',
          fontSize: '10px',
          fontStyle: '600',
          color: '#f4f6f8',
          backgroundColor: 'rgba(28,32,46,0.88)',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5, 1)
        .setResolution(3)
        .setDepth(LAYER.labels);
      this.labels.push(t);
      // nomes das salas internas (plaquinhas menores, no chão da sala)
      for (const rm of b.rooms ?? []) {
        const q = gridToScreen(rm.rect.x + rm.rect.w / 2, rm.rect.y + rm.rect.h / 2);
        const rt = this.scene.add
          .text(Math.round(q.x), Math.round(q.y), rm.name, {
            fontFamily: 'IBM Plex Sans, sans-serif',
            fontSize: '9px',
            fontStyle: '600',
            color: '#1c202e',
            backgroundColor: 'rgba(244,242,236,0.82)',
            padding: { x: 3, y: 1 },
          })
          .setOrigin(0.5, 0.5)
          .setResolution(3)
          .setDepth(LAYER.labels - 1);
        this.roomLabels.push(rt);
      }
    }
  }

  /** Vento: rajadas que atravessam o mapa de oeste para leste; cada árvore balança na sua fase. */
  update(dt: number) {
    this.windT += dt;
    for (const t of this.trees) {
      const gust = Math.sin(this.windT * 0.35 - t.img.x * 0.004) > 0.2;
      const k = Math.floor((this.windT + t.phase * 2) / (gust ? 0.32 : 0.7)) % 4;
      const f = gust ? [0, 1, 0, 2][k] : k === 1 ? 1 : 0;
      if (f !== t.frame) {
        t.frame = f;
        t.img.setTexture(keys.tree(t.kind, t.v, f));
      }
    }
  }

  private labelsOn = true;
  private zoom = 1;

  setLabelsVisible(v: boolean) {
    this.labelsOn = v;
    for (const l of this.labels) l.setVisible(v);
    this.updateRoomLabels();
  }

  /** Escala das placas para ficarem legíveis em qualquer zoom. */
  scaleLabels(zoom: number) {
    this.zoom = zoom;
    const k = Phaser.Math.Clamp(1.4 / zoom, 0.5, 2.2);
    for (const l of this.labels) l.setScale(k);
    this.updateRoomLabels();
  }

  /** Nomes de sala só aparecem com zoom de perto (não poluem a visão geral). */
  private updateRoomLabels() {
    const show = this.labelsOn && this.zoom >= 1.1;
    const k = Phaser.Math.Clamp(1.3 / this.zoom, 0.75, 1.1);
    for (const l of this.roomLabels) l.setVisible(show).setScale(k);
  }
}
