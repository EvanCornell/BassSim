# Publishing the open-source release

**This file is private.** `EvanCornell/BassSim` stays private permanently and
is never made public. A release is a **tree export** into a brand-new
repository, with no shared git history, made by `scripts/export-public.sh`.

There are two public repositories:

| Repository | Contents | Export command |
|---|---|---|
| SpeakerSpice | The web app | `scripts/export-public.sh <dir>` |
| SpeakerSpice MCP | The MCP server, with the engine modules it imports | `scripts/export-public.sh --mcp <dir>` |

---

## Why a tree export

Git history cannot be reliably scrubbed. A file deleted in a later commit is
still in every earlier one, and GitHub keeps unreachable commits retrievable
by SHA until support purges them. A repository that never contained the
history has no such problem.

The script copies files with no `.git` directory, so no ref, reflog or
dangling object can come across. Each public repository starts from a single
initial commit.

---

## Decisions

| Question | Decision |
|---|---|
| Licence | MIT (`release/LICENSE`) |
| Driver library | Ships. One record type for every driver, in `src/data/drivers.library.js`. |
| MCP server | Ships as its own repository, separate from the app. |
| Contracts, specs, tests | Never ship. `docs/`, `test/`, `docs/api.json` and the contract pipeline stay private. |
| Comments | Stripped from all exported code. The public trees are code only. |
| Docs | None beyond a short README, LICENSE and THIRD_PARTY_NOTICES in each repository. |
| Source of truth | **This repository.** Every release is a fresh export from it. Changes made in a public repository are brought back here by hand, never merged back. |

---

## What the script exports

It copies only an allowlist. A new file in this repository is private unless
the allowlist reaches it.

### App

- The modules `src/main.jsx` imports, followed through static and dynamic
  imports, workers and `new URL(…)`. A module only the tests use (for example
  `src/data/driver-audit.js`) is not reached, so it is not exported.
- `src/assets/` (fonts and their licences), `public/`, `index.html`,
  `vite.config.js`, `.gitignore`
- `package.json`, rebuilt:
  - scripts: `dev`, `build`, `postbuild` and `preview` only;
  - dependencies: exactly the packages the exported code imports;
  - dev dependencies: Vite and its React plugin.
- `package-lock.json`, pruned from this repository's lockfile, so versions
  match.
- From `release/`: `LICENSE`, `THIRD_PARTY_NOTICES`, and `app/README.md` as
  `README.md`.

### MCP

- The modules `mcp/server.js` and `mcp/http.js` import, which includes the
  engine, schema and driver library under `src/`. Paths keep their place in
  the tree.
- `mcp/guide.md`, which the server reads at runtime.
- `package.json` (scripts `start` and `start:http`, and the MCP SDK, zod,
  mathjs and eecircuit-engine), plus the pruned lockfile.
- From `release/`: `LICENSE`, `THIRD_PARTY_NOTICES`, and `mcp/README.md` as
  `README.md`.

### Never exported

Everything else, including:

- `PUBLISH.md`, `README.md` (the private one), `docs/`, `test/`, `scripts/`,
  `release/` itself, `.claude/`, `.github/`, `eslint.config.js`
- `mcp/README.md`, `mcp/test-client.mjs`, `mcp/test-http.mjs`
- `node_modules/` and `dist/`

---

## What the script checks

It exits non-zero on any failure:

1. The target directory is missing or empty, and is outside this repository.
2. Every comment is stripped. Stripping is verified, not trusted: each file's
   tokens, comments aside, must be identical before and after. Comments a
   bundler needs (`@vite-ignore`, `__PURE__`) and licence comments are kept.
3. `npm ci` and `npm run build` succeed in the app export. For the MCP export,
   `npm ci` succeeds and the private stdio and HTTP smoke tests pass against
   the exported server.
4. No denylisted term appears:
   - better-auth, BETTER_AUTH, SMTP;
   - the private doc names: PUBLISH.md, ARCHITECTURE.md, SOLVER-ARCHITECTURE,
     ENGINE-CONTRACT, SPICE-PLAN, analysis-metrics, BACKLOG, TRIAGE.md,
     FINDINGS.md;
   - docs/contracts, api.json, .claude;
   - commit trailers;
   - the export scripts' own names.

   `SPEAKERSPICE_TOKEN` is allowed only in the MCP export's `mcp/http.js` and
   README.
5. `docs/`, `test/`, `scripts/`, `.claude/`, `.github/` and the MCP test
   files are absent, and the app export has no `mcp/`.
6. A secret scan passes. It uses gitleaks when installed, and otherwise a
   built-in scan for keys, tokens and private keys.

At the end it removes `node_modules/` and `dist/` and prints the file count,
total size and top-level paths.

---

## Release checklist

Run in order. Step 6 is a one-way door: forks can appear within hours.

1. [ ] `npm test` and `npm run build` pass here, on `main`.
2. [ ] `scripts/export-public.sh <app-dir>` and
       `scripts/export-public.sh --mcp <mcp-dir>` both end with `OK`.
3. [ ] Serve the app export (`npm ci && npm run build && npm run preview`)
       and confirm the app loads, a simulation runs, and `/panel?id=spl`
       renders.
4. [ ] Read both trees' top-level files: README, LICENSE (copyright holder
       and year), THIRD_PARTY_NOTICES.
5. [ ] Recheck THIRD_PARTY_NOTICES whenever `eecircuit-engine` changes
       version. The current build includes ngspice (Modified BSD) with KLU
       and numparam (LGPL), and no XSPICE code models, so the GPL
       `icm/table` model is not included. The circuit-diagram export bundles
       elkjs (EPL-1.0).
6. [ ] In each export: `git init`, one commit ("Initial public release"),
       create the repository, push, then make it public.

For later releases, export again into an empty directory and copy the result
over a clone of the public repository. Deletions then show up as deletions,
and the release is one commit. Do not synthesise history.
