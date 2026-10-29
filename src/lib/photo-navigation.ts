export function photoIndex(index: number, count: number): number {
  return Math.max(0, Math.min(index, count - 1));
}

export function movePhotoIndex(
  index: number,
  count: number,
  direction: -1 | 1,
) {
  return count > 0 ? (photoIndex(index, count) + direction + count) % count : 0;
}
