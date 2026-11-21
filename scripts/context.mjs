#!/usr/bin/env node
// What the writer needs to know before choosing today's topic: the day number, the plan row,
// and everything already used (link A pages, anchors, image prompts, Pexels photos).
//
//   node scripts/context.mjs            prints JSON
//   node scripts/context.mjs --github   also writes needed=true|false to $GITHUB_OUTPUT

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, PUBLISH_HOUR, istNow, readJson, readPosts } from './lib/state.mjs'

const posts = readPosts()
const now = istNow()
const plan = readJson(join(ROOT, 'data', 'plan-30.json'), [])
const dayNumber = posts.length + 1
const draftFirst = Number(process.env.DRAFT_FIRST ?? 3)
const alreadyPostedToday = posts.some((p) => p.date === now.date)

const HARYANA_ANCHOR = 'website development company in haryana'
const lastExact = posts.findLastIndex((p) => (p.links ?? []).some((l) => l.anchor?.trim().toLowerCase() === HARYANA_ANCHOR))

const linkACounts = {}
for (const p of posts) if (p.linkA) linkACounts[p.linkA] = (linkACounts[p.linkA] ?? 0) + 1

const context = {
  today: now.date,
  weekday: now.weekday,
  timeIST: now.time,
  dayNumber,
  alreadyPostedToday,
  mode: dayNumber <= draftFirst ? 'draft (owner reads it first)' : now.hour >= PUBLISH_HOUR ? 'publish now (run started after 10:00)' : 'schedule for 10:00 AM IST today',
  planRow: plan.find((r) => r.day === dayNumber) ?? null,
  afterPlan: dayNumber > plan.length,
  mondayReviewDue: now.weekday === 'Monday',
  exactHaryanaAnchorAllowed: lastExact === -1 || posts.length - lastExact >= 10,
  linkACounts,
  previousPosts: posts.map((p) => ({
    day: p.day,
    date: p.date,
    title: p.title,
    mainQuery: p.mainQuery,
    district: p.district,
    links: p.links,
    imagePrompt: p.image?.prompt ?? null,
    pexelsId: p.image?.pexelsId ?? null,
  })),
}

console.log(JSON.stringify(context, null, 2))

if (process.argv.includes('--github') && process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `needed=${!alreadyPostedToday}\n`)
}
