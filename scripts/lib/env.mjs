// Keys come from the environment (GitHub Secrets in the cloud) or, on the owner's PC,
// from blogger.env outside the project. A non-empty environment value wins.

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const ENV_FILE = process.env.BLOGGER_ENV_FILE || join(homedir(), '.config', 'claude-seo', 'blogger.env')

export function readEnvFile(file = ENV_FILE) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

export function loadEnv() {
  const out = readEnvFile()
  for (const [k, v] of Object.entries(process.env)) if (v) out[k] = v
  return out
}
