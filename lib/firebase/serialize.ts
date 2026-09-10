import { Timestamp } from 'firebase-admin/firestore'

function isTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp || (typeof (value as any)?.toDate === 'function' && typeof (value as any)?.toMillis === 'function')
}

export function serializeValue(value: unknown): unknown {
  if (value == null) return value
  if (isTimestamp(value)) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serializeValue)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeValue(nested)
    }
    return out
  }
  return value
}

export function serializeDoc<T extends Record<string, unknown> = Record<string, unknown>>(
  id: string,
  data: Record<string, unknown> | undefined
): T {
  return {
    id,
    ...(serializeValue(data ?? {}) as Record<string, unknown>),
  } as T
}
