export function toDb(value: number) {
  return value === 0 ? -Infinity : 20 * Math.log10(value);
}

export function fromDb(value: number, minDb: number = -60) {
  if (value < minDb) {
    return 0;
  }
  return value === -Infinity ? 0 : 10 ** (value / 20);
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void | Promise<void>,
  wait = 250,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return (...args: Args) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      void fn(...args);
    }, wait);
  };
}
