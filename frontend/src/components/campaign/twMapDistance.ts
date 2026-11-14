import type { Token } from '@/types';

/** Central range measurement for the current square grid. Future hex modes can add adapters here. */
export function twGridDistance(source: Token, target: Token): number {
  const ax0 = source.position.x;
  const ay0 = source.position.y;
  const ax1 = ax0 + Math.max(1, source.size.width) - 1;
  const ay1 = ay0 + Math.max(1, source.size.height) - 1;
  const bx0 = target.position.x;
  const by0 = target.position.y;
  const bx1 = bx0 + Math.max(1, target.size.width) - 1;
  const by1 = by0 + Math.max(1, target.size.height) - 1;
  const dx = Math.max(0, bx0 - ax1, ax0 - bx1);
  const dy = Math.max(0, by0 - ay1, ay0 - by1);
  return Math.ceil(Math.max(dx, dy));
}
