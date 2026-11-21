#!/usr/bin/env node
// The self-check of the brief (sections 1, 2, 5.1, 6, 7, 11) as code.
// A post with errors is never published; the day is skipped instead.
//
//   node scripts/validate.mjs [out/post.json]

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, OUT, readJson, readPosts, siteUrl } from './lib/state.mjs'

export const PLACES = [
  'Haryana', 'Ambala', 'Bhiwani', 'Charkhi Dadri', 'Faridabad', 'Fatehabad', 'Gurugram', 'Hisar', 'Jhajjar', 'Jind',
  'Kaithal', 'Karnal', 'Kurukshetra', 'Mahendragarh', 'Nuh', 'Palwal', 'Panchkula', 'Panipat', 'Rewari', 'Rohtak',
  'Sirsa', 'Sonipat', 'Yamunanagar', 'Hansi', 'Bahadurgarh', 'Bawal', 'Murthal', 'Kundli', 'Rai', 'Narnaul',
  'Thanesar', 'Pehowa', 'Tohana', 'Narwana', 'Gohana', 'Samalkha', 'Jagadhri', 'Dharuhera', 'Manesar', 'Pinjore', 'Kalka',
]
const LABELS = ['Haryana', 'Website', 'Local SEO', 'Google Maps', 'E-commerce', 'AI', 'WhatsApp', 'Online Safety', 'News', 'Tips']

// Keywords that belong to the main site (brief section 1). Never the main query, title or permalink.
const RESERVED = [
  /\b(website|web)\s+(development|design|designing)\s+(company|agency|services?)\b/i,
  /\bseo\s+(company|agency|services?)\s+(in\s+)?[a-z]/i,
  /\b(local seo services|ai chatbot development company)\b/i,
  /\bwebsite\s+(developers?|designers?)\s+in\b/i,
]
const EXACT_HARYANA = 'website development company in haryana'

const decode = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'")
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const has = (haystack, place) => new RegExp(`\\b${place}\\b`, 'i').test(haystack)
const isSite = (url) => /^https?:\/\/(www\.)?anwebservice\.com(\/|$)/i.test(url)

export function anchors(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ url: m[1], anchor: text(m[2]) }))
}

export function validate(post, { posts = [], planRow = null, coverRequired = true } = {}) {
  const errors = []
  const warnings = []
  const need = (ok, msg) => ok || errors.push(msg)
  const html = post.html ?? ''
  const body = text(html.replace('{{COVER}}', ' '))
  const everything = `${post.title} ${post.description} ${body}`

  // --- Title, description, permalink (section 6)
  need(post.title && post.title.length <= 60, `Title must be under 60 characters (now ${post.title?.length ?? 0}).`)
  need(post.description && post.description.length >= 140 && post.description.length <= 160, `Search description must be 140 to 160 characters (now ${post.description?.length ?? 0}).`)
  need(/^[a-z0-9]+(-[a-z0-9]+){1,8}$/.test(post.slug ?? ''), 'Permalink (slug) must be 2 to 9 lower-case English words joined by hyphens.')
  need(!posts.some((p) => p.title?.toLowerCase() === post.title?.toLowerCase()), 'This title was already published on this blog.')
  need(!posts.some((p) => p.mainQuery?.toLowerCase() === post.mainQuery?.toLowerCase()), 'This main query was already used on this blog.')

  // --- Length and structure (section 6)
  const words = body.split(' ').filter(Boolean).length
  need(words >= 800 && words <= 1200, `Post must be 800 to 1,200 words (now ${words}).`)
  const h2 = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => text(m[1]))
  need(h2.length >= 3, 'Use at least 3 H2 sections.')
  need(!/<h1\b/i.test(html), 'No H1 in the body: Blogger makes the title the H1.')
  need(/<(ul|ol|table)\b/i.test(html), 'Add one usable block: a checklist, steps or a comparison table.')
  need(h2.some((h) => /faq|question/i.test(h)), 'Add an H2 for the 2 or 3 FAQs.')
  need(post.service && post.service.length >= 3, 'Name the A&N Web Services service this post leads to in "service".')
  need(h2.some((h) => /A&N Web Services/.test(h)), 'Add one H2 section, with "A&N Web Services" in its heading, that says which of our services solves this problem.')
  need(/free consultation/i.test(body.slice(-600)), 'The closing must say that a free consultation is available.')
  need((html.match(/\{\{COVER\}\}/g) ?? []).length === 1, 'Put {{COVER}} exactly once, near the top of the HTML.')
  need(!/<(img|script|style|iframe)\b/i.test(html), 'No <img>, <script>, <style> or <iframe> in the HTML: the cover goes in through {{COVER}}.')
  const first = text(html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[0] ?? '')
  need(first.length > 0, 'The post must start with a paragraph.')

  // --- Haryana focus (section 5.1)
  const places = PLACES.filter((p) => has(post.mainQuery ?? '', p))
  need(places.length > 0, 'The main query must contain "Haryana" or a Haryana district or town.')
  const anywhere = (s) => places.some((p) => has(s, p))
  if (places.length) {
    need(anywhere(post.title ?? ''), `The title must name ${places.join(' / ')}.`)
    need(anywhere(first), `The first paragraph must name ${places.join(' / ')}.`)
    need(h2.some(anywhere), `One H2 must name ${places.join(' / ')}.`)
    need(anywhere(post.description ?? ''), `The search description must name ${places.join(' / ')}.`)
    need(anywhere((post.slug ?? '').replace(/-/g, ' ')), `The permalink must name ${places.join(' / ')}.`)
  }
  need((post.description?.match(/\bHaryana\b/gi) ?? []).length <= 1, 'The search description may contain "Haryana" only once.')
  for (const [name, value] of [['title', post.title], ['main query', post.mainQuery], ['permalink', (post.slug ?? '').replace(/-/g, ' ')]]) {
    need(!RESERVED.some((r) => r.test(value ?? '')), `The ${name} uses a keyword that belongs to the main site (brief section 1): "${value}".`)
  }

  // --- Labels (section 5.1)
  const labels = post.labels ?? []
  need(labels.includes('Haryana'), 'Labels must include "Haryana".')
  need(labels.length >= 2 && labels.length <= 4, 'Use "Haryana" plus 1 to 3 other labels.')
  need(labels.every((l) => LABELS.includes(l)), `Labels may only be: ${LABELS.join(', ')}.`)

  // --- Links (section 7)
  const found = anchors(html)
  const internal = found.filter((a) => isSite(a.url)).map((a) => ({ ...a, url: siteUrl(a.url) }))
  const outside = found.filter((a) => !isSite(a.url) && !/pexels\.com/i.test(a.url))
  const pages = new Set(internal.map((a) => a.url))
  need(internal.length >= 3 && internal.length <= 4, `A post needs 3 or 4 links to anwebservice.com (now ${internal.length}).`)
  need(pages.size === internal.length, 'The same anwebservice.com page is linked twice.')

  // Placement (section 7.1): the reader meets our links in the top and middle of the post, not only at the bottom.
  const flow = html.replace('{{COVER}}', ' ')
  const at = (i) => text(flow.slice(0, i)).length / Math.max(body.length, 1)
  const ownSection = flow.search(/<h2\b[^>]*>(?:(?!<\/h2>)[\s\S])*?A&(?:amp;)?N Web Services/i)
  const placed = [...flow.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"/gi)].filter((m) => isSite(m[1])).map((m) => m.index)
  need(placed.some((i) => at(i) <= 0.4), 'Put one anwebservice.com link near the top: after the first paragraph, within the first 40% of the post.')
  if (ownSection !== -1) {
    need(placed.filter((i) => i > ownSection).length <= 2,
      'At most 2 anwebservice.com links from the "A&N Web Services" section to the end. Move the others up into the top and middle sections.')
  }
  need(outside.length >= 1 && outside.length <= 2, `A post needs 1 or 2 links to an authoritative outside source (now ${outside.length}).`)
  need(found.every((a) => /^https:\/\//.test(a.url)), 'Every link must be a full https:// address.')
  need(!/<a\b/i.test(html.match(/<p\b[^>]*>[\s\S]*?<\/p>/i)?.[0] ?? ''), 'No link in the first paragraph.')
  need(!/<h[1-6]\b[^>]*>(?:(?!<\/h[1-6]>)[\s\S])*<a\b/i.test(html), 'No link inside a heading.')
  need(!/rel\s*=\s*"[^"]*nofollow/i.test(html), 'Use normal links (no nofollow on our own pages).')

  const declared = (post.links ?? []).map((l) => ({ ...l, url: siteUrl(l.url) }))
  const linkA = declared.find((l) => l.role === 'A')
  need(Boolean(linkA), 'links[] must contain the link A entry (role "A").')
  need(declared.length === internal.length && declared.every((l) => internal.some((a) => a.url === l.url && a.anchor === l.anchor)),
    'links[] must list exactly the anwebservice.com links that are in the HTML, with the same anchor text.')
  if (planRow && linkA) need(linkA.url === siteUrl(planRow.linkA), `Link A must be today's target page: ${siteUrl(planRow.linkA)}.`)

  const keywordAnchors = internal.filter((a) => RESERVED.some((r) => r.test(a.anchor)))
  need(keywordAnchors.length <= 1, `At most one keyword anchor per post (now: ${keywordAnchors.map((a) => `"${a.anchor}"`).join(', ')}).`)
  if (internal.some((a) => a.anchor.toLowerCase() === EXACT_HARYANA)) {
    const last = posts.findLastIndex((p) => (p.links ?? []).some((l) => l.anchor?.toLowerCase() === EXACT_HARYANA))
    need(last === -1 || posts.length - last >= 10, 'The exact anchor "website development company in Haryana" is allowed once in every 10 posts.')
  }
  for (const a of internal) {
    const previous = posts.findLast((p) => (p.links ?? []).some((l) => l.url === a.url))?.links.find((l) => l.url === a.url)
    need(!previous || previous.anchor.toLowerCase() !== a.anchor.toLowerCase(), `"${a.anchor}" was the anchor for ${a.url} last time. Use different words.`)
  }

  // --- Company facts (section 2)
  need(!/A\s?&\s?N\s?WebServices|\bAN Web Services\b|A and N Web Services|A & N Web Services/i.test(everything), 'Wrong company name. Write exactly "A&N Web Services".')
  need(!/&amp;amp;/.test(html), 'Double-encoded "&amp;amp;" in the HTML.')
  need(!/anwebservices\.com/i.test(html + post.description), 'Wrong domain: the website is anwebservice.com (no "s").')
  need(!/our team of developers|our staff|our employees|#1 guaranteed|guaranteed? (#1|first page|top rank)/i.test(everything), 'Remove the team-size or ranking-guarantee wording (brief section 2).')
  if (/(₹|\bRs\.?\s?\d|\bINR\b)/.test(everything)) warnings.push('A price is mentioned. Never give prices for A&N Web Services services; a third-party price needs its source linked.')

  // --- Image (section 4.2)
  const image = post.image ?? {}
  need(image.alt && image.alt.length >= 30 && image.alt.length <= 200, 'image.alt must be one plain sentence (30 to 200 characters).')
  need(['cloudflare-flux', 'pexels', 'brand-card'].includes(image.source), 'image.source must be cloudflare-flux, pexels or brand-card.')
  if (image.source === 'pexels') {
    need(image.pexelsId && image.photographer && image.pexelsPage, 'A Pexels cover needs image.pexelsId, image.photographer and image.pexelsPage.')
    need(!posts.some((p) => String(p.image?.pexelsId) === String(image.pexelsId)), 'This Pexels photo was already used.')
  }
  if (coverRequired) need(existsSync(join(OUT, 'cover.jpg')), 'out/cover.jpg is missing. Run scripts/make-cover.mjs.')

  need((post.sources ?? []).length >= 2, 'List at least 2 sources you opened and read in sources[].')
  return { errors, warnings, words }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const file = resolve(process.argv[2] ?? join(OUT, 'post.json'))
  if (!existsSync(file)) {
    console.error(`No post file at ${file}`)
    process.exit(1)
  }
  const posts = readPosts()
  const planRow = readJson(join(ROOT, 'data', 'plan-30.json'), []).find((r) => r.day === posts.length + 1) ?? null
  const { errors, warnings, words } = validate(readJson(file), { posts, planRow })
  console.log(JSON.stringify({ ok: errors.length === 0, words, errors, warnings }, null, 2))
  process.exit(errors.length ? 1 : 0)
}
