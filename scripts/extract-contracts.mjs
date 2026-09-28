#!/usr/bin/env node
// Generate docs/api.json — a machine-readable index of every method contract.
//
// This is the documentation feed. A doc site, an LLM tool or a review script
// should read the JSON, never the source: the JSON is stable, flat and
// self-describing, whereas the source needs a JSX-aware parser to make sense
// of. `npm run docs:api` regenerates it; the file is committed so consumers do
// not need to run a build to see the current API.
//
// The tag vocabulary travels inside the output under `vocabulary`, so a
// consumer can render contract fields it has never seen without being updated
// in lockstep with this repo.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, TAGS, scanRepo } from './contracts-lib.mjs'

const modules = scanRepo().map((m) => ({
  file: m.file,
  module: m.moduleDoc ? { summary: m.moduleDoc.summary, description: m.moduleDoc.description } : null,
  // Exported non-function bindings. These carry no method contract, but their
  // names are the vocabulary the method contracts refer to by role — command
  // ids, node types, panel ids — so they are published alongside.
  constants: m.constants.map((c) => ({
    name: c.name,
    line: c.line,
    shape: c.shape,
    summary: c.doc?.summary ?? null,
    description: c.doc?.description ?? null,
  })),
  methods: m.methods.map((x) => ({
    name: x.name,
    qualified: x.qualified,
    kind: x.kind,
    exported: x.exported,
    async: x.async,
    generator: x.generator,
    line: x.line,
    signature: x.params.map((p) => (p.kind === 'rest' ? `...${p.name}` : p.name)),
    documented: !!x.doc,
    summary: x.doc?.summary ?? null,
    description: x.doc?.description ?? null,
    params: x.doc?.params ?? [],
    returns: x.doc?.returns ?? null,
    throws: x.doc?.throws ?? [],
    contract: {
      pre: x.doc?.pre ?? [],
      post: x.doc?.post ?? [],
      invariant: x.doc?.invariant ?? [],
      mutates: x.doc?.mutates ?? [],
      sideEffect: x.doc?.sideEffect ?? [],
      reads: x.doc?.reads ?? [],
      pure: x.doc?.pure ?? false,
    },
    other: x.doc?.other ?? [],
  })),
}))

const total = modules.reduce((n, m) => n + m.methods.length, 0)
const documented = modules.reduce((n, m) => n + m.methods.filter((x) => x.documented).length, 0)

const out = {
  $schema: 'https://speakerspice.com/schema/api.v1.json',
  generator: 'scripts/extract-contracts.mjs',
  // Deliberately no timestamp: a regenerated file with no source change should
  // produce no diff, or the commit log fills with noise.
  version: 1,
  vocabulary: TAGS,
  stats: { modules: modules.length, methods: total, documented },
  modules,
}

mkdirSync(join(REPO, 'docs'), { recursive: true })
writeFileSync(join(REPO, 'docs/api.json'), `${JSON.stringify(out, null, 2)}\n`)

console.log(`docs/api.json — ${modules.length} modules, ${documented}/${total} methods documented`)
