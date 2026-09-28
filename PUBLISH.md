# Publishing the open-source release

**This file is private and must not appear in the public repository.** It is
listed in its own exclusion table below.

`EvanCornell/BassSim` is private and has never been public (0 forks, never
published). That is the only reason a clean release is possible, and it is a
property to preserve: **this repository must never be made public.**

The public release is a *tree export* into a brand-new repository, not a
history transfer or a visibility flip.

---

## Why not just flip this repo to public

Git history cannot be reliably scrubbed after the fact. Deleting a file in a
new commit leaves it in every earlier one, and GitHub keeps unreachable commits
retrievable by SHA — through the web UI and the API — until support purges
them. Add forks, caches and any reference that pins an old SHA, and "deleted"
stops meaning removed.

A repository that never contained the history has no such problem. That is the
whole strategy.

---

## Export procedure

Copy the tree with **no `.git` directory at all**. Do not use
`git checkout --orphan`: a fresh copy cannot carry a ref, a reflog or a
dangling object across, and an orphan branch shares a repository with the
history it is trying to escape.

```bash
rsync -a --exclude='.git' BassSim/ speakerspice-public/
cd speakerspice-public
# apply the exclusions below
rm -rf node_modules dist
git init
git add -A
git commit -m "Initial public release"
```

A single initial commit is normal for a first open-source release and reads as
exactly what it is. Do not synthesise a plausible-looking history — commits
sharing one timestamp look worse than one honest commit.

---

## Exclusions

Everything here must be absent from the exported tree.

| Path | Reason |
|---|---|
| `PUBLISH.md` | This file |
| `docs/ARCHITECTURE.md` | Commercial product plan, tiering, hosting economics |
| `docs/SOLVER-ARCHITECTURE.md` | Paid engine design |
| `docs/ENGINE-CONTRACT.md` | Contract for the commercial engine |
| `docs/analysis-metrics.md` | Paid analysis feature set |
| `docs/BACKLOG.md` | Internal work queue and known defects |
| `docs/SPICE-PLAN.md` | Internal engine plan |
| `.claude/` | Agent configuration and workflow |
| `test/contract/TRIAGE.md` | Internal audit findings |
| `test/contract/FINDINGS.md` | Internal audit findings |
| `node_modules/`, `dist/` | Build output |

### Decide before exporting

| Path | Question |
|---|---|
| `docs/contracts/`, `docs/api.json` | ~27k lines of generated specification. Legitimate engineering output and useful to contributors, but it documents every internal decision in detail. Publish or not — deliberately, not by default. |
| `data/catalogs/bc-speakers-comparison-matrix.xml`, `src/data/drivers.bc.js` | **Resolve before release.** If this is a manufacturer's published parameter catalogue, redistributing it under an open-source licence is a licensing question, not a technical one. Manufacturer T/S data is frequently asserted as proprietary. Options: ship an empty catalogue with the importer, obtain permission, or include only independently measured data. This surfaces *after* release if ignored. |

---

## Pre-flight checklist

Run in order. Step 6 is a one-way door — forks can appear within hours.

1. [ ] `npm ci && npm test` passes on the exported tree
2. [ ] `npm run build` succeeds; serve `dist/` and confirm a simulation runs
       and `/panel?id=spl` renders
3. [ ] Exclusions above applied; `grep -ri` the tree for `better-auth`,
       `SPEAKERSPICE_TOKEN`, `SMTP`, `BETTER_AUTH_SECRET` — all should be absent
4. [ ] Secret scan the final tree (test fixtures are the usual culprit)
5. [ ] `LICENSE`, `README.md`, `CONTRIBUTING.md` present and accurate.
       The simulation engine is ngspice compiled to WebAssembly
       (`eecircuit-engine`, MIT wrapper). ngspice is Modified BSD, but the
       build statically includes KLU (LGPLv2) and very likely numparam
       (LGPLv2). Credit ngspice and its components in the README and a
       `THIRD_PARTY_NOTICES` file, and point to the eecircuit-engine and
       ngspice sources, which satisfies LGPL for an unmodified library. The
       build has no XSPICE code models, so the GPLv2 `icm/table` model is not
       included — recheck this whenever the engine version changes.
       Runtime dependencies are all permissive — React, reactflow, recharts,
       zustand (MIT), mathjs (Apache-2.0) — so MIT or Apache-2.0 are both open.
       Note that Boundary Lab is GPL-3; there is no shared code, so no
       constraint follows from it, but choose deliberately.
6. [ ] Create the new repository, push the single commit, then make it public

---

## What the public repository contains

A fully client-side app with no backend:

- Solver runs in a Web Worker (`src/engine/worker.js`)
- Projects, presets, layout and keybindings in LocalStorage
- Static build; `public/_redirects` and a `404.html` postbuild step cover SPA
  routing on Netlify, Cloudflare Pages and GitHub Pages
- Relative asset and popout URLs, so it serves correctly from a subdirectory
- MCP server (`npm run mcp`) as an optional Node companion, not part of the app

No accounts, no telemetry, no network calls at runtime.
