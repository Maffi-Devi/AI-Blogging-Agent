#!/usr/bin/env node
// Search Console API helper for anwebservice.com (no dependencies, Node 18+).
//
//   node gsc.mjs sites
//   node gsc.mjs query [--days 28] [--dims query,page] [--limit 1000]
//   node gsc.mjs inspect <url> [<url> ...]
//   node gsc.mjs inspect-sitemap [sitemapUrl]
//   node gsc.mjs sitemaps
//
// Service account: the GSC_SERVICE_ACCOUNT_JSON secret (the whole JSON file as text) in the cloud,
// or ~/.config/claude-seo/google-api.json { service_account_path, default_property } on the owner's PC.
// The service account must be a user of the property in Search Console
// (Settings > Users and permissions).

import { existsSync, readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

const localCfg = join(homedir(), '.config', 'claude-seo', 'google-api.json')
let sa
let PROPERTY = process.env.GSC_PROPERTY || 'sc-domain:anwebservice.com'
if (process.env.GSC_SERVICE_ACCOUNT_JSON) {
  sa = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_JSON)
} else if (existsSync(localCfg)) {
  const cfg = JSON.parse(readFileSync(localCfg, 'utf8').replace(/^﻿/, ''))
  sa = JSON.parse(readFileSync(cfg.service_account_path, 'utf8'))
  PROPERTY = cfg.default_property
} else {
  console.log(JSON.stringify({ searchConsole: 'not available', reason: 'GSC_SERVICE_ACCOUNT_JSON is not set', next: 'Skip the Search Console step and say so in the review.' }))
  process.exit(0)
}
const API = 'https://searchconsole.googleapis.com'

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

async function accessToken() {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Token error ${res.status}: ${JSON.stringify(json)}`)
  return json.access_token
}

let token
async function call(path, body) {
  token ??= await accessToken()
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${res.status} ${path}: ${json.error?.message ?? JSON.stringify(json)}`)
  return json
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)
const site = encodeURIComponent(PROPERTY)

// Each inspection takes ~7s, so run 5 at a time (quota: 600/min, 2,000/day per site).
async function inspect(urls) {
  token ??= await accessToken()
  const out = new Array(urls.length)
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const i = next++
      const url = urls[i]
      try {
        const r = (await call('/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: PROPERTY })).inspectionResult?.indexStatusResult ?? {}
        out[i] = { url, verdict: r.verdict, coverage: r.coverageState, lastCrawl: r.lastCrawlTime ?? null, fetch: r.pageFetchState, robots: r.robotsTxtState, googleCanonical: r.googleCanonical ?? null, userCanonical: r.userCanonical ?? null, referringUrls: r.referringUrls ?? [] }
      } catch (e) {
        out[i] = { url, error: e.message }
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker))
  return out
}

const [cmd, ...rest] = process.argv.slice(2)
let result
if (cmd === 'sites') {
  result = await call('/webmasters/v3/sites')
} else if (cmd === 'sitemaps') {
  result = await call(`/webmasters/v3/sites/${site}/sitemaps`)
} else if (cmd === 'query') {
  const days = Number(arg('days', 28))
  result = await call(`/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    startDate: arg('start', day(days + 2)),
    endDate: arg('end', day(2)),
    dimensions: arg('dims', 'query,page').split(',').filter(Boolean),
    rowLimit: Number(arg('limit', 1000)),
    type: 'web',
  })
} else if (cmd === 'inspect') {
  result = await inspect(rest.filter((a) => a.startsWith('http')))
} else if (cmd === 'inspect-sitemap') {
  const xml = await (await fetch(rest[0] ?? 'https://www.anwebservice.com/sitemap.xml')).text()
  result = await inspect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]))
} else {
  console.error('Usage: node gsc.mjs sites | sitemaps | query [--days N --dims query,page --limit N] | inspect <url...> | inspect-sitemap [sitemapUrl]')
  process.exit(1)
}
console.log(JSON.stringify(result, null, 2))
