import Phaser from 'phaser';
import type { Rect, Vec2 } from '../../types/world';
import { LAYER } from '../depth';
import { gridToScreen, type ScreenPoint } from '../projection';
import type { WorldModel } from '../world/WorldModel';
import { flattenLegs } from '../world/flowRoutes';
import type { VehicleSystem } from './VehicleSystem';
import { MapRenderer } from './MapRenderer';

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

interface ScreenRoute {
  id: string;
  color: number;
  pts: ScreenPoint[];
  segLen: number[];
  total: number;
}

/**
 * Modo operacional ("Visualizar fluxo"): atenua o mapa, destaca setores envolvidos,
 * desenha as rotas animadas dos fluxos, numera as etapas, mostra o produto
 * circulando nas tubulações e marca os caminhões em operação.
 */
export class FlowOverlay {
  private veil: Phaser.GameObjects.Rectangle;
  private zonesG: Phaser.GameObjects.Graphics;
  private routesG: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private stopLabels: { id: string; objs: Phaser.GameObjects.GameObject[] }[] = [];
  private routes: ScreenRoute[] = [];
  private materials: ScreenRoute[] = [];
  private visible = new Set<string>();
  private active = false;
  private t = 0;

  constructor(private scene: Phaser.Scene, private world: WorldModel, private vehicles: VehicleSystem, size: { width: number; height: number }) {
    this.veil = scene.add.rectangle(-2000, -2000, size.width + 4000, size.height + 4000, 0x0b1220, 0.5).setOrigin(0, 0).setDepth(LAYER.overlay).setVisible(false);
    this.zonesG = scene.add.graphics().setDepth(LAYER.overlay + 1).setVisible(false);
    this.routesG = scene.add.graphics().setDepth(LAYER.overlay + 2).setVisible(false);
    const flows = world.data.flows.filter((f) => !f.ambient);
    for (const f of flows) {
      const legs = vehicles.flowRoutes.get(f.id);
      if (!legs) continue;
      this.routes.push(this.toScreen(f.id, hex(f.color), flattenLegs(legs)));
      this.visible.add(f.id);
    }
    for (const m of world.data.materials) this.materials.push(this.toScreen(m.id, hex(m.color), m.points));
    this.buildLabels();
  }

  private s(x: number, y: number) {
    return gridToScreen(x, y, this.world.origin);
  }

  private toScreen(id: string, color: number, pts: Vec2[]): ScreenRoute {
    const sp = pts.map(([x, y]) => this.s(x, y));
    const segLen: number[] = [];
    let total = 0;
    for (let i = 0; i < sp.length - 1; i++) {
      const l = Math.hypot(sp[i + 1].x - sp[i].x, sp[i + 1].y - sp[i].y);
      segLen.push(l);
      total += l;
    }
    return { id, color, pts: sp, segLen, total };
  }

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', bg?: string) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: 'Silkscreen, monospace', fontSize: `${size}px`, color, backgroundColor: bg, padding: bg ? { x: 3, y: 1 } : undefined })
      .setOrigin(0.5, 0.5)
      .setResolution(4)
      .setDepth(LAYER.overlay + 5)
      .setVisible(false);
    return t;
  }

  private buildLabels() {
    // nomes dos setores sobre o mapa desligados (pedido do usuário, sessão 5): ficam as cores e as etapas
    for (const z of MapRenderer.showNames ? this.world.data.zones : []) {
      const r = z.rects[0];
      const p = this.s(r.x + r.w / 2, r.y + r.h / 2);
      const t = this.text(p.x, p.y - 26, z.name.toUpperCase(), 7, '#ffffff', 'rgba(15,23,42,0.85)');
      t.setStroke(z.color, 0);
      this.labels.push(t);
    }
    this.buildStopMarkers();
  }

  /**
   * Um marcador por ponto de parada: fluxos que compartilham o mesmo ponto (ex.: portaria
   * de entrada e de saída) viram um único marcador "1/5" (BUG-004: marcadores empilhados).
   */
  private buildStopMarkers() {
    for (const s of this.stopLabels) for (const o of s.objs) o.destroy();
    this.stopLabels = [];
    const groups = new Map<string, { at: Vec2; color: string; nums: Set<number> }>();
    for (const f of this.world.data.flows) {
      if (f.ambient || !this.visible.has(f.id)) continue;
      f.stops.forEach((st, i) => {
        const key = `${st.at[0]},${st.at[1]}`;
        const g = groups.get(key) ?? { at: st.at, color: f.color, nums: new Set<number>() };
        g.nums.add(i + 1);
        groups.set(key, g);
      });
    }
    const objs: Phaser.GameObjects.GameObject[] = [];
    for (const g of groups.values()) {
      const p = this.s(g.at[0], g.at[1]);
      const label = [...g.nums].sort((a, b) => a - b).join('/');
      const c = this.scene.add.circle(p.x, p.y - 12, label.length > 1 ? 8 : 5.5, hex(g.color), 1).setStrokeStyle(1, 0xffffff).setDepth(LAYER.overlay + 6).setVisible(false);
      const n = this.text(p.x, p.y - 12, label, 6, '#ffffff').setDepth(LAYER.overlay + 7);
      objs.push(c, n);
    }
    this.stopLabels.push({ id: '*', objs });
  }

  setActive(on: boolean) {
    this.active = on;
    this.veil.setVisible(on);
    this.zonesG.setVisible(on);
    this.routesG.setVisible(on);
    for (const l of this.labels) l.setVisible(on);
    this.refreshStops();
    if (on) this.drawZones();
  }

  setVisibleFlows(ids: string[]) {
    this.visible = new Set(ids);
    this.buildStopMarkers();
    this.refreshStops();
    if (this.active) this.drawZones();
  }

  private refreshStops() {
    for (const s of this.stopLabels) for (const o of s.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(this.active);
  }

  private isoPoly(g: Phaser.GameObjects.Graphics, r: Rect, fill: number, alpha: number) {
    const pts = [this.s(r.x, r.y), this.s(r.x + r.w, r.y), this.s(r.x + r.w, r.y + r.h), this.s(r.x, r.y + r.h)].map((p) => new Phaser.Math.Vector2(p.x, p.y));
    g.fillStyle(fill, alpha);
    g.fillPoints(pts, true);
    g.lineStyle(1, fill, 0.95);
    g.strokePoints(pts, true);
  }

  private drawZones() {
    const g = this.zonesG;
    g.clear();
    const used = new Set<string>();
    for (const f of this.world.data.flows) if (this.visible.has(f.id)) for (const st of f.stops) if (st.zoneId) used.add(st.zoneId);
    for (const z of this.world.data.zones) {
      const on = used.has(z.id);
      for (const r of z.rects) this.isoPoly(g, r, hex(z.color), on ? 0.32 : 0.1);
    }
  }

  private pointOn(r: ScreenRoute, d: number): { p: ScreenPoint; dx: number; dy: number } {
    let rest = ((d % r.total) + r.total) % r.total;
    for (let i = 0; i < r.segLen.length; i++) {
      if (rest <= r.segLen[i]) {
        const a = r.pts[i];
        const b = r.pts[i + 1];
        const t = r.segLen[i] ? rest / r.segLen[i] : 0;
        return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dx: (b.x - a.x) / (r.segLen[i] || 1), dy: (b.y - a.y) / (r.segLen[i] || 1) };
      }
      rest -= r.segLen[i];
    }
    return { p: r.pts[0], dx: 1, dy: 0 };
  }

  /** Rótulos e marcadores mantêm tamanho constante na tela, independente do zoom. */
  private scaleLabels() {
    const k = Phaser.Math.Clamp(1.25 / this.scene.cameras.main.zoom, 0.6, 3);
    for (const l of this.labels) l.setScale(k);
    for (const s of this.stopLabels) for (const o of s.objs) (o as unknown as Phaser.GameObjects.Components.Transform).setScale(k);
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    this.scaleLabels();
    const g = this.routesG;
    g.clear();
    for (const r of this.routes) {
      if (!this.visible.has(r.id)) continue;
      g.lineStyle(4, r.color, 0.25);
      g.strokePoints(r.pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), false);
      // traços animados
      const dash = 7;
      const gap = 7;
      const off = (this.t * 28) % (dash + gap);
      g.lineStyle(2, r.color, 1);
      for (let d = off; d < r.total; d += dash + gap) {
        const a = this.pointOn(r, d).p;
        const b = this.pointOn(r, Math.min(r.total, d + dash)).p;
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      // setas
      for (let d = ((this.t * 28) % 70) + 35; d < r.total; d += 70) {
        const { p, dx, dy } = this.pointOn(r, d);
        g.fillStyle(0xffffff, 1);
        g.fillTriangle(p.x + dx * 5, p.y + dy * 5, p.x - dx * 3 - dy * 3.5, p.y - dy * 3 + dx * 3.5, p.x - dx * 3 + dy * 3.5, p.y - dy * 3 - dx * 3.5);
      }
    }
    // produto nas tubulações
    for (const m of this.materials) {
      g.lineStyle(3, 0x1f2937, 0.9);
      g.strokePoints(m.pts.map((p) => new Phaser.Math.Vector2(p.x, p.y - 14)), false);
      for (let d = (this.t * 14) % 10; d < m.total; d += 10) {
        const { p } = this.pointOn(m, d);
        g.fillStyle(0xd97706, 1);
        g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 15, 2, 2);
      }
    }
    // caminhões em operação
    for (const v of this.vehicles.agents) {
      if (!v.flow || v.flow.ambient || !v.visible || !this.visible.has(v.flow.id)) continue;
      if (v.state === 'ESTACIONADO') continue;
      const p = this.s(v.x, v.y);
      const pulse = 7 + Math.sin(this.t * 5) * 1.5;
      g.lineStyle(2, hex(v.flow.color), 1);
      g.strokeCircle(p.x, p.y - 6, pulse);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(p.x, p.y - 6, 2);
    }
  }
}
