/** Spine leathers, widths and heights for the shelf. The Storybook cover uses the same leather as the book's spine. */
export const LEATHER = ["#7a2e2a", "#1f4d3a", "#1d3e66", "#6a4324", "#4c2d55", "#8d4b2a", "#24342e", "#6e2f3c"];
export const WIDTHS = [46, 54, 42, 62, 50, 58, 44, 66];
export const HEIGHTS = [176, 196, 168, 188, 180, 204, 172, 192];

export function leatherFor(spine: number | undefined): string {
  const index = Number.isFinite(spine) ? Math.abs(Math.trunc(spine as number)) : 0;
  return LEATHER[index % LEATHER.length];
}
