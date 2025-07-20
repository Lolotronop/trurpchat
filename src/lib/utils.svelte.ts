export function toDb(value: number) {
  return value === 0 ? -Infinity : 20 * Math.log10(value);
}

export function fromDb(value: number, minDb: number = -60) {
  return value === -Infinity ? 0 : Math.pow(10, value / 20);
}

type Procedure = (...args: any[]) => void;

interface DebouncedLeading<F extends Procedure> {
  (...args: Parameters<F>): void;
  cancel(): void;
}

function debounced<F extends Procedure>(
  fn: F,
  wait: number,
): DebouncedLeading<F> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (this: any, ...args: Parameters<F>) {
    if (timeout) return;
    fn.apply(this, args);
    timeout = setTimeout(() => {
      timeout = null;
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced as DebouncedLeading<F>;
}

export default debounced;
