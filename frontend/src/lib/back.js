// Android's back button. Sheets are not routes, and the tabs are siblings, so the WebView
// history is the wrong stack: it either exits or replays every tab the user tapped.
// One press undoes the last thing on screen. Leaving the app happens only from Home.

export function pathFromHash(hash) {
  const raw = String(hash || '').replace(/^#/, '')
  const path = (raw.split('?')[0] || '/').trim() || '/'
  return path.startsWith('/') ? path : `/${path}`
}

export function nextBack({ pathname, sheets = [], authed }) {
  const top = sheets.length ? sheets[sheets.length - 1] : null
  if (top) return top.locked ? { type: 'stay' } : { type: 'close', id: top.id }
  if (!authed) return { type: 'exit' }
  if (pathname.startsWith('/plan/r/')) return { type: 'go', to: '/plan' }
  if (pathname === '/history') return { type: 'go', to: '/stats' }
  if (pathname === '/settings' || pathname === '/admin') return { type: 'go', to: '/home' }
  if (pathname !== '/home' && pathname !== '/') return { type: 'go', to: '/home' }
  return { type: 'exit' }
}
