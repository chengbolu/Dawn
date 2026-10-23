const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
if (process.platform === 'darwin') {
  fs.mkdirSync(path.resolve('out/main'), { recursive: true })
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
  execFileSync('swiftc', ['-O', '-target', `${arch}-apple-macos11.0`, 'native/MacGameWindow.swift', '-o', 'out/main/MacGameWindow'], { stdio: 'inherit' })
}
if (process.platform === 'win32') {
  for (const name of ['WindowMaterial', 'GameWindowFocus']) {
  const output = path.resolve(`out/main/${name}.exe`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const compiler = path.join(process.env.SystemRoot || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
  execFileSync(compiler, ['/nologo', '/target:exe', '/platform:anycpu', '/optimize+', `/out:${output}`, path.resolve(`native/${name}.cs`)], { stdio: 'inherit', windowsHide: true })
  }
  const compiler = path.join(process.env.SystemRoot || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
  execFileSync(compiler, ['/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', `/out:${path.resolve('out/main/StartupFeedback.exe')}`, `/resource:${path.resolve('src/renderer/src/assets/splash-face.png')},face.png`, path.resolve('native/StartupFeedback.cs')], { stdio: 'inherit', windowsHide: true })

  const seedMapOutput = path.resolve('out/main/SeedMapEngine.exe')
  const cubiomes = file => path.resolve('vendor/cubiomes', file)
  execFileSync('gcc', [
    '-O3', '-std=c11', '-static', '-s',
    path.resolve('native/seedmap/seedmap.c'),
    cubiomes('biomes.c'), cubiomes('layers.c'), cubiomes('noise.c'),
    cubiomes('biomenoise.c'), cubiomes('generator.c'), cubiomes('finders.c'),
    '-lm', '-o', seedMapOutput
  ], { stdio: 'inherit', windowsHide: true })
}
