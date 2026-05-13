/**
 * Increments a number while keeping floating point math from getting weird.
 */
export function increment(current: number, step = 1, precision = 4): number {
  return Number((current + step).toFixed(precision));
}

/**
 * Decrements a number safely, with optional bounding.
 */
export function decrement(current: number, step = 1, min?: number, precision = 4): number {
  const next = current - step;
  if (min !== undefined && next < min) {
    return min;
  }
  return Number(next.toFixed(precision));
}
