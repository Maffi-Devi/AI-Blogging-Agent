// Paths, India time, and the post history (state/posts.json) that replaces "read the log".

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const OUT = join(ROOT, 'out')
export const POSTS_FILE = join(ROOT, 'state', 'posts.json')
export const LOG_FILE = join(ROOT, 'log', 'blogger-log.md')
export const SITE = 'https://www.anwebservice.com'
export const PUBLISH_HOUR = 10 // 10:00 AM IST

const IST_OFFSET_MS = 5.5 * 3600 * 1000

// { date: '2026-10-08', time: '09:41', hour: 9, weekday: 'Thursday' } in India time.
export function istNow(now = new Date()) {
  const d = new Date(now.getTime() + IST_OFFSET_MS)
  const iso = d.toISOString()
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    hour: d.getUTCHours(),
    weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()],
  }
}

export const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback)

export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

export const readPosts = () => readJson(POSTS_FILE, [])
export const writePosts = (posts) => writeJson(POSTS_FILE, posts)

export function appendLog(text) {
  mkdirSync(dirname(LOG_FILE), { recursive: true })
  appendFileSync(LOG_FILE, text.endsWith('\n') ? text : text + '\n')
}

// "/locations/rewari" or a full URL → "https://www.anwebservice.com/locations/rewari"
export function siteUrl(pathOrUrl) {
  const u = new URL(pathOrUrl, SITE)
  return SITE + (u.pathname === '/' ? '/' : u.pathname.replace(/\/$/, ''))
}
