/**
 * Remove keys whose value is undefined. This is needed because
 * exactOptionalPropertyTypes prevents passing undefined where a value
 * is expected.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}
