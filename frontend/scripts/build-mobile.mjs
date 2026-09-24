// cmd.exe does not accept the Unix `VITE_MOBILE=1 cmd` prefix. Set the variables
// here and run the same two steps the old script ran, through Node so the
// arguments are not passed through a shell.
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cwd = realpathSync.native(process.cwd())
const env = {
  ...process.env,
  VITE_MOBILE: '1',
  VITE_IMG_BASE: 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/images/',
  VITE_GIF_BASE: 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/videos/',
}

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(signal))
      else if (code) reject(new Error(script + ' exited ' + code))
      else resolve()
    })
  })
}

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const cap = fileURLToPath(new URL('../node_modules/@capacitor/cli/bin/capacitor', import.meta.url))
await run(vite, ['build'])
await run(cap, ['sync'])
