// On-device nameplate reading. The model ships with the app, the same idea as
// kliniker-vault's ML Kit step: a photo becomes text, and an empty read is not
// an error — the user types the name instead.
export async function readPlate(file) {
  let worker
  try {
    const { createWorker } = await import('tesseract.js')
    const root = new URL('tess/', document.baseURI).href
    worker = await createWorker('eng', 1, {
      workerPath: root + 'worker.min.js',
      corePath: root + 'tesseract-core-simd-lstm.wasm.js',
      langPath: root,
      gzip: true,
    })
    const { data } = await worker.recognize(file)
    return String(data?.text || '').replace(/[|]/g, 'I').trim()
  } catch (e) {
    return ''
  } finally {
    if (worker) await worker.terminate().catch(() => {})
  }
}
