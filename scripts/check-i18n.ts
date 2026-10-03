/**
 * i18n consistency check:
 *  1. ko.json and en.json contain exactly the same keys.
 *  2. Every i18n key referenced by built-in training content exists.
 *  3. Every literal t('...') / i18nKey="..." key used in app sources exists.
 * Run: pnpm check:i18n
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { en, ko, flattenKeys } from '@aerofms/i18n'
import { BUILTIN_LESSONS, BUILTIN_SCENARIOS, GLOSSARY, HELP_ARTICLES, LESSON_CATEGORIES } from '@aerofms/training'
import type { LocalizedText } from '@aerofms/training'

const errors: string[] = []
const enKeys = new Set(flattenKeys(en))
const koKeys = new Set(flattenKeys(ko))
for (const k of enKeys) if (!koKeys.has(k)) errors.push(`missing in ko: ${k}`)
for (const k of koKeys) if (!enKeys.has(k)) errors.push(`missing in en: ${k}`)

const has = (key: string): boolean => enKeys.has(key) || enKeys.has(`${key}_one`) || [...enKeys].some((k) => k.startsWith(`${key}.`))
const need = (key: string, where: string): void => {
  if (!has(key)) errors.push(`missing key ${key} (${where})`)
}
const needText = (t: LocalizedText | undefined, where: string): void => {
  if (t && 'key' in t) need(t.key, where)
}

for (const l of BUILTIN_LESSONS) {
  needText(l.title, l.id)
  needText(l.description, l.id)
  for (const s of l.steps) {
    needText(s.instruction, `${l.id}/${s.id}`)
    needText(s.hint, `${l.id}/${s.id}`)
  }
}
for (const c of LESSON_CATEGORIES) need(`academy.categories.${c}`, 'category')
for (const s of BUILTIN_SCENARIOS) {
  needText(s.title, s.id)
  needText(s.description, s.id)
  for (const o of s.objectives) needText(o.text, `${s.id}/${o.id}`)
  for (const h of s.hints) needText(h, `${s.id}/hint`)
}
for (const [key, g] of Object.entries(GLOSSARY)) {
  for (const f of ['title', 'short', 'detail']) need(`explain.${key}.${f}`, 'glossary')
  if (g.hasExample) need(`explain.${key}.example`, 'glossary')
  if (g.hasCaution) need(`explain.${key}.caution`, 'glossary')
  for (const r of g.related) if (!GLOSSARY[r]) errors.push(`glossary ${key}: unknown related ${r}`)
}
for (const a of HELP_ARTICLES) {
  need(`help.articles.${a}.title`, 'help')
  need(`help.articles.${a}.body`, 'help')
}

// explainKey references in aircraft page definitions
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (f === 'node_modules' || f === 'dist') continue
    if (statSync(p).isDirectory()) walk(p, out)
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p)
  }
  return out
}
for (const file of walk('packages/aircraft/src')) {
  for (const m of readFileSync(file, 'utf8').matchAll(/explainKey: '([a-zA-Z]+)'/g)) {
    const key = m[1] ?? ''
    if (!GLOSSARY[key]) errors.push(`${file}: explainKey ${key} not in GLOSSARY`)
  }
}
const appDirs = ['apps/web/src', ...(process.env.EXTRA_I18N_SRC ? process.env.EXTRA_I18N_SRC.split(',') : [])]
for (const dir of appDirs) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) need(m[1] ?? '', file)
    for (const m of src.matchAll(/i18nKey="([a-zA-Z0-9_.]+)"/g)) need(m[1] ?? '', file)
  }
}

if (errors.length) {
  console.error(`i18n check failed (${errors.length}):\n${errors.join('\n')}`)
  process.exit(1)
}
console.log(`i18n OK – ${enKeys.size} keys in ko/en, ${BUILTIN_LESSONS.length} lessons, ${BUILTIN_SCENARIOS.length} scenarios, ${Object.keys(GLOSSARY).length} glossary entries`)
