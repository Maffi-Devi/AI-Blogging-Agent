#!/usr/bin/env node
// One-time Google sign-in for the Blogger API, run on the owner's PC:
//
//   node scripts/blogger-auth.mjs
//
// Needs BLOGGER_CLIENT_ID and BLOGGER_CLIENT_SECRET in blogger.env (OAuth client of type "Desktop app").
// Opens the browser, the owner signs in as the blog owner's Google account and allows Blogger access.
// The refresh token and the blog id are written into blogger.env. They are never printed.

import { createServer } from 'node:http'
import { exec } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { ENV_FILE, readEnvFile } from './lib/env.mjs'

const PORT = 53682
const REDIRECT = `http://127.0.0.1:${PORT}/`
const env = readEnvFile()
if (!env.BLOGGER_CLIENT_ID || !env.BLOGGER_CLIENT_SECRET) {
  console.error(`Put BLOGGER_CLIENT_ID and BLOGGER_CLIENT_SECRET in ${ENV_FILE} first.`)
  process.exit(1)
}

function save(key, value) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : []
  const i = lines.findIndex((l) => l.startsWith(`${key}=`))
  if (i > -1) lines[i] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
  writeFileSync(ENV_FILE, lines.join('\n'))
}

const state = randomBytes(16).toString('hex')
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: env.BLOGGER_CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/blogger',
  access_type: 'offline',
  prompt: 'consent',
  state,
})}`

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT)
  if (url.pathname !== '/') return res.writeHead(404).end()
  const done = (msg, code = 0) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<p style="font:18px sans-serif">${msg}</p>`)
    console.log(msg.replace(/<[^>]+>/g, ''))
    server.close(() => process.exit(code))
  }
  if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) return done('Sign-in was cancelled or did not match. Run the script again.', 1)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code'),
      client_id: env.BLOGGER_CLIENT_ID,
      client_secret: env.BLOGGER_CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  })
  const token = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok || !token.refresh_token) return done(`Google did not give a refresh token (${token.error ?? tokenRes.status}). Run the script again.`, 1)
  save('BLOGGER_REFRESH_TOKEN', token.refresh_token)

  const blogsRes = await fetch('https://www.googleapis.com/blogger/v3/users/self/blogs', { headers: { authorization: `Bearer ${token.access_token}` } })
  const blogs = (await blogsRes.json().catch(() => ({}))).items ?? []
  if (blogs.length === 1) {
    save('BLOGGER_BLOG_ID', blogs[0].id)
    return done(`Done. Token saved. Blog: <b>${blogs[0].name}</b> (${blogs[0].url}). You can close this tab.`)
  }
  if (blogs.length === 0) return done('Token saved, but this Google account has no blog yet. Create the blog on blogger.com, then run this script again.', 1)
  done(`Token saved. This account has ${blogs.length} blogs: ${blogs.map((b) => `${b.name} = ${b.id}`).join(' ; ')}. Put the right id in BLOGGER_BLOG_ID yourself.`)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('Opening the browser. Sign in as the blog owner's Google account and allow access.')
  console.log(`If it does not open, paste this address in Chrome:\n${authUrl}\n`)
  const opener = process.platform === 'win32' ? `start "" "${authUrl.replace(/&/g, '^&')}"` : process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`
  exec(opener, () => {})
})
