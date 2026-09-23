import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { loadPlates, formatSide, PLATES, BAR_OPTIONS } from '../lib/plates.js'
import Icon from './Icon.jsx'

function pickBar(unit, current, onBar) {
  const options = BAR_OPTIONS[unit] || BAR_OPTIONS.kg
  useUI.getState().openSheet(close => <>
    <h3>{t('Bar')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('The plates below are for each side of this bar.')}</div>
    <div className="chips">
      {options.map(n => <button key={n} className={'chip' + (n === current ? ' on' : '')}
        onClick={() => { onBar(n); close() }}>{fmtNum(n)} {unit}</button>)}
    </div>
  </>)
}

/** Bar plus the plates to load for the working weight. Tap to change the bar. */
export default function PlateLoad({ weight, unit, bar, onBar }) {
  const u = unit === 'lb' ? 'lb' : 'kg'
  const loaded = loadPlates(weight, bar, PLATES[u])
  if (!loaded) return null
  const barLabel = fmtNum(loaded.bar) + ' ' + u
  let text
  if (loaded.leftover < 0) text = t('Under a {0} bar', barLabel)
  else if (!loaded.perSide.length) text = t('{0} bar · empty', barLabel)
  else text = t('{0} bar · {1} each side', barLabel, formatSide(loaded.perSide))
  if (loaded.leftover > 0) text += ' · ' + t('{0} left over', fmtNum(loaded.leftover) + ' ' + u)
  return <button type="button" className="progline" onClick={() => pickBar(u, bar, onBar)}>
    <Icon name="plate" />
    <span>{text}</span>
  </button>
}
