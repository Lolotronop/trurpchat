export function toDb(value: number) {
  return value === 0 ? -Infinity : 20 * Math.log10(value);
}

export function fromDb(value: number, minDb: number = -60) {
  return value === -Infinity ? 0 : Math.pow(10, value / 20);
}
