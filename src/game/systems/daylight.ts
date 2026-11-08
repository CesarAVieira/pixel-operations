/** Ciclo dia/noite — funções puras (sem Phaser), testáveis em Node. */

/** Escuridão (0 = dia pleno, 1 = noite) para uma hora do dia. */
export function darknessAt(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  if (h >= 7 && h < 17) return 0;
  if (h >= 17 && h < 19.5) return smooth((h - 17) / 2.5);
  if (h >= 19.5 || h < 5) return 1;
  return 1 - smooth((h - 5) / 2);
}
