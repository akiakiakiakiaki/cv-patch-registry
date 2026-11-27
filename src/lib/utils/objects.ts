/** Keys of `T` that may be missing. */
type OptionalKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T];

/**
 * Copy of `object` with the optional `key` set to `value`, or without the key when `value` is undefined.
 * Keeps stored documents free of `key: undefined` entries.
 */
export function withOptional<T extends object, K extends OptionalKeys<T>>(object: T, key: K, value: T[K] | undefined): T {
  const { [key]: _removed, ...rest } = object;
  return (value === undefined ? rest : { ...rest, [key]: value }) as T;
}
