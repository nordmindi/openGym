// One log on two copies. A workout day that exists on only one side is kept — a sync
// must not make a trained day disappear. When both sides have that day, the copy
// whose session finished later wins, and the other is left behind.

const stamp = w => Math.max(w?.edited || 0, w?.end || 0, w?.start || 0)

function byDay(list, side, groups) {
  for (const item of list || []) {
    const d = item.d || item.id
    if (!groups.has(d)) groups.set(d, { local: [], remote: [] })
    groups.get(d)[side].push(item)
  }
}

// Newest side wins the whole day. A tie keeps both ids, so neither copy is dropped.
export function mergeByDay(local, remote) {
  const groups = new Map()
  byDay(local, 'local', groups)
  byDay(remote, 'remote', groups)
  const out = []
  for (const { local: L, remote: R } of groups.values()) {
    if (!R.length) out.push(...L)
    else if (!L.length) out.push(...R)
    else {
      const ls = Math.max(...L.map(stamp))
      const rs = Math.max(...R.map(stamp))
      if (ls > rs) out.push(...L)
      else if (rs > ls) out.push(...R)
      else {
        const byId = new Map()
        for (const w of [...R, ...L]) byId.set(w.id, w)
        out.push(...byId.values())
      }
    }
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (stamp(a) - stamp(b))))
}

// Keys only one side has are kept. A key on both sides takes the newer document's value.
function unionObj(newer, older) {
  return { ...(older || {}), ...(newer || {}) }
}

function unionList(newer, older) {
  const m = new Map()
  for (const x of newer || []) if (x && x.id) m.set(x.id, x)
  for (const x of older || []) if (x && x.id && !m.has(x.id)) m.set(x.id, x)
  return [...m.values()]
}

// A signed-in browser has a user. The phone has a sync token and no user. Either one
// means edits should be pushed; neither means the log stays on this device only.
export function hasSyncLink(user, token) {
  return !!(user || token)
}

export function mergeLogs(local, remote) {
  const L = local || {}
  const R = remote || {}
  const remoteNewer = (R._ts || 0) >= (L._ts || 0)
  const newer = remoteNewer ? R : L
  const older = remoteNewer ? L : R
  return {
    ...older,
    ...newer,
    workouts: mergeByDay(L.workouts, R.workouts),
    bodyweight: mergeByDay(L.bodyweight, R.bodyweight),
    routines: unionList(newer.routines, older.routines),
    customEx: unionList(newer.customEx, older.customEx),
    week: unionObj(newer.week, older.week),
    dayPlan: unionObj(newer.dayPlan, older.dayPlan),
    exWeights: unionObj(newer.exWeights, older.exWeights),
    exNotes: unionObj(newer.exNotes, older.exNotes),
    // A session in progress belongs to this device. The server never stores one.
    active: L.active || null,
    _ts: Date.now()
  }
}
