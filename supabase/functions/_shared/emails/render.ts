// * Email template loader + renderer.
// *
// * Templates live in ./templates/<name>.html. Each file starts with a
// * `<!--SUBJECT: ...-->` line containing the email subject (placeholders allowed),
// * followed by the HTML body. Both fields support `{{var}}` substitution.
// *
// * The actual template content is bundled at deploy time into
// * ./templates.ts (generated from the .html files) — that way the Edge
// * Runtime never needs filesystem access for rendering.

import { TEMPLATES } from './templates.ts'

const SUBJECT_RE = /^\s*<!--\s*SUBJECT:\s*([^]*?)\s*-->\s*\n/i

export type TemplateData = Record<string, string | number | null | undefined>

function substitute(input: string, data: TemplateData): string {
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = data[key]
    return v === null || v === undefined ? '' : String(v)
  })
}

const cache = new Map<string, { rawSubject: string; rawBody: string }>()

function loadRaw(name: string): { rawSubject: string; rawBody: string } {
  const hit = cache.get(name)
  if (hit) return hit

  const raw = TEMPLATES[name]
  if (!raw) {
    throw new Error(`Template "${name}" not found in bundled map`)
  }
  const m = raw.match(SUBJECT_RE)
  if (!m) {
    throw new Error(`Template "${name}" is missing the leading <!--SUBJECT: ...--> directive`)
  }
  const rawSubject = m[1].trim()
  const rawBody = raw.slice(m[0].length)
  const out = { rawSubject, rawBody }
  cache.set(name, out)
  return out
}

export async function renderTemplate(
  name: string,
  data: TemplateData,
): Promise<{ subject: string; html: string }> {
  const { rawSubject, rawBody } = loadRaw(name)
  return {
    subject: substitute(rawSubject, data),
    html: substitute(rawBody, data),
  }
}
