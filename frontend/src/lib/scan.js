// A machine code or a nameplate is not an exercise id. Turn the text into a
// library match, and refuse to guess when two exercises are equally plausible.
// A code this phone has already confirmed wins, so the next scan is one tap.
import { matchExercise } from './import-csv.js'

export function linesOf(raw) {
  return String(raw || '').split(/\n+/).map(s => s.trim()).filter(s => s.length > 2)
}

// A QR payload is often a link. The exercise name, when the link has one, is a
// query parameter or the last path segment — not the host, and not an opaque id.
export function textFromCode(raw) {
  const s = String(raw || '').trim()
  try {
    const u = new URL(s)
    const named = u.searchParams.get('name') || u.searchParams.get('exercise') || u.searchParams.get('title')
    if (named) return named.replace(/[-_]+/g, ' ').trim()
    const seg = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '')
    if (seg && !/^[a-z0-9]{16,}$/i.test(seg)) return seg.replace(/[-_]+/g, ' ').trim()
  } catch { /* a name, not a link */ }
  return s
}

export function scanKeys(raw) {
  const payload = String(raw || '').trim().toLowerCase()
  if (!payload) return []
  const keys = [payload]
  const spoken = textFromCode(raw).trim().toLowerCase()
  if (spoken && spoken !== payload) keys.push(spoken)
  return keys
}

export function resolveScan({ raw, machines = {} }) {
  const keys = scanKeys(raw)
  if (!keys.length) return { kind: 'empty', keys }
  for (const k of keys) if (machines[k]) return { kind: 'remembered', id: machines[k], keys }
  const spoken = textFromCode(raw).trim()
  const texts = [spoken, ...linesOf(spoken).filter(l => l.toLowerCase() !== spoken.toLowerCase())]
  const ids = []
  const seen = new Set()
  for (const line of texts) {
    const id = matchExercise(line)
    if (id && !seen.has(id)) { seen.add(id); ids.push(id) }
  }
  if (ids.length === 1) return { kind: 'one', id: ids[0], keys }
  if (ids.length > 1) return { kind: 'many', ids: ids.slice(0, 6), keys }
  const query = linesOf(spoken).filter(l => !/^https?:/i.test(l)).sort((a, b) => b.length - a.length)[0] || ''
  return { kind: 'none', query, keys }
}
