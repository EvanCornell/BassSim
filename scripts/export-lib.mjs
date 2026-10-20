// Helpers for the public export (`export-public.sh`). Private: never exported.
//
//   node scripts/export-lib.mjs strip <file>...      strip comments in place
//   node scripts/export-lib.mjs closure <entry>...   print the repo-relative
//                                                    files the entries import
//   node scripts/export-lib.mjs pkg <app|mcp> <out> <entry>...
//                                                    write a public package.json
//   node scripts/export-lib.mjs secrets <dir>        scan for credentials
//
// Stripping is checked rather than trusted: a file's tokens, comments aside,
// must be identical before and after, so removing a comment can never change
// what the code does.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Comments a bundler or licence needs, kept wherever they appear. */
const KEEP = /@vite-ignore|[#@]__PURE__|webpack[A-Z]|@license|@preserve|^!/

/** Extensions an extensionless import may resolve to, in Vite's order. */
const RESOLVE_EXT = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']

/**
 * Parse a module as the app's toolchain does: ES modules with JSX.
 *
 * @param {string} code - Source text.
 * @returns {object} The Babel AST, with `comments` and `tokens`.
 * @throws {SyntaxError} When the code does not parse.
 * @pure
 */
const parseModule = (code) => parse(code, {
  sourceType: 'module', plugins: ['jsx'], tokens: true, allowReturnOutsideFunction: true,
})

/**
 * Visit every node of an AST, depth first.
 *
 * @param {object} node - Root node.
 * @param {Function} fn - Called with each node.
 * @returns {void}
 * @sideEffect Calls `fn`.
 */
function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return
  fn(node)
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue
    const v = node[k]
    if (Array.isArray(v)) v.forEach((c) => walk(c, fn))
    else if (v && typeof v.type === 'string') walk(v, fn)
  }
}

/**
 * JSX text as React reads it: lines trimmed, blank lines dropped, joined by spaces.
 *
 * @param {string} text - Raw JSX text.
 * @returns {string} The text React renders.
 * @pure
 */
function jsxText(text) {
  if (!text.includes('\n')) return text
  const lines = text.split('\n')
  return lines
    .map((l, i) => (i === 0 ? l.replace(/\s+$/, '') : i === lines.length - 1 ? l.replace(/^\s+/, '') : l.trim()))
    .filter(Boolean)
    .join(' ')
}

/**
 * A token stream reduced to what the code means.
 *
 * Comments go, as do empty `{}` pairs — an empty JSX container is what a JSX
 * comment leaves — and JSX text is compared as React renders it, since
 * removing a comment between two runs of JSX text joins them.
 *
 * @param {object} ast - From `parseModule`.
 * @returns {string[]} One entry per token.
 * @pure
 */
function meaning(ast) {
  const toks = ast.tokens
    .filter((t) => t.type !== 'CommentLine' && t.type !== 'CommentBlock')
    .map((t) => ({ type: t.type?.label ?? t.type, value: t.value ?? '' }))
  const out = []
  for (const t of toks) {
    const last = out[out.length - 1]
    if (t.type === '}' && last?.type === '{') { out.pop(); continue }
    if (t.type === 'jsxText' && last?.type === 'jsxText') { last.value += t.value; continue }
    out.push({ ...t })
  }
  return out
    .map((t) => (t.type === 'jsxText' ? { ...t, value: jsxText(t.value) } : t))
    .filter((t) => !(t.type === 'jsxText' && t.value === ''))
    .map((t) => `${t.type}:${t.value}`)
}

/**
 * Remove ranges from a source text, dropping lines left holding nothing.
 *
 * A line whose every non-blank character falls in a removed range goes
 * entirely. Elsewhere a removed range becomes a space when it sat between two
 * characters that would otherwise join into one token. Trailing blanks are
 * trimmed and runs of blank lines fold to one, except inside the protected
 * ranges — template literals — where every character is the program's.
 *
 * @param {string} code - Source text.
 * @param {Array<[number, number]>} cut - Ranges to remove.
 * @param {Array<[number, number]>} keep - Ranges whose text must not change.
 * @returns {string} The text with the ranges removed.
 * @pure
 */
function removeRanges(code, cut, keep) {
  const masked = new Uint8Array(code.length)
  for (const [a, b] of cut) masked.fill(1, a, b)
  /**
   * Whether an offset falls strictly inside a protected range.
   *
   * @param {number} i - Offset.
   * @returns {boolean} True inside one.
   * @pure
   */
  const inKeep = (i) => keep.some(([a, b]) => i > a && i < b)
  const out = []
  let blank = 0
  let start = 0
  while (start <= code.length) {
    let end = code.indexOf('\n', start)
    if (end < 0) end = code.length
    const protectedLine = inKeep(start) || inKeep(end)
    let hit = false, rest = false, line = ''
    for (let i = start; i < end; i++) {
      if (masked[i]) {
        hit = true
        if (!masked[i - 1]) {
          let j = i
          while (j < end && masked[j]) j++
          const before = code[i - 1], after = code[j]
          if (before && after && /[\w$]/.test(before) && /[\w$]/.test(after)) line += ' '
        }
        continue
      }
      if (!/\s/.test(code[i])) rest = true
      line += code[i]
    }
    if (protectedLine) { out.push(line); blank = 0 }
    else if (!(hit && !rest)) {
      line = line.replace(/\s+$/, '')
      if (!line) { if (blank++ === 0 && out.length) out.push('') }
      else { out.push(line); blank = 0 }
    }
    if (end === code.length) break
    start = end + 1
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n') + '\n'
}

/**
 * Strip the comments from a JavaScript or JSX module.
 *
 * JSX comments go with their braces, so `{/* note *\/}` leaves nothing behind.
 *
 * @param {string} code - Source text.
 * @param {string} [name] - File name, for error messages.
 * @returns {string} The code without comments.
 * @throws {Error} When the result's tokens differ from the original's.
 * @pure
 */
export function stripJs(code, name = 'module') {
  const ast = parseModule(code)
  const cut = ast.comments.filter((c) => !KEEP.test(c.value.trim())).map((c) => [c.start, c.end])
  const keep = []
  walk(ast.program, (n) => {
    if (n.type === 'TemplateLiteral') keep.push([n.start, n.end])
    if (n.type === 'JSXExpressionContainer' && n.expression.type === 'JSXEmptyExpression') cut.push([n.start, n.end])
  })
  const out = removeRanges(code, cut, keep)
  const before = meaning(ast)
  const after = meaning(parseModule(out))
  if (before.join('\u0000') !== after.join('\u0000')) throw new Error(`${name}: stripping comments changed the code`)
  return out
}

/**
 * Strip the comments from a stylesheet, leaving strings and `url(…)` alone.
 *
 * @param {string} css - Stylesheet text.
 * @returns {string} The stylesheet without comments.
 * @pure
 */
export function stripCss(css) {
  const cut = []
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '"' || ch === "'") {
      for (i++; i < css.length && css[i] !== ch; i++) if (css[i] === '\\') i++
    } else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      const stop = end < 0 ? css.length : end + 2
      if (!KEEP.test(css.slice(i + 2, stop - 2).trim())) cut.push([i, stop])
      i = stop - 1
    }
  }
  return removeRanges(css, cut, [])
}

/**
 * Strip the comments from an HTML page.
 *
 * @param {string} html - Page text.
 * @returns {string} The page without `<!-- … -->` comments.
 * @pure
 */
export function stripHtml(html) {
  const cut = []
  for (const m of html.matchAll(/<!--[\s\S]*?-->/g)) cut.push([m.index, m.index + m[0].length])
  return removeRanges(html, cut, [])
}

/**
 * Strip one file's comments in place, choosing the stripper by extension.
 *
 * @param {string} file - Path to the file.
 * @returns {boolean} Whether the file was a kind that has comments.
 * @throws {Error} When stripping would change a module's code.
 * @sideEffect Rewrites the file.
 */
export function stripFile(file) {
  const ext = extname(file)
  const text = readFileSync(file, 'utf8')
  let out
  if (['.js', '.jsx', '.mjs'].includes(ext)) out = stripJs(text, file)
  else if (ext === '.css') out = stripCss(text)
  else if (ext === '.html') out = stripHtml(text)
  else return false
  writeFileSync(file, out)
  return true
}

/**
 * Resolve a relative import the way Vite and Node do.
 *
 * @param {string} from - The importing file.
 * @param {string} spec - The relative specifier.
 * @returns {string|null} The file, or null when nothing matches.
 * @reads The filesystem.
 */
function resolveImport(from, spec) {
  const base = resolve(dirname(from), spec.replace(/\?.*$/, ''))
  for (const ext of RESOLVE_EXT) {
    const p = base + ext
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

/**
 * Every repo file the entry modules reach through imports, workers and `new URL`.
 *
 * @param {string[]} entries - Entry modules, repo-relative.
 * @returns {{files: string[], packages: string[], missing: string[]}} Repo-relative files, the bare packages they import, and imports that resolve to nothing.
 * @reads The filesystem.
 */
export function closure(entries) {
  const seen = new Set()
  const packages = new Set()
  const missing = []
  /**
   * Add a file and everything it imports.
   *
   * @param {string} file - Absolute path.
   * @returns {void}
   * @mutates The enclosing sets.
   */
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    if (!/\.(m?js|jsx)$/.test(file)) return
    const specs = []
    walk(parseModule(readFileSync(file, 'utf8')).program, (n) => {
      if ((n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source) specs.push(n.source.value)
      if (n.type === 'ImportExpression' && n.source.type === 'StringLiteral') specs.push(n.source.value)
      if (n.type === 'CallExpression' && n.callee.type === 'Import' && n.arguments[0]?.type === 'StringLiteral') specs.push(n.arguments[0].value)
      if (n.type === 'NewExpression' && n.callee.name === 'URL' && n.arguments[0]?.type === 'StringLiteral' && n.arguments[0].value.startsWith('.')) specs.push(n.arguments[0].value)
    })
    for (const s of specs) {
      if (s.startsWith('.')) {
        const p = resolveImport(file, s)
        if (p) visit(p)
        else missing.push(`${relative(REPO, file)} → ${s}`)
      } else if (!s.startsWith('node:')) {
        packages.add(s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0])
      }
    }
  }
  for (const e of entries) visit(resolve(REPO, e))
  return { files: [...seen].map((f) => relative(REPO, f)).sort(), packages: [...packages].sort(), missing }
}

/** Scripts the public app keeps; every other script points at something not exported. */
const APP_SCRIPTS = ['dev', 'build', 'postbuild', 'preview']

/** The only build tools the public app needs. */
const APP_DEV = ['vite', '@vitejs/plugin-react']

/**
 * A package's version range as this repo declares it.
 *
 * @param {object} pkg - This repo's package.json.
 * @param {string} name - Package name.
 * @returns {string} The range.
 * @throws {Error} When this repo does not declare the package.
 * @pure
 */
function rangeOf(pkg, name) {
  const v = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]
  if (!v) throw new Error(`package.json does not declare ${name}`)
  return v
}

/**
 * The package.json for a public repo, built from this one's.
 *
 * Dependencies are exactly the packages the exported code imports, at this
 * repo's ranges, so the lockfile pruned from this repo's resolves the same
 * versions.
 *
 * @param {'app'|'mcp'} kind - Which repo.
 * @param {string[]} packages - Bare packages the exported code imports.
 * @returns {object} The package.json contents.
 * @reads This repo's package.json.
 */
export function publicPackage(kind, packages) {
  const pkg = JSON.parse(readFileSync(resolve(REPO, 'package.json'), 'utf8'))
  /**
   * Name → range for each package.
   *
   * @param {string[]} names - Package names.
   * @returns {object} The dependency map, sorted.
   * @pure
   */
  const deps = (names) => Object.fromEntries([...names].sort().map((n) => [n, rangeOf(pkg, n)]))
  const base = { version: pkg.version, private: true, license: 'MIT', type: 'module' }
  if (kind === 'app') {
    return {
      name: pkg.name, ...base,
      scripts: Object.fromEntries(APP_SCRIPTS.map((k) => [k, pkg.scripts[k]])),
      dependencies: deps(packages),
      devDependencies: deps(APP_DEV),
      ...(pkg.overrides ? { overrides: pkg.overrides } : {}),
    }
  }
  return {
    name: `${pkg.name}-mcp`, ...base,
    engines: { node: '>=22' },
    scripts: { start: 'node mcp/server.js', 'start:http': 'node mcp/http.js' },
    dependencies: deps(packages),
  }
}

/** Patterns that look like credentials. */
const SECRETS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{40,}/],
  ['Slack token', /xox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Anthropic or OpenAI key', /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Stripe key', /\b[sr]k_live_[A-Za-z0-9]{16,}/],
  ['assigned secret', /\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
]

/**
 * Scan text files under a directory for anything that looks like a credential.
 *
 * Lockfiles are skipped: their integrity hashes are long random strings by design.
 *
 * @param {string} dir - Directory to scan.
 * @returns {string[]} One line per hit: file, line number and kind.
 * @reads The filesystem.
 */
export function scanSecrets(dir) {
  const hits = []
  /**
   * Scan one directory, recursively.
   *
   * @param {string} d - Directory.
   * @returns {void}
   * @mutates The enclosing hit list.
   */
  const scan = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist' && e.name !== '.git') scan(p); continue }
      if (e.name === 'package-lock.json' || /\.(woff2?|png|jpe?g|gif|ico|wasm)$/.test(e.name)) continue
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        for (const [kind, re] of SECRETS) if (re.test(line)) hits.push(`${relative(dir, p)}:${i + 1}: ${kind}`)
      })
    }
  }
  scan(dir)
  return hits
}

const [cmd, ...args] = process.argv.slice(2)
if (cmd === 'strip') {
  let n = 0
  for (const f of args) if (stripFile(f)) n++
  console.log(`stripped ${n} files`)
} else if (cmd === 'closure') {
  const { files, packages, missing } = closure(args)
  if (missing.length) { console.error(`unresolved imports:\n  ${missing.join('\n  ')}`); process.exit(1) }
  console.log(files.join('\n'))
  console.error(`packages: ${packages.join(' ')}`)
} else if (cmd === 'pkg') {
  const [kind, out, ...entries] = args
  const { packages, missing } = closure(entries)
  if (missing.length) { console.error(`unresolved imports:\n  ${missing.join('\n  ')}`); process.exit(1) }
  writeFileSync(out, JSON.stringify(publicPackage(kind, packages), null, 2) + '\n')
} else if (cmd === 'secrets') {
  const hits = scanSecrets(args[0])
  if (hits.length) { console.error(hits.join('\n')); process.exit(1) }
  console.log('no secrets found')
} else if (cmd) {
  console.error(`unknown command ${cmd}`)
  process.exit(2)
}

