/** Lightweight cron field describe for UI preview (server still validates with croner). */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function part(label: string, value: string, names?: string[]): string {
  if (value === '*') return `every ${label}`
  if (value.startsWith('*/')) return `every ${value.slice(2)} ${label}s`
  if (value.includes(',')) {
    const bits = value.split(',')
    if (names) return bits.map((b) => names[Number(b)] ?? b).join(', ')
    return bits.join(', ')
  }
  if (value.includes('-')) return `${value} ${label}`
  if (names && /^\d+$/.test(value)) return names[Number(value)] ?? value
  return `${label} ${value}`
}

export function describeCron(expression: string): string | null {
  const fields = expression.trim().split(/\s+/)
  if (fields.length < 5 || fields.length > 6) return null
  const [min, hour, dom, mon, dow] = fields.length === 6 ? fields.slice(1) : fields
  if (!min || !hour || !dom || !mon || !dow) return null

  try {
    const bits = [
      part('minute', min),
      part('hour', hour),
      part('day-of-month', dom),
      part('month', mon),
      part('weekday', dow, DOW),
    ]
    return bits.join(', ')
  } catch {
    return null
  }
}

export function looksLikeCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  return fields.length === 5 || fields.length === 6
}
