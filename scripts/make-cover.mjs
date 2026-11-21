// Blog cover maker for the A&N Web Services Blogger blog.
// Picture: free AI model (Cloudflare Workers AI, FLUX schnell) or a local file (--bg), or a plain brand card.
// Text: drawn by this script, never by the AI model, so it is always spelled exactly as given.
//
// node make-cover.mjs --title "Post title" --out "C:/path/cover.jpg"
//      [--eyebrow "HARYANA BUSINESS GUIDE"] [--prompt "scene for the AI picture"] [--bg "C:/path/photo.jpg"]
//
// Layout: the title on a navy panel on the left, the whole picture on the right. The AI model returns a
// square picture, so it gets a near-square panel and nothing important is cropped away.
// Keys (optional): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (GitHub Secrets, or blogger.env on the owner's PC)

import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";
import { loadEnv } from "./lib/env.mjs";

const W = 1200;
const H = 630;
const PIC_W = 570; // picture panel on the right
const PIC_X = W - PIC_W;
const LEFT = 64; // left margin of the text column
const BRAND = "A&N Web Services";
const SITE = "anwebservice.com";
const NAVY = "#0B1B3A";
const STYLE =
  "Polished 3D isometric illustration, soft studio lighting, smooth clean shapes, vivid warm colours with red and " +
  "white accents, one clear subject centred with space around it, plain deep navy blue background. ";
const NEGATIVE =
  " No text, no letters, no numbers, no logos, no brand names, no watermark, no signboards, no people, no faces. " +
  "Any phone or computer screen shows only simple blank coloured tiles.";

// The fonts are files in the repo and the letters are drawn as shapes, so the cover looks the same
// on Windows and on the GitHub runner.
const fontDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");
const font = (name) => {
  const b = readFileSync(join(fontDir, name));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const BOLD = font("Poppins-Bold.ttf");
const SEMI = font("Poppins-SemiBold.ttf");
const MEDIUM = font("Poppins-Medium.ttf");

function args() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("--")) out[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : "true";
  }
  return out;
}

const text = (f, str, x, y, size, fill, letterSpacing = 0) =>
  `<path d="${f.getPath(str, x, y, size, { letterSpacing }).toPathData(1)}" fill="${fill}"/>`;

function wrap(str, size, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of str.trim().split(/\s+/)) {
    const next = line ? line + " " + word : word;
    if (line && BOLD.getAdvanceWidth(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Largest size at which the title fits the text column in at most 4 lines (5 at the smallest size).
function layout(title, maxWidth) {
  for (const size of [64, 58, 52, 46, 42, 38, 34]) {
    const lines = wrap(title, size, maxWidth);
    const fits = lines.every((l) => BOLD.getAdvanceWidth(l, size) <= maxWidth);
    if (fits && lines.length <= (size === 34 ? 5 : 4)) return { size, lines };
  }
  throw new Error("Title is too long for the cover (keep it under 60 characters).");
}

async function aiBackground(prompt, e) {
  if (!prompt) return null;
  if (!e.CLOUDFLARE_ACCOUNT_ID || !e.CLOUDFLARE_API_TOKEN) {
    console.error("[cover] no Cloudflare keys: skipping the AI picture");
    return null;
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${e.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${e.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: STYLE + prompt + NEGATIVE, steps: 8 }),
      signal: AbortSignal.timeout(90_000),
    });
    const json = await res.json().catch(() => null);
    const b64 = json?.result?.image;
    if (!res.ok || !b64) {
      console.error(`[cover] AI picture failed: status=${res.status} ${JSON.stringify(json?.errors ?? "").slice(0, 200)}`);
      return null;
    }
    return Buffer.from(b64, "base64");
  } catch (err) {
    console.error(`[cover] AI picture failed: ${err.message}`);
    return null;
  }
}

function overlay(title, eyebrow, hasPicture) {
  const maxWidth = (hasPicture ? PIC_X : 980) - LEFT - 36;
  const { size, lines } = layout(title, maxWidth);
  const lineH = Math.round(size * 1.2);
  const blockH = lines.length * lineH;
  // The eyebrow + title block sits a little above the middle; the brand stays at the bottom.
  const top = Math.round((H - 70 - blockH) / 2) + size + 12;
  const titlePaths = lines.map((l, i) => text(BOLD, l, LEFT, top + i * lineH, size, "#FFFFFF")).join("");
  // With a picture: a navy text panel that fades into the picture. Without: the full brand card.
  const panel = hasPicture
    ? `<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
         <stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY}" stop-opacity="0"/>
       </linearGradient></defs>
       <rect width="${PIC_X + 2}" height="${H}" fill="${NAVY}"/>
       <rect x="${PIC_X}" width="130" height="${H}" fill="url(#g)"/>`
    : `<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
         <stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="#16306B"/>
       </linearGradient></defs>
       <rect width="${W}" height="${H}" fill="url(#g)"/>
       <circle cx="1040" cy="150" r="230" fill="#FFFFFF" fill-opacity="0.05"/>
       <circle cx="1120" cy="520" r="150" fill="#D41717" fill-opacity="0.22"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${panel}
    <rect x="${LEFT}" y="${top - size - 58}" width="56" height="6" rx="3" fill="#E5322D"/>
    ${text(SEMI, eyebrow.toUpperCase(), LEFT, top - size - 16, 20, "#FF7A70", 0.14)}
    ${titlePaths}
    ${text(BOLD, BRAND, LEFT, H - 60, 25, "#FFFFFF")}
    ${text(MEDIUM, SITE, LEFT, H - 32, 18, "#C9D4EA")}
  </svg>`);
}

const a = args();
if (!a.title || !a.out) {
  console.error('Usage: node make-cover.mjs --title "..." --out "cover.jpg" [--eyebrow "..."] [--prompt "..."] [--bg "photo.jpg"]');
  process.exit(1);
}

let picture = null;
let source = "brand-card";
if (a.bg) {
  picture = readFileSync(a.bg);
  source = "file";
} else {
  picture = await aiBackground(a.prompt, loadEnv());
  if (picture) source = "cloudflare-flux";
}
mkdirSync(dirname(a.out), { recursive: true });

const layers = [];
if (picture) {
  // A photo (--bg) is cropped around its subject; the square AI picture keeps its centre.
  const pic = await sharp(picture).resize(PIC_W, H, { fit: "cover", position: a.bg ? "attention" : "centre" }).toBuffer();
  layers.push({ input: pic, left: PIC_X, top: 0 });
}
layers.push({ input: overlay(a.title, a.eyebrow || "Haryana Business Guide", Boolean(picture)) });

const info = await sharp({ create: { width: W, height: H, channels: 3, background: NAVY } })
  .composite(layers)
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(a.out);

console.log(JSON.stringify({ out: a.out, source, width: info.width, height: info.height, kb: Math.round(info.size / 1024) }));
