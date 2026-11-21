#!/usr/bin/env node
// Takes out/post.json + out/cover.jpg, runs the self-check, and puts the post on Blogger:
// a draft for the first DRAFT_FIRST posts, otherwise scheduled for 10:00 AM IST today
// (or live at once when the run started after 10:00). Then writes state/posts.json and the log.
//
//   node scripts/publish.mjs [--dry-run]

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnv } from './lib/env.mjs'
import { accessToken, client, BLOGGER_KEYS } from './lib/blogger.mjs'
import { ROOT, OUT, PUBLISH_HOUR, appendLog, istNow, readJson, readPosts, siteUrl, writePosts } from './lib/state.mjs'
import { validate } from './validate.mjs'

const dryRun = process.argv.includes('--dry-run')
const env = loadEnv()
const now = istNow()
const posts = readPosts()
const day = posts.length + 1
const draftFirst = Number(env.DRAFT_FIRST ?? 3)

function skip(reason, details = []) {
  console.error(`SKIPPED: ${reason}`)
  for (const d of details) console.error(` - ${d}`)
  if (!dryRun) appendLog(`\n## ${now.date} — no post (skipped)\n\n- Reason: ${reason}\n${details.map((d) => `- ${d}`).join('\n')}\n`)
  process.exit(1)
}

if (posts.some((p) => p.date === now.date)) {
  console.log(`Today (${now.date}) already has a post. Nothing to do.`)
  process.exit(0)
}

const postFile = join(OUT, 'post.json')
if (!existsSync(postFile)) skip('the writer did not produce out/post.json')
const post = readJson(postFile)
const planRow = readJson(join(ROOT, 'data', 'plan-30.json'), []).find((r) => r.day === day) ?? null
const { errors, warnings, words } = validate(post, { posts, planRow })
if (errors.length) skip('the post failed the self-check', errors)

// The editor's review (agent/review.md): accuracy and Google's content rules. No pass, no post.
const review = readJson(join(OUT, 'review.json'), null)
if (env.REVIEW_REQUIRED !== '0') {
  if (!review) skip('the editor did not write out/review.json')
  if (review.verdict !== 'pass') skip('the editor rejected the post', review.reasons ?? [review.summary ?? 'no reason given'])
}

const missing = BLOGGER_KEYS.filter((k) => !env[k])
if (missing.length && !dryRun) skip(`Blogger keys are missing: ${missing.join(', ')}`)

// --- Cover: a public image address (ASSETS_REPO), or the picture embedded in the post.
const cover = readFileSync(join(OUT, 'cover.jpg'))
// With a deploy key (write access to the images repo only): clone, add the file, push.
function pushCover(path) {
  const dir = mkdtempSync(join(tmpdir(), 'covers-'))
  const key = join(dir, 'key')
  writeFileSync(key, env.ASSETS_DEPLOY_KEY.replace(/\r/g, '').trimEnd() + '\n', { mode: 0o600 })
  const repo = join(dir, 'repo')
  const git = (args, cwd) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_SSH_COMMAND: `ssh -i "${key.replace(/\\/g, '/')}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new` },
      timeout: 120_000,
    }).trim()
  try {
    git(['clone', '--depth', '1', `git@github.com:${env.ASSETS_REPO}.git`, repo])
    mkdirSync(join(repo, 'covers'), { recursive: true })
    writeFileSync(join(repo, path), cover)
    git(['add', path], repo)
    git(['-c', 'user.name=A&N Blogger Agent', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `Cover: ${post.title}`], repo)
    git(['push', 'origin', 'HEAD'], repo)
    return git(['rev-parse', 'HEAD'], repo)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function coverUrl() {
  const embedded = { url: `data:image/jpeg;base64,${cover.toString('base64')}`, host: 'embedded' }
  const path = `covers/${now.date}-${post.slug}.jpg`
  if (env.ASSETS_REPO && env.ASSETS_DEPLOY_KEY) {
    try {
      return { url: `https://cdn.jsdelivr.net/gh/${env.ASSETS_REPO}@${pushCover(path)}/${path}`, host: 'github' }
    } catch (e) {
      console.error(`[cover] push to ${env.ASSETS_REPO} failed (${String(e.stderr || e.message).slice(0, 300)}); embedding the picture instead`)
      return embedded
    }
  }
  if (!env.ASSETS_REPO || !env.ASSETS_TOKEN) return embedded
  const res = await fetch(`https://api.github.com/repos/${env.ASSETS_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${env.ASSETS_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'an-blogger-agent' },
    body: JSON.stringify({ message: `Cover: ${post.title}`, content: cover.toString('base64') }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`[cover] upload to ${env.ASSETS_REPO} failed (${res.status} ${json.message ?? ''}); embedding the picture instead`)
    return embedded
  }
  return { url: `https://cdn.jsdelivr.net/gh/${env.ASSETS_REPO}@${json.commit.sha}/${path}`, host: 'github' }
}

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const image = post.image
const { url: imgUrl, host: imgHost } = dryRun ? { url: 'https://example.invalid/cover.jpg', host: 'dry-run' } : await coverUrl()
const credit =
  image.source === 'pexels'
    ? `<p style="font-size:13px;color:#666;text-align:center">Photo: <a href="${attr(image.pexelsPage)}">${attr(image.photographer)} / Pexels</a></p>`
    : ''
const coverHtml =
  `<div class="separator" style="clear:both;text-align:center"><img src="${imgUrl}" alt="${attr(image.alt)}" title="${attr(post.title)}" ` +
  `width="1200" height="630" style="max-width:100%;height:auto" /></div>${credit}`
// A bare "&" in the company name is encoded once, so Blogger never shows "&amp;".
const content = post.html.replace(/A&N(?!amp;)/g, 'A&amp;N').replace(/&amp;amp;/g, '&amp;').replace('{{COVER}}', coverHtml)

const mode = day <= draftFirst ? 'draft' : now.hour >= PUBLISH_HOUR ? 'now' : 'scheduled'
const publishDate = `${now.date}T${String(PUBLISH_HOUR).padStart(2, '0')}:00:00+05:30`

if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, day, date: now.date, mode, words, warnings, title: post.title, slug: post.slug, contentBytes: content.length }, null, 2))
  process.exit(0)
}

// --- Blogger. The permalink is taken from the title at the moment a post is published or scheduled,
// so the post goes in with the slug words as its title and gets the real title right after.
const api = client(env, await accessToken(env))
const existing = (await api.listPosts()).items ?? []
if (existing.some((p) => p.title?.toLowerCase() === post.title.toLowerCase())) skip(`a post titled "${post.title}" is already on the blog`)

let result
let permalink = 'custom'
if (mode === 'draft') {
  result = await api.insertDraft({ title: post.title, content, labels: post.labels })
  permalink = 'set by Blogger when the owner publishes the draft'
} else {
  const draft = await api.insertDraft({ title: post.slug.replace(/-/g, ' '), content, labels: post.labels })
  result = await api.publish(draft.id, mode === 'scheduled' ? publishDate : undefined)
  if (!result.url?.includes(post.slug)) permalink = `automatic (${result.url ?? 'not assigned yet'})`
  result = { ...result, ...(await api.patch(draft.id, { title: post.title })) }
}

const entry = {
  day,
  date: now.date,
  time: mode === 'scheduled' ? '10:00' : now.time,
  status: mode === 'draft' ? 'draft' : mode === 'scheduled' ? 'scheduled' : 'live',
  postId: result.id,
  url: result.url ?? null,
  title: post.title,
  slug: post.slug,
  description: post.description,
  mainQuery: post.mainQuery,
  district: post.district ?? null,
  labels: post.labels,
  linkA: siteUrl(post.links.find((l) => l.role === 'A').url),
  links: post.links.map((l) => ({ role: l.role, url: siteUrl(l.url), anchor: l.anchor })),
  sources: post.sources,
  image: { source: image.source, prompt: image.prompt ?? null, pexelsId: image.pexelsId ?? null, host: imgHost },
  serpapiUsed: post.serpapiUsed ?? 0,
  words,
}
writePosts([...posts, entry])

const where =
  mode === 'draft'
    ? `Draft, waiting for the owner: https://www.blogger.com/blog/post/edit/${env.BLOGGER_BLOG_ID}/${result.id}`
    : `${entry.status === 'live' ? 'Live' : 'Scheduled for 10:00 AM IST'}: ${entry.url ?? '(address appears when it goes live)'}`
appendLog(`
## Day ${day} — ${now.date} ${entry.time} IST — ${post.title}

- ${where}
- Main query: ${post.mainQuery} (${post.district ?? 'Haryana'}) · ${words} words · labels: ${post.labels.join(', ')}
${entry.links.map((l) => `- Link ${l.role}: ${l.url} — anchor "${l.anchor}"`).join('\n')}
- Outside sources: ${post.sources.map((s) => s.url).join(' , ')}
- Image: ${image.source}${image.prompt ? ` — "${image.prompt}"` : ''}${image.pexelsId ? ` — Pexels photo ${image.pexelsId}` : ''} (hosting: ${imgHost})
- SerpApi searches: ${post.serpapiUsed ? post.serpapiUsed : 'SerpApi not used'}
- Editor's review: ${review ? `${review.verdict} — ${review.claimsChecked ?? '?'} statements checked, ${(review.claimsRemovedOrRewritten ?? []).length} removed or rewritten. ${review.summary ?? ''}` : 'not run'}
- Permalink: ${permalink}
- Search description (the Blogger API cannot set it; paste it in Post settings if wanted): ${post.description}
${warnings.map((w) => `- Warning: ${w}`).join('\n')}${post.notes ? `\n- Notes: ${post.notes}` : ''}
`)
console.log(JSON.stringify({ ok: true, day, status: entry.status, url: entry.url, postId: entry.postId, imageHost: imgHost, permalink }, null, 2))
