/**
 * Copy Next static export (`out/`) into Hermes web_dist for mount_spa.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const uiRoot = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(uiRoot, '..', 'out')
const webDist = path.resolve(uiRoot, '../../hermes/hermes_cli/web_dist')

if (!existsSync(outDir)) {
  console.error(`Next export missing: ${outDir}`)
  process.exit(1)
}

rmSync(webDist, { recursive: true, force: true })
mkdirSync(path.dirname(webDist), { recursive: true })
cpSync(outDir, webDist, { recursive: true })
console.log(`Copied ${outDir} → ${webDist}`)
