#!/usr/bin/env node
// SerpApi research, limited to 3 searches per run (brief section 4.1).
//
//   node scripts/serp.mjs google "plywood traders yamunanagar whatsapp catalogue"
//   node scripts/serp.mjs news "google business profile update"
//   node scripts/serp.mjs autocomplete "how to get customers online in har"
//   node scripts/serp.mjs trends "plywood yamunanagar"
//   node scripts/serp.mjs count      searches used in this run

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from './lib/env.mjs'
import { OUT } from './lib/state.mjs'

const MAX_PER_RUN = 3
const COUNT_FILE = join(OUT, 'serp-count.txt')
const used = () => (existsSync(COUNT_FILE) ? Number(readFileSync(COUNT_FILE, 'utf8')) || 0 : 0)

const [kind, ...words] = process.argv.slice(2)
const q = words.join(' ').trim()

if (kind === 'count') {
  console.log(JSON.stringify({ used: used(), max: MAX_PER_RUN }))
  process.exit(0)
}

const ENGINES = {
  google: { engine: 'google', q, gl: 'in', hl: 'en', location: 'Haryana,India' },
  news: { engine: 'google_news', q, gl: 'in', hl: 'en' },
  autocomplete: { engine: 'google_autocomplete', q, gl: 'in', hl: 'en' },
  trends: { engine: 'google_trends', q, geo: 'IN-HR' },
}

if (!ENGINES[kind] || !q) {
  console.error('Usage: node scripts/serp.mjs google|news|autocomplete|trends "<query>"  |  count')
  process.exit(1)
}

const key = loadEnv().SERPAPI_API_KEY
const fallback = (reason) => {
  console.log(JSON.stringify({ serpapi: 'not used', reason, next: 'Research with WebSearch and write "SerpApi not used" as serpapiUsed: 0.' }))
  process.exit(0)
}
if (!key) fallback('SERPAPI_API_KEY is not set')
if (used() >= MAX_PER_RUN) fallback(`limit of ${MAX_PER_RUN} searches per post reached`)

const res = await fetch(`https://serpapi.com/search.json?${new URLSearchParams({ ...ENGINES[kind], api_key: key })}`)
const json = await res.json().catch(() => ({}))
if (!res.ok || json.error) fallback(`SerpApi error ${res.status}: ${json.error ?? 'unknown'}`)

mkdirSync(OUT, { recursive: true })
writeFileSync(COUNT_FILE, String(used() + 1))

const pick = (arr, fields, n) => (arr ?? []).slice(0, n).map((r) => Object.fromEntries(fields.filter((f) => r[f] != null).map((f) => [f, r[f]])))
const result = {
  searchesUsed: used(),
  organic_results: pick(json.organic_results, ['position', 'title', 'link', 'snippet', 'date'], 10),
  related_questions: pick(json.related_questions, ['question', 'snippet', 'link'], 8),
  related_searches: (json.related_searches ?? []).slice(0, 10).map((r) => r.query),
  news_results: pick(json.news_results, ['title', 'link', 'date', 'source'], 10),
  suggestions: (json.suggestions ?? []).slice(0, 12).map((s) => s.value),
  interest_over_time: json.interest_over_time?.timeline_data?.slice(-12).map((t) => ({ date: t.date, value: t.values?.[0]?.extracted_value })),
}
for (const k of Object.keys(result)) if (result[k] == null || result[k].length === 0) delete result[k]
console.log(JSON.stringify(result, null, 2))
