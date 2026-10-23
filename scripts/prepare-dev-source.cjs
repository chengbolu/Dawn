const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const stage = path.resolve(root, 'build', 'developer-source')
const expected = path.join(root, 'build', 'developer-source')
if (stage !== expected || !stage.startsWith(root + path.sep)) {
  throw new Error(`Refusing to prepare unexpected source directory: ${stage}`)
}

fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })

const copy = (relative) => {
  const from = path.join(root, relative)
  const to = path.join(stage, relative)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
}

for (const file of [
  'package.json',
  'package-lock.json',
  'electron.vite.config.ts',
  'tsconfig.json',
  'DEVELOPMENT.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'licenses',
  'docs/CORRESPONDING_SOURCE.md',
  'src',
  'native',
  'vendor/cubiomes',
  'bridge/src',
  'scripts/build-mod-worker.cjs',
  'scripts/build-native.cjs',
  'scripts/build-bridge.cjs',
  'scripts/check-licenses.cjs',
  'scripts/portable-build-hook.cjs',
  'scripts/verify-windows-runtime.cjs',
  'scripts/prune-windows-runtime.cjs',
  'scripts/prepare-dev-source.cjs',
  'build/icon.png',
  'build/icon-512.png',
  'build/icon.ico',
  'build/installer.nsh'
]) copy(file)

console.log(`Prepared clean developer source: ${stage}`)
