// Blogger API v3 with an OAuth refresh token (no dependencies).
// Needs BLOGGER_CLIENT_ID, BLOGGER_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN, BLOGGER_BLOG_ID.

const API = 'https://www.googleapis.com/blogger/v3'

export const BLOGGER_KEYS = ['BLOGGER_CLIENT_ID', 'BLOGGER_CLIENT_SECRET', 'BLOGGER_REFRESH_TOKEN', 'BLOGGER_BLOG_ID']

export async function accessToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.BLOGGER_CLIENT_ID,
      client_secret: env.BLOGGER_CLIENT_SECRET,
      refresh_token: env.BLOGGER_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      `Google refused the Blogger refresh token (${res.status} ${json.error ?? ''}: ${json.error_description ?? ''}). ` +
        'Run "node scripts/blogger-auth.mjs" again and update the BLOGGER_REFRESH_TOKEN secret.'
    )
  }
  return json.access_token
}

export function client(env, token) {
  const blog = `${API}/blogs/${env.BLOGGER_BLOG_ID}`
  async function call(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Blogger ${method} ${url.replace(API, '')} → ${res.status}: ${json.error?.message ?? JSON.stringify(json)}`)
    return json
  }
  return {
    blog: () => call('GET', blog),
    listPosts: () => call('GET', `${blog}/posts?fetchBodies=false&maxResults=100&status=live&status=scheduled&status=draft`),
    insertDraft: (post) => call('POST', `${blog}/posts?isDraft=true`, { kind: 'blogger#post', ...post }),
    // publishDate (RFC 3339) in the future = Blogger's own scheduler. Without it: live now.
    publish: (id, publishDate) =>
      call('POST', `${blog}/posts/${id}/publish${publishDate ? `?publishDate=${encodeURIComponent(publishDate)}` : ''}`),
    patch: (id, fields) => call('PATCH', `${blog}/posts/${id}`, fields),
    get: (id) => call('GET', `${blog}/posts/${id}?view=ADMIN`),
  }
}
