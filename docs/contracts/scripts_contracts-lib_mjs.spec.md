# Contract specification: `scripts/contracts-lib.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Shared machinery for the method-contract toolchain.

Two consumers sit on top of this module and must agree exactly, or the
coverage test would police a different set of methods than the extractor
publishes:

  scripts/extract-contracts.mjs → docs/api.json   (documentation feed)
  test/contracts.mjs            → npm run test:contracts (the ratchet)

Everything they disagree about would be a silent documentation hole, so the
definition of "a method", the tag vocabulary and the JSDoc parser all live
here once.

The AST comes from @babel/parser rather than a regex because the codebase is
JSX-heavy and arrow-dense: `onClick={(e) => …}` and `const apply = (d) => …`
are indistinguishable to a line matcher but only the second is a method we
expect a contract on.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `REPO`

Repository root, so scanned paths can be reported repo-relative.

### `ROOTS`

Directories walked for documentable source.

Values: `src`, `mcp`, `server`, `scripts`, `test`

### `IGNORE_FILES`

Values: `src/data/drivers.bc.js`, `src/data/drivers.legacy.js`, `test/support/env.mjs`

### `IGNORE_DIRS_REL`

Values: `test/contract/`

### `TAGS`

The contract vocabulary, as data so the test can reject anything outside it.

A typo like `@sideeffect` would otherwise parse cleanly and then silently
vanish from the generated docs.

Payload kinds: `typed` expects a leading `{type}`, `text` takes free
prose, and `flag` takes nothing.

Keys: `param`, `returns`, `throws`, `yields`, `type`, `typedef`, `property`, `template`, `callback`, `example`, `see`, `deprecated`, `pre`, `post`, `invariant`, `mutates`, `sideEffect`, `reads`, `pure`

### `__internals`

Keys: `walkDir`, `takeType`, `takeName`, `stripDash`, `paramNames`, `returnsValue`, `classify`, `anchorStart`

## EXPORTED (5)

### `normalizeTag(t)`

- **Reachability:** EXPORTED
- **Obtain via:** import { normalizeTag } from '../../scripts/contracts-lib.mjs'

Resolve a tag alias to its canonical name.

**Parameters**

- `t` — `string` — The tag as written.

**Returns**

- `string` — The canonical tag name, unchanged when it is not an alias.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sourceFiles()`

- **Reachability:** EXPORTED
- **Obtain via:** import { sourceFiles } from '../../scripts/contracts-lib.mjs'

Every source file in scope, repo-relative and sorted.

Sorting matters: it is what makes `docs/api.json` stable across runs, so
a regeneration with no source change produces no diff.

**Returns**

- `string[]` — Repo-relative paths, ascending.

**Side effects**

- Reads the filesystem.

### `parseJsdoc(raw)`

- **Reachability:** EXPORTED
- **Obtain via:** import { parseJsdoc } from '../../scripts/contracts-lib.mjs'

Parse a raw JSDoc comment body into structured contract fields.

Tags continue across lines until the next one, so a long `@pre` can be
wrapped without losing its tail.

**Parameters**

- `raw` — `string` — Babel's `comment.value`: the text between the delimiters.

**Returns**

- `object` — The parsed contract. `summary` and `description` are strings; `params` is an array of `{name, type, optional, default, desc}` — the description field is `desc`, not `description`, and `type` and `default` are null when absent; `returns` is `{type, desc}` or null; `throws` is an array of `{type, desc}`. The contract arrays `pre`, `post`, `invariant`, `mutates`, `sideEffect` and `reads` each hold plain strings, and `pure` is a boolean. `other` collects parsed `@property` entries. `unknownTags` and `malformed` are arrays of strings for the test to report on.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `scanFile(relPath)`

- **Reachability:** EXPORTED
- **Obtain via:** import { scanFile } from '../../scripts/contracts-lib.mjs'

Scan one source file for methods and the contracts attached to them.

A contract belongs to a method only when nothing but whitespace separates
them, which is what stops an unrelated block comment further up the file
from being read as one.

**Parameters**

- `relPath` — `string` — Repo-relative path.

**Returns**

- `{file: string, moduleDoc: object|null, methods: Array<object>}` — The file's module-level contract and every method in source order, each with `doc: null` when it has none.

**Throws**

- `Error` — When the file cannot be parsed.

**Side effects**

- Reads the file from disk.

### `scanRepo()`

- **Reachability:** EXPORTED
- **Obtain via:** import { scanRepo } from '../../scripts/contracts-lib.mjs'

Scan every source file in scope.

**Returns**

- `Array<{file: string, moduleDoc: object|null, methods: Array<object>}>` — One entry per file, in sorted path order.

**Throws**

- `Error` — When any file fails to parse.

**Side effects**

- Reads the filesystem.

## INTERNAL (8)

### `walkDir(dir, out)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../scripts/contracts-lib.mjs'  →  __internals.walkDir

Collect source files under a directory, recursively.

An unreadable directory is skipped rather than throwing, so a missing
optional root does not break the scan.

**Parameters**

- `dir` — `string` — Absolute directory path.
- `out` — `string[]` — Accumulator, appended to in place.

**Returns**

- `string[]` — The same array.

**Mutates**

- The `out` array.

**Side effects**

- Reads the filesystem.

### `takeType(s)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../scripts/contracts-lib.mjs'  →  __internals.takeType

Pull a leading `{type}` off a tag payload.

Written as a brace scan rather than a regex so record and union types —
`{{driver: Driver}}`, `{Object<string, N>}` — survive intact instead of
being truncated at the first `}`.

**Parameters**

- `s` — `string` — The tag payload.

**Returns**

- `[string|null, string]` — The type and the remaining text; the type is `null` when there was none or the braces were unbalanced.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `takeName(s)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../scripts/contracts-lib.mjs'  →  __internals.takeName

Pull a parameter name off a tag payload.

Handles all three JSDoc spellings: `name`, `[name]` for optional, and
`[name=default]`.

**Parameters**

- `s` — `string` — The payload, after any type has been removed.

**Returns**

- `[string|null, boolean, string|null, string]` — The name, whether it was optional, its default, and the remaining text.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `stripDash(s)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../scripts/contracts-lib.mjs'  →  __internals.stripDash

Remove the optional `-` separating a parameter name from its description.

Trims before matching: `takeName` can leave a leading space, and a dash
behind one is still the separator.

**Parameters**

- `s` — `string` — The remaining payload.

**Returns**

- `string` — The description alone, trimmed at both ends.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `paramNames(fn)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../scripts/contracts-lib.mjs'  →  __internals.paramNames

Parameter names as the signature actually declares them.

Destructured and rest params are reported with a `pattern` kind, because
their JSDoc name is the author's choice — only their position is
checkable.

**Parameters**

- `fn` — `object` — A Babel function node.

**Returns**

- `Array<{kind: 'name'|'rest'|'pattern', name: string, optional: boolean}>` — One descriptor per declared parameter, in order.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `returnsValue(fn)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../scripts/contracts-lib.mjs'  →  __internals.returnsValue

Whether a function can return a value, so a `@returns` is expected.

A nested function's returns belong to that function, so the walk stops at
any function boundary below the one being examined.

**Parameters**

- `fn` — `object` — A Babel function node.

**Returns**

- `boolean` — True for a concise arrow body, or a body containing a `return` with an argument.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `classify(node, parent)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../scripts/contracts-lib.mjs'  →  __internals.classify

Decide whether an AST node is a documentable method, and name it.

"Absolutely everything" means every *named* function binding at any depth
— including one-line aliases like `export const add = (a, b) => a.add(b)`
and helpers declared inside a component body. Anonymous functions passed
straight to a call or a JSX prop are excluded: `filtered.map((d) => …)`
has no name to document, and a block comment there would break up the
markup it lives in.

**Parameters**

- `node` — `object` — The AST node.
- `parent` — `object|null` — Its parent, needed to recognise a default export.

**Returns**

- `{name: string, kind: string, fn: object|null}|null` — The method's name, kind and function node, or `null` when the node is not a method.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `anchorStart(node, parents)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../scripts/contracts-lib.mjs'  →  __internals.anchorStart

Where a method's contract would have to end for it to belong to that method.

A contract sits above the whole declaration, not above the inner arrow:
in `export const f = () => {}` the arrow starts well after the comment
that documents it, so this walks out through the wrappers that share a
start position.

**Parameters**

- `node` — `object` — The method's AST node.
- `parents` — `Array<object>` — Its ancestors, outermost first.

**Returns**

- `number` — Source offset the contract must be adjacent to.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (3)

### `returnsValue > visit(n)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Walk the body looking for a value-returning `return`.

**Parameters**

- `n` — `any` — An AST node, array, or anything else, which is ignored.

**Returns**

- `void`

**Mutates**

- The enclosing `found` flag and the visited set.

### `scanFile > shapeOf(node)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Summarise a constant's value shape without reproducing its implementation.

The keys of an exported object are vocabulary, not code: they are the
command ids, node types and panel ids that method contracts refer to by
role and never enumerate. Publishing them closes the single most-reported
gap in the spec pack. Values are deliberately not published — only names,
and the primitive value of a scalar.

**Parameters**

- `node` — `object` — The initialiser expression.

**Returns**

- `{kind: string, keys?: string[], length?: number, values?: Array<string|number>, value?: any}|null` — A shape summary, or `null` when there is nothing useful to say.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `scanFile > visit(node)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Walk the AST, recording every documentable method it finds.

**Parameters**

- `node` — `any` — An AST node, array, or anything else, which is ignored.

**Returns**

- `void`

**Mutates**

- The enclosing `found` list, and the parent and scope stacks it maintains during the walk.
