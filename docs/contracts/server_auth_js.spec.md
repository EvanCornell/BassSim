# Contract specification: `server/auth.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

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

### `sendEmail(arg0)`

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

### `sendResetPassword(arg0)`

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
