#!/usr/bin/env node
// * Bundles supabase/functions/_shared/emails/templates/*.html into a single
// * TypeScript module (templates.ts) imported at edge-function runtime. Run
// * this after editing any .html file under that directory.
// *
// *   yarn bundle:emails
// *
// * Output is sorted by filename for deterministic diffs.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const dir = path.join(root, 'supabase/functions/_shared/emails/templates')
const out = path.join(root, 'supabase/functions/_shared/emails/templates.ts')

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort()

const entries = files.map((f) => {
  const name = f.replace(/\.html$/, '')
  const content = fs.readFileSync(path.join(dir, f), 'utf8')
  return `  ${JSON.stringify(name)}: ${JSON.stringify(content)},`
})

const body = `// * Auto-bundled email templates. Edit templates/*.html and run \`yarn bundle:emails\`.

export const TEMPLATES: Record<string, string> = {
${entries.join('\n')}
}
`

fs.writeFileSync(out, body)
console.log(`bundled ${files.length} templates -> ${path.relative(root, out)}`)
