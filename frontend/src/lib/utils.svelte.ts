import type { User } from "trurpchat-backend";

export function username(user: User) {
  if (user.displayName && user.displayName.length > 0) {
    return user.displayName;
  }

  return user.name;
}

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

export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function minmax(arr: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  if (arr.length < 2) {
    return [min, max];
  }

  for (const n of arr) {
    if (n < min) {
      min = n;
    }
    if (n > max) {
      max = n;
    }
  }
  return [min, max];
}
