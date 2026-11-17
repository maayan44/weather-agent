// Maps a raw value onto 0-100 along a straight line, clamped at both ends.
export function scaleToScore(value: number, zeroAt: number, hundredAt: number): number {
  if (hundredAt === zeroAt) throw new Error("Anchors must differ");
  const share = (value - zeroAt) / (hundredAt - zeroAt);
  return Math.min(1, Math.max(0, share)) * 100;
}

// One place for display rounding; scores are only rounded at the very end.
export function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}
