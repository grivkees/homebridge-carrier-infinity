import { distinctUntilChanged, OperatorFunction } from 'rxjs';

export function distinctUntilChangedWithEpsilon<T>(epsilon = Number.EPSILON): OperatorFunction<T, T> {
  return distinctUntilChanged((prev, cur) => {
    if (typeof prev !== 'number' || typeof cur !== 'number') {
      // Use strict equality if either value is non-numeric
      return prev === cur;
    }
    // Otherwise, use the epsilon comparison for numeric values
    return Math.abs(prev - cur) < epsilon;
  });
}
