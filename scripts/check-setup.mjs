#!/usr/bin/env node
// Shows which keys are in place and whether Blogger answers. Prints names only, never values.
//
//   node scripts/check-setup.mjs

import { loadEnv, ENV_FILE } from './lib/env.mjs'
import { accessToken, client, BLOGGER_KEYS } from './lib/blogger.mjs'

const env = loadEnv()
const groups = {
  'Blogger (required)': BLOGGER_KEYS,
  'Writer (required, one of the two)': ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  'Research and images (free, optional: each has a fallback)': ['SERPAPI_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'PEXELS_API_KEY'],
  'Cover hosting (optional, recommended)': ['ASSETS_REPO', 'ASSETS_TOKEN'],
}
console.log(`Key file: ${ENV_FILE}\n`)
for (const [title, keys] of Object.entries(groups)) {
  console.log(title)
  for (const k of keys) console.log(`  ${env[k] ? '[set]    ' : '[missing]'} ${k}`)
}

if (BLOGGER_KEYS.every((k) => env[k])) {
  try {
    const api = client(env, await accessToken(env))
    const blog = await api.blog()
    console.log(`\nBlogger OK: "${blog.name}" ${blog.url} (${blog.posts?.totalItems ?? 0} posts)`)
  } catch (e) {
    console.log(`\nBlogger NOT working: ${e.message}`)
    process.exitCode = 1
  }
} else {
  console.log('\nBlogger not tested: keys missing.')
}
