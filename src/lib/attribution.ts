const storageKey = 'osi-utm-attribution-v1';
const keys = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;
type Attribution = Partial<Record<(typeof keys)[number], string>>;

function pickAttribution(value: unknown): Attribution {
  const result: Attribution = {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return result;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const item = Object.hasOwn(record, key) ? record[key] : undefined;
    if (typeof item === 'string' && item) result[key] = item.slice(0, 300);
  }
  return result;
}

export function attribution(): Attribution {
  if (typeof window === 'undefined' || typeof location === 'undefined')
    return {};
  const params = new URLSearchParams(location.search);
  const current = pickAttribution(
    Object.fromEntries(keys.map((key) => [key, params.get(key)])),
  );
  if (Object.keys(current).length) {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(current));
    } catch {
      // A failed update must not leave an older campaign as the next fallback.
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Browsers can block storage entirely; current URL attribution still works.
      }
    }
    return current;
  }
  try {
    const saved = window.sessionStorage.getItem(storageKey);
    // Five 300-character values fit even when JSON escapes every character.
    return saved && saved.length <= 10000
      ? pickAttribution(JSON.parse(saved))
      : {};
  } catch {
    return {};
  }
}
