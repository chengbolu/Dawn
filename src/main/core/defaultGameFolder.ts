import fs from 'node:fs'
import path from 'node:path'

/** The built-in game root lives beside the launcher executable, like PCL. */
export function launcherGameFolderPath(launcherDirectory: string): string {
  return path.join(path.resolve(launcherDirectory), '.minecraft')
}

/** Only the launcher-owned default may be created implicitly; missing external roots stay missing. */
export function ensureDefaultGameFolder(root: string, folders: readonly { path: string }[]): void {
  if (folders.some(folder => path.resolve(folder.path) === path.resolve(root))) {
    fs.mkdirSync(root, { recursive: true })
  }
}
