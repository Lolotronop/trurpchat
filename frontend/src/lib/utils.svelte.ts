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

export const debounced = <T extends (...args: any[]) => any>(
  callback: T,
  waitFor: number
) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>): ReturnType<T> => {
    let result: any;
    timeout && clearTimeout(timeout);
    timeout = setTimeout(() => {
      result = callback(...args);
    }, waitFor);
    return result;
  };
};

