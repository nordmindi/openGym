import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { effectiveRoutine, toggleSessionPause } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  if (!user && !isGuest) return null
  const cur = loc.pathname.split('/')[1] || 'home'
  const on = k => cur === k || (cur === 'history' && k === 'stats') || (cur === 'settings' && k === 'home')

  const onWorkout = loc.pathname === '/workout'
  const runningHere = !!(S.active && onWorkout && !S.active.pausedAt)
  const startWorkout = () => {
    // Already in the session: the play button pauses the clock, and resumes it again.
    // From any other tab it still just brings the session back.
    if (S.active && onWorkout) {
      const pausing = !S.active.pausedAt
      useStore.getState().update(s => { toggleSessionPause(s.active) })
      if (pausing) useUI.getState().pauseCountdowns()
      else useUI.getState().resumeCountdowns()
      return
    }
    if (!S.active) {
      const r = effectiveRoutine(S, todayISO())
      if (r && r.ex.length) { onStart(r.id); return }
      nav('/workout')
      return
    }
    // Coming back from another tab: Resume means the clock runs again.
    if (S.active.pausedAt) {
      useStore.getState().update(s => { toggleSessionPause(s.active) })
      useUI.getState().resumeCountdowns()
    }
    nav('/workout')
  }
  const Tab = ({ k, icon, to, label }) => (
    <button className={on(k) ? 'on' : ''} onClick={() => nav(to)}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  )

  return (
    <nav id="tabbar">
      <Tab k="home" icon="house" to="/home" label={t('Home')} />
      <Tab k="plan" icon="calendar" to="/plan" label={t('Plan')} />
      <button className={'start' + (S.active ? ' rec' : '')} onClick={startWorkout}>
        <span className="cir"><Icon name={runningHere ? 'pause' : S.active ? 'play' : 'dumbbell'} /></span>
        <span>{runningHere ? t('Pause') : S.active ? t('Resume') : t('Start')}</span>
      </button>
      <Tab k="stats" icon="chart" to="/stats" label={t('Stats')} />
      <Tab k="library" icon="list" to="/library" label={t('Exercises')} />
    </nav>
  )
}
