import Phaser from 'phaser';
import type { GridDir, Uniform, WorldData } from '../../types/world';
import type { WorldModel } from '../world/WorldModel';
import { PixelBuf } from './core/pixbuf';
import { appearanceOf, CHAR_H, CHAR_W, renderSheet } from './characters';
import { paintGround } from './ground';
import { machineFrames, machineSprite } from './machines';
import { canopyRoof, chairFrontSprite, chimneySprite, hedgeSprite, lampSprite, parkBenchSprite, propKeyType, propSprite, signSprite, swayed, treeSprite } from './objects';
import type { Sprite } from './sheet';
import { VEHICLE_FRAMES, vehicleSprite } from './vehicles';

/** Âncora normalizada (0..1) de cada textura gerada. */
const anchors = new Map<string, { x: number; y: number }>();

export function anchorOf(key: string): { x: number; y: number } {
  return anchors.get(key) ?? { x: 0.5, y: 0.5 };
}

/** Converte um PixelBuf em textura canvas do Phaser. */
export function bufToTexture(scene: Phaser.Scene, key: string, buf: PixelBuf, ax = 0, ay = 0) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, buf.w, buf.h);
  if (!tex) throw new Error(`Falha ao criar textura ${key}`);
  const img = new ImageData(new Uint8ClampedArray(buf.data), buf.w, buf.h);
  tex.getContext().putImageData(img, 0, 0);
  tex.refresh();
  anchors.set(key, { x: ax / buf.w, y: ay / buf.h });
}

export function spriteToTexture(scene: Phaser.Scene, key: string, s: Sprite) {
  bufToTexture(scene, key, s.buf, s.ax, s.ay);
}

/** Folha de quadros de um personagem (todos os quadros como frames nomeados de uma textura). */
export function charSheetTexture(scene: Phaser.Scene, u: Uniform, look: number) {
  const key = keys.charSheet(u, look);
  if (scene.textures.exists(key)) return;
  const { buf, layout } = renderSheet(appearanceOf(u, look));
  bufToTexture(scene, key, buf);
  const tex = scene.textures.get(key);
  for (const f of layout.frames) tex.add(f.name, 0, f.x, f.y, CHAR_W, CHAR_H);
}

export const keys = {
  ground: 'ground',
  prop: (type: string, w: number, h: number, v: number) => `prop_${type}_${w}x${h}_${v % 4}`,
  machine: (id: string, frame = 0) => (frame ? `mch_${id}_${frame}` : `mch_${id}`),
  tree: (kind: string, v: number, sway = 0) => `tree_${kind}_${v % 3}${sway ? `_w${sway}` : ''}`,
  hedge: (w: number, h: number) => `hedge_${w}x${h}`,
  vehicle: (kind: string, color: string, dir: GridDir, frame = 0) => `veh_${kind}_${color.replace('#', '')}_${dir}_${dir === 'E' || dir === 'W' ? frame : 0}`,
  charSheet: (u: Uniform, look: number) => `chr_${u}_${look}`,
  canopy: (id: string) => `canopy_${id}`,
};

export const UNIFORM_LIST: Uniform[] = ['operacional', 'administrativo', 'manutencao', 'seguranca', 'motorista', 'visitante'];

function radial(scene: Phaser.Scene, key: string, size: number, color: [number, number, number], soft = 0.35) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gg, b] = color;
  g.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  g.addColorStop(soft, `rgba(${r},${gg},${b},0.7)`);
  g.addColorStop(0.75, `rgba(${r},${gg},${b},0.18)`);
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

function icon(scene: Phaser.Scene, key: string, w: number, h: number, draw: (b: PixelBuf) => void, outline = true) {
  const b = new PixelBuf(w, h);
  draw(b);
  if (outline) b.outline();
  bufToTexture(scene, key, b, w / 2, h / 2);
}

export function generateTextures(scene: Phaser.Scene, world: WorldModel) {
  const data: WorldData = world.data;
  const t0 = performance.now();
  bufToTexture(scene, keys.ground, paintGround(world));

  for (const p of world.props) {
    if (p.type === 'rug' || p.type === 'liftbay') continue;
    const kt = propKeyType(p);
    spriteToTexture(scene, keys.prop(kt, p.rect.w, p.rect.h, p.variant), kt === 'chairS' ? chairFrontSprite(p.variant % 4) : propSprite(p.type, p.rect.w, p.rect.h, p.variant % 4));
  }
  for (const m of data.machines) for (let f = 0; f < machineFrames(m); f++) spriteToTexture(scene, keys.machine(m.id, f), machineSprite(m, f));
  for (const kind of ['round', 'pine', 'bush'])
    for (let v = 0; v < 3; v++) {
      const base = treeSprite(kind as 'round', v);
      spriteToTexture(scene, keys.tree(kind, v), base);
      // quadros de vento (a copa balança ±1–2 px)
      const amp = kind === 'bush' ? 1 : 2;
      spriteToTexture(scene, keys.tree(kind, v, 1), swayed(base, amp));
      spriteToTexture(scene, keys.tree(kind, v, 2), swayed(base, -amp));
    }
  for (const h of data.layout.hedges) spriteToTexture(scene, keys.hedge(h.w, h.h), hedgeSprite(h.w, h.h));
  spriteToTexture(scene, 'lamp', lampSprite());
  spriteToTexture(scene, 'parkbench', parkBenchSprite());
  spriteToTexture(scene, 'chimney', chimneySprite());
  for (const s of data.layout.signs) spriteToTexture(scene, `sign_${s.text}`, signSprite(s.text));
  for (const b of data.buildings) if (b.kind === 'cobertura') spriteToTexture(scene, keys.canopy(b.id), canopyRoof(b.rect.w, b.rect.h));

  const dirs: GridDir[] = ['E', 'W', 'N', 'S'];
  for (const v of data.vehicles)
    for (const d of dirs)
      for (let f = 0; f < (d === 'E' || d === 'W' ? VEHICLE_FRAMES : 1); f++) spriteToTexture(scene, keys.vehicle(v.kind, v.color, d, f), vehicleSprite(v.kind, v.color, d, f));
  // personagens: uma folha (canvas) por pessoa, com todos os quadros nomeados
  data.employees.forEach((e, i) => charSheetTexture(scene, e.uniform, e.look ?? i));

  // ícones e efeitos
  icon(scene, 'ico_shadow', 12, 5, (b) => b.ellipse(6, 2.5, 6, 2.5, 'rgba(20,24,40,0.3)'), false);
  icon(scene, 'ico_smoke', 8, 8, (b) => {
    b.ellipse(4, 4, 4, 4, '#cfd3d8');
    b.ellipse(3, 3, 2, 2, '#f1f3f5');
  }, false);
  icon(scene, 'ico_bubble', 14, 12, (b) => {
    b.round(0, 0, 14, 9, '#ffffff');
    b.rect(3, 9, 3, 2, '#ffffff');
    for (const x of [3, 6, 9]) b.rect(x, 4, 2, 2, '#3b4152');
  });
  icon(scene, 'ico_gear', 11, 11, (b) => {
    b.round(0, 0, 11, 11, '#ffffff');
    b.ellipse(5.5, 5.5, 3.5, 3.5, '#f2b632');
    b.ellipse(5.5, 5.5, 1.5, 1.5, '#ffffff');
    for (const [x, y] of [[5, 1], [5, 8], [1, 5], [8, 5]]) b.rect(x, y, 2, 2, '#f2b632');
  });
  icon(scene, 'ico_led', 6, 6, (b) => {
    b.ellipse(3, 3, 3, 3, '#ffffff');
  }, false);
  icon(scene, 'ico_cone', 8, 10, (b) => {
    b.rect(0, 8, 8, 2, '#7c2d12');
    for (let y = 0; y < 8; y++) b.hline(4 - Math.floor(y / 2), 3 + Math.ceil(y / 2), y, '#f97316');
    b.hline(2, 5, 4, '#f8fafc');
  });
  radial(scene, 'light_warm', 128, [255, 214, 150]);
  radial(scene, 'fx_red', 10, [255, 60, 50], 0.3);
  radial(scene, 'fx_amber', 10, [255, 176, 40], 0.3);
  icon(scene, 'gate_arm', 66, 5, (b) => {
    for (let x = 0; x < 66; x++) b.rect(x, 1, 1, 3, x < 4 ? '#2b2f3a' : Math.floor((x - 4) / 7) % 2 ? '#d22f2a' : '#f4f2ee');
    b.hline(4, 65, 1, 'rgba(255,255,255,0.5)');
  });
  radial(scene, 'light_cool', 128, [196, 222, 255]);
  radial(scene, 'light_white', 64, [255, 250, 235], 0.25);
  if (!scene.textures.exists('px')) {
    const t = scene.textures.createCanvas('px', 4, 4)!;
    t.getContext().fillStyle = '#ffffff';
    t.getContext().fillRect(0, 0, 4, 4);
    t.refresh();
  }
  console.info(`[arte] texturas geradas em ${Math.round(performance.now() - t0)} ms`);
}
