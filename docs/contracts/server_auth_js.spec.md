# Contract specification: `server/auth.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Authentication: Better Auth on SQLite, mounted at /api/auth/* by index.js.

Methods enabled:
 - email + password (with password reset; change password when signed in)
 - social sign-in for any provider whose credentials are present in env:
     GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
     FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET
     APPLE_CLIENT_ID / APPLE_CLIENT_SECRET
     GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
 - account linking: a signed-in user can attach/detach social logins

Reset emails go through SMTP when SMTP_HOST is configured; otherwise the
reset link is printed to the server log (dev mode).

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `enabledProviders`

Social provider names that are configured and therefore offered in the UI.

A provider appears automatically once both its client id and secret are
present in the environment, so enabling one is a deployment change rather
than a code change.

### `auth`

## EXPORTED (1)

### `migrateAuthDb()`

- **Reachability:** EXPORTED
- **Obtain via:** import { migrateAuthDb } from '../../server/auth.js'
- **Async:** returns a Promise

Create or upgrade the auth tables.

Idempotent, and run on every start, so a deployment never needs a
separate migration step.

**Returns**

- `Promise<void>` — Resolves once the schema is current.

**Side effects**

- Writes to the SQLite database.

## UNREACHABLE (2)

### `sendEmail(msg)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Send a transactional email, or log it when no SMTP host is configured.

Falling back to the log rather than throwing keeps password reset usable
in development: the reset link is printed to the server output instead of
being delivered.

**Parameters**

- `msg` — `object` — The message.
- `msg.to` — `string` — Recipient address.
- `msg.subject` — `string` — Subject line.
- `msg.text` — `string` — Plain-text body.

**Returns**

- `Promise<void>` — Resolves once the message is sent or logged.

**Side effects**

- Sends mail over SMTP, or writes to the server log. Reads SMTP configuration from the environment.

### `emailAndPassword > sendResetPassword(req)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Email a password-reset link.

**Parameters**

- `req` — `object` — Reset request from Better Auth.
- `req.user` — `object` — The account requesting the reset.
- `req.url` — `string` — The single-use reset link.

**Returns**

- `Promise<void>` — Resolves once the message is sent or logged.

**Side effects**

- Sends an email.
