export function isUsableKey(key: unknown): key is string | number {
  return ['string', 'number', ''].includes(typeof key);
}

export function keyBy<T extends object, K extends keyof T>(list: T[], key: K): Record<string, T> {
  return list.reduce<Record<string, T>>((acc: Record<string, T>, item: T): Record<string, T> => {
    const recordKey = item[key];

    if (!isUsableKey(recordKey)) {
      throw new Error(`Prop ${key as string} doesn't contain values for key`);
    }

    acc[recordKey as string | number] = item;

    return acc;
  }, {});
}
