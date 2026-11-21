#!/usr/bin/env node
// Pexels fallback for the cover picture (brief section 4.2). Photos already used are left out.
//
//   node scripts/pexels.mjs search "indian shop owner smartphone"
//   node scripts/pexels.mjs download <photo id> out/bg.jpg

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadEnv } from './lib/env.mjs'
import { readPosts } from './lib/state.mjs'

const [cmd, ...rest] = process.argv.slice(2)
const key = loadEnv().PEXELS_API_KEY
if (!key) {
  console.log(JSON.stringify({ pexels: 'not available', reason: 'PEXELS_API_KEY is not set', next: 'Use the brand-card cover.' }))
  process.exit(0)
}

async function api(path) {
  const res = await fetch(`https://api.pexels.com/v1/${path}`, { headers: { Authorization: key } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${json.error ?? JSON.stringify(json)}`)
  return json
}

if (cmd === 'search' && rest.length) {
  const usedIds = new Set(readPosts().map((p) => String(p.image?.pexelsId ?? '')))
  const json = await api(`search?${new URLSearchParams({ query: rest.join(' '), orientation: 'landscape', per_page: '15' })}`)
  const photos = json.photos
    .filter((p) => !usedIds.has(String(p.id)))
    .map((p) => ({ id: p.id, alt: p.alt, photographer: p.photographer, page: p.url, preview: p.src.medium }))
  console.log(JSON.stringify({ photos }, null, 2))
} else if (cmd === 'download' && rest.length === 2) {
  const [id, out] = rest
  const photo = await api(`photos/${id}`)
  const img = await fetch(photo.src.landscape)
  if (!img.ok) throw new Error(`Download failed: ${img.status}`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, Buffer.from(await img.arrayBuffer()))
  console.log(JSON.stringify({ out, pexelsId: photo.id, photographer: photo.photographer, page: photo.url }))
} else {
  console.error('Usage: node scripts/pexels.mjs search "<words>"  |  download <photo id> <out file>')
  process.exit(1)
}
