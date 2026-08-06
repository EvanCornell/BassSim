// Single entry point for the contract suite's runtime, loaded via `--import`
// before any test file.
//
// Order matters and is the reason this file exists rather than two flags: the
// JSX loader must be registered before the first application import is
// resolved, and the browser shims must exist before the first module body runs
// — the store reads localStorage while it initialises.
import { register } from 'node:module'
import './env.mjs'

register('./loader.mjs', import.meta.url)
