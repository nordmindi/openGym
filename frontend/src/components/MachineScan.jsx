import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { allExercises, exOr } from '../lib/exercises.js'
import { resolveScan, textFromCode } from '../lib/scan.js'
import { readPlate } from '../lib/plate.js'
import { t } from '../lib/i18n.js'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'
import { Button, TextArea } from './ui.jsx'

function remember(keys, id) {
  useStore.getState().update(s => {
    s.machines = { ...(s.machines || {}) }
    for (const k of keys) if (k) s.machines[k] = id
  })
}

function QrCamera({ onCode, onFail }) {
  const videoRef = useRef(null)
  const codeRef = useRef(onCode)
  const failRef = useRef(onFail)
  codeRef.current = onCode
  failRef.current = onFail
  useEffect(() => {
    let stop = false
    let stream
    const fail = (msg) => { if (!stop) failRef.current(msg) }
    ;(async () => {
      if (typeof BarcodeDetector === 'undefined') { fail(t('The camera cannot read a code here. Type the name instead.')); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      } catch (e) {
        fail(t('The camera is not available. Type the name instead.'))
        return
      }
      const video = videoRef.current
      if (!video || stop) { stream.getTracks().forEach(tr => tr.stop()); return }
      video.srcObject = stream
      await video.play()
      let det
      try { det = new BarcodeDetector({ formats: ['qr_code'] }) } catch (e) { fail(t('The camera cannot read a code here. Type the name instead.')); return }
      const tick = async () => {
        if (stop) return
        try {
          const codes = await det.detect(video)
          const raw = codes[0]?.rawValue
          if (raw) { stop = true; codeRef.current(raw); return }
        } catch (e) { /* a frame can fail while the camera warms up */ }
        requestAnimationFrame(tick)
      }
      tick()
    })()
    return () => {
      stop = true
      stream?.getTracks().forEach(tr => tr.stop())
    }
  }, [])
  return <>
    <h3>{t('Scan the code')}</h3>
    <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '3 / 4', objectFit: 'cover' }} />
    <div className="muted small" style={{ margin: '10px 0 14px' }}>{t('Point the camera at the code')}</div>
  </>
}

function Row({ ex, sub, onClick }) {
  return <div className="item" onClick={onClick}>
    <Thumb ex={ex} />
    <div className="grow"><div className="tt capitalize">{ex.n}</div>{sub && <div className="ss">{sub}</div>}</div>
    <Icon name="plus" className="chev" />
  </div>
}

export default function MachineScan({ onPick }) {
  const st = useStore(s => s.S)
  const toast = useUI(s => s.toast)
  const fileRef = useRef(null)
  const [mode, setMode] = useState('ask')
  const [typed, setTyped] = useState('')
  const [hit, setHit] = useState(null)
  const [browsing, setBrowsing] = useState(false)

  const take = (ex, keys) => {
    if (keys?.length) remember(keys, ex.id)
    onPick(ex)
  }
  const look = raw => {
    const next = resolveScan({ raw, machines: st.machines || {} })
    if (next.kind === 'empty') return
    setHit(next)
    setBrowsing(false)
    setMode('choose')
  }
  const onPhoto = async file => {
    if (!file) return
    setMode('reading')
    const text = await readPlate(file)
    setMode('ask')
    if (!text) { toast(t('No text found. Type the name.')); return }
    setTyped(text)
  }

  if (mode === 'camera') {
    return <QrCamera onCode={raw => { setTyped(raw); look(raw) }} onFail={msg => { setMode('ask'); toast(msg) }} />
  }
  if (mode === 'reading') {
    return <>
      <h3>{t('Read the name')}</h3>
      <div className="muted" style={{ margin: '12px 0' }}>{t('Reading the name…')}</div>
    </>
  }
  if (mode === 'choose' && hit && !browsing) {
    const spoken = textFromCode(typed).trim()
    const ids = hit.kind === 'many' ? hit.ids : hit.id ? [hit.id] : []
    const found = ids.map(id => exOr(id)).filter(ex => !ex.missing)
    const near = found.length ? [] : allExercises(st).filter(e => {
      const q = (hit.query || spoken).toLowerCase()
      return q && e.n.toLowerCase().includes(q)
    }).slice(0, 8)
    return <>
      <h3>{t('Scan a machine')}</h3>
      {found.length ? <div className="list">{found.map(ex => <Row key={ex.id} ex={ex} sub={t('This phone will remember this machine.')} onClick={() => take(ex, hit.keys)} />)}</div>
        : <div className="muted small" style={{ margin: '8px 0 14px' }}>{t('Nothing in the library matched.')}</div>}
      {!!near.length && <div className="list" style={{ marginTop: 8 }}>{near.map(ex => <Row key={ex.id} ex={ex} onClick={() => take(ex, hit.keys)} />)}</div>}
      <div style={{ height: 12 }} />
      <Button onClick={() => setBrowsing(true)}>{t('Not this one')}</Button>
    </>
  }

  const q = (browsing ? textFromCode(typed) : typed).trim().toLowerCase()
  const near = browsing ? allExercises(st).filter(e => q && (e.n.toLowerCase().includes(q) || (e.eq || '').toLowerCase().includes(q))).slice(0, 8) : []
  return <>
    <h3>{t('Scan a machine')}</h3>
    <div className="row" style={{ margin: '4px 0 12px' }}>
      <Button icon="camera" onClick={() => setMode('camera')}>{t('Scan the code')}</Button>
      <Button icon="camera" onClick={() => fileRef.current?.click()}>{t('Read the name')}</Button>
    </div>
    <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onPhoto(f) }} />
    <TextArea value={typed} placeholder={t('Type the name printed on the machine')} onChange={e => setTyped(e.target.value)} />
    <div style={{ height: 10 }} />
    <Button variant="primary" disabled={!typed.trim()} onClick={() => look(typed)}>{t('Find exercise')}</Button>
    {!!near.length && <div className="list" style={{ marginTop: 12 }}>{near.map(ex => <Row key={ex.id} ex={ex} onClick={() => take(ex, hit?.keys || [])} />)}</div>}
  </>
}
