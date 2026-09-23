import { useEffect, useRef } from 'react'
import { fmtVol, isoOf, todayISO, MONTHS } from '../lib/format.js'
import { heatmapSpan, quartileCuts, activityLevel } from '../lib/heatmap.js'
import { t } from '../lib/i18n.js'

// GitHub-style activity heatmap. Timed sessions are shaded by minutes; imported
// days with no clock are shaded by how many sets they hold, on the same scale.
export default function Heatmap({ S, onDay }) {
  const wrapRef = useRef(null)
  useEffect(() => { if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth }, [])

  const agg = {}
  S.workouts.forEach(w => {
    const a = agg[w.d] = agg[w.d] || { n: 0, vol: 0, min: 0, sets: 0 }
    a.n++; a.vol += w.vol || 0
    a.min += Math.max(0, Math.round(((w.end || w.start) - w.start) / 60000))
    a.sets += (w.entries || []).reduce((n, e) => n + (e.sets?.length || 0), 0)
  })
  const days = Object.values(agg)
  const minuteCuts = quartileCuts(days.map(a => a.min))
  const setCuts = quartileCuts(days.filter(a => !a.min).map(a => a.sets))
  const timed = days.some(a => a.min > 0)
  const dates = Object.keys(agg).sort()

  const today = new Date(); today.setHours(12, 0, 0, 0)
  const { start, weeks } = heatmapSpan(dates[0], today)

  const months = [], cols = []
  let lastMonth = -1
  for (let wk = 0; wk < weeks; wk++) {
    const colStart = new Date(start); colStart.setDate(start.getDate() + wk * 7)
    const mo = colStart.getMonth()
    const showM = mo !== lastMonth && colStart.getDate() <= 7 && wk < weeks - 2
    months.push(<span key={wk}>{showM ? t(MONTHS[mo]) : ''}</span>)
    if (colStart.getDate() <= 7) lastMonth = mo
    const cells = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(colStart); day.setDate(colStart.getDate() + d)
      const key = isoOf(day)
      const a = agg[key]
      const cls = 'hm-c l' + activityLevel(a, minuteCuts, setCuts) + (key === todayISO() ? ' today' : '') + (day > today ? ' future' : '')
      const detail = !a ? '' : a.min
        ? `${a.min} min · ${fmtVol(a.vol, S.unit)}`
        : `${t('{0} sets', a.sets)} · ${fmtVol(a.vol, S.unit)}`
      cells.push(<div key={d} className={cls}
        title={key + (a ? ` · ${t(a.n === 1 ? '{0} workout' : '{0} workouts', a.n)} · ${detail}` : '')}
        onClick={a ? () => onDay(key) : undefined} />)
    }
    cols.push(<div key={wk} className="hm-col">{cells}</div>)
  }

  return <>
    <div className="hm-wrap" ref={wrapRef}>
      <div className="hm-months" style={{ marginLeft: 30 }}>{months}</div>
      <div className="hm-body">
        <div className="hm-days"><span>{t('Mon')}</span><span /><span>{t('Wed')}</span><span /><span>{t('Fri')}</span><span /><span /></div>
        <div className="hm-grid">{cols}</div>
      </div>
    </div>
    <div className="hm-legend">{t(timed ? 'Less time' : 'Less')} <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" /><div className="hm-c l3" /><div className="hm-c l4" /> {t(timed ? 'More time' : 'More')}</div>
  </>
}
