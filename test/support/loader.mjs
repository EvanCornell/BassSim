// Node module-customization hook that makes the app's .jsx modules importable
// from tests.
//
// The contract suite needs to reach helpers that happen to live beside React
// components — the T/S solvers in TSCalc.jsx, the axis-fitting maths in
// OutputPanel.jsx — and Node cannot parse JSX. esbuild is already in the tree
// as a Vite dependency, so this transforms on the fly rather than adding a
// build step or a test-only dependency.
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transform } from 'esbuild'

// Vite resolves extensionless relative imports; Node does not. The app writes
// `from '../store'`, so without this every module that does would fail to
// resolve under the test runner.
const EXTENSIONS = ['.js', '.jsx', '.mjs', '/index.js', '/index.jsx']

/**
 * Resolve a specifier, trying the app's implicit extensions before giving up.
 *
 * @param {string} specifier - The import specifier.
 * @param {object} context - Node's resolve context, carrying the parent URL.
 * @param {Function} next - The next resolver in the chain.
 * @returns {Promise<object>} A Node resolve result.
 * @sideEffect Probes the filesystem for candidate files.
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL) {
    const base = new URL(specifier, context.parentURL)
    if (!existsSync(fileURLToPath(base))) {
      for (const ext of EXTENSIONS) {
        const candidate = fileURLToPath(base) + ext
        if (existsSync(candidate)) {
          return { url: pathToFileURL(candidate).href, format: 'module', shortCircuit: true }
        }
      }
    }
  }
  return next(specifier, context)
}

/**
 * Transform .jsx sources to plain JS on load; pass everything else through.
 *
 * @param {string} url - The resolved module URL.
 * @param {object} context - Node's load context.
 * @param {Function} next - The next loader in the chain.
 * @returns {Promise<object>} A Node load result.
 * @sideEffect Reads the module from disk and runs it through esbuild.
 */
export async function load(url, context, next) {
  if (!url.endsWith('.jsx')) return next(url, context)
  const source = await readFile(fileURLToPath(url), 'utf8')
  const { code } = await transform(source, {
    loader: 'jsx',
    format: 'esm',
    jsx: 'automatic',
    target: 'node22',
    sourcefile: url,
  })
  return { format: 'module', shortCircuit: true, source: code }
}
