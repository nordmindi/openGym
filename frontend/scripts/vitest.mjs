#!/usr/bin/env node
// Git Bash starts Node with a lowercase drive letter (c:\...) while Node's
// realpath uses the canonical case (C:\...). Vitest then loads two copies of
// its runner and every suite dies inside describe() reading 'config'.
// Running from the canonical path keeps a single runner.

import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cwd = realpathSync.native(process.cwd())
const vitest = realpathSync.native(
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
)
const child = spawn(process.execPath, [vitest, ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
