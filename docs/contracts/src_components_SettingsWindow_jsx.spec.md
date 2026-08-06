# Contract specification: `src/components/SettingsWindow.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (2)

### `SettingsWindow()`

- **Reachability:** EXPORTED
- **Obtain via:** import { SettingsWindow } from '../../src/components/SettingsWindow.jsx'

The settings window: a floating, draggable panel rather than a dock panel.

Deliberately not a panel — settings are modal to the whole workspace, and
docking them would let the user tile settings beside the thing they are
configuring and lose track of which is which.

Re-centres each time it opens, so a window dragged off to one side is not
lost the next time it is needed.

**Returns**

- `React.ReactElement|null` — The window, or `null` when hidden.

**Side effects**

- Subscribes to the store. Registers a window keydown listener for Escape while open.

### `ResetPasswordPage()`

- **Reachability:** EXPORTED
- **Obtain via:** import { ResetPasswordPage } from '../../src/components/SettingsWindow.jsx'

The `/reset-password` landing page, linked from the reset email.

A whole-page route rather than part of the settings window: the user
arriving here is signed out and following a link, not navigating the app.

**Returns**

- `React.ReactElement` — The page.

**Side effects**

- Reads the reset token from `window.location`.

## UNREACHABLE (24)

### `useServerConfig()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Fetch the server's capabilities: which social providers and whether mail is configured.

Failures are swallowed and leave the defaults in place, so a server that
cannot answer degrades to email-and-password rather than an error.

**Returns**

- `{providers: string[], smtp: boolean}` — The configuration, initially empty until the fetch resolves.

**Side effects**

- Issues a GET to /api/config on mount.

### `SocialButtons(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A row of social provider buttons.

**Parameters**

- `props` — `object` — Component props.
- `props.providers` — `string[]` — Provider ids to offer.
- `props.action` — `(provider: string) => void` — Called with the chosen provider.
- `props.label` — `string` — Verb prefixing each provider name, e.g. "Sign in with".

**Returns**

- `React.ReactElement|null` — The button row, or `null` when no providers are configured.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `AuthForms()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The signed-out pane: sign in, create account, or request a password reset.

One component for all three modes, since they share the same fields and
differ only in which are shown and which call is made.

**Returns**

- `React.ReactElement` — The auth forms.

**Side effects**

- Fetches server config, and its actions call the auth service.

### `AuthForms > submit()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Run the current mode's auth request and report the outcome.

The reset path deliberately does not reveal whether the address is
registered. Without a mail server it says so and points at the server
log, rather than claiming a message was sent.

**Returns**

- `Promise<void>` — Resolves once the request has completed and the result is on screen.

**Side effects**

- Calls the auth service, which may create a session, and updates component state.

### `AuthForms > social(provider)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Begin a social sign-in, returning here afterwards.

**Parameters**

- `provider` — `string` — Provider id.

**Returns**

- `Promise<any>` — The auth client's result; the redirect usually happens first.

**Side effects**

- Navigates away to the provider's consent screen.

### `LinkedAccounts(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Manage which sign-in methods are attached to the account.

The last remaining method cannot be unlinked — doing so would lock the
user out of their own account — so its button is disabled and says why.

**Parameters**

- `props` — `object` — Component props.
- `props.providers` — `string[]` — Provider ids the server has configured.

**Returns**

- `React.ReactElement` — The linked-accounts pane.

**Side effects**

- Fetches the account list on mount, and its actions call the auth service.

### `LinkedAccounts > refresh()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Reload the linked account list.

A failure resolves to an empty list rather than leaving the pane in its
loading state forever.

**Returns**

- `Promise<void>` — Resolves once the list has been replaced.

**Side effects**

- Calls the auth service and updates component state.

### `LinkedAccounts > unlink(a)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Detach one sign-in method from the account.

**Parameters**

- `a` — `object` — The linked account record.

**Returns**

- `Promise<void>` — Resolves once the list has been refreshed.

**Side effects**

- Calls the auth service and refreshes the list.

### `LinkedAccounts > link(provider)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Attach an additional social sign-in method, returning here afterwards.

**Parameters**

- `provider` — `string` — Provider id.

**Returns**

- `Promise<any>` — The auth client's result; the redirect usually happens first.

**Side effects**

- Navigates away to the provider's consent screen.

### `ChangePassword()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Change the account password, signing out other sessions.

Revoking other sessions is deliberate: a password change is often a
response to suspecting one is compromised.

**Returns**

- `React.ReactElement` — The change-password form.

**Side effects**

- Its action calls the auth service.

### `ChangePassword > submit()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Submit the password change.

**Returns**

- `Promise<void>` — Resolves once the result is on screen.

**Side effects**

- Calls the auth service, revoking other sessions on success.

### `AccountManage(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The signed-in pane: profile, password, linked logins and account deletion.

**Parameters**

- `props` — `object` — Component props.
- `props.session` — `object` — The active session.

**Returns**

- `React.ReactElement` — The account pane.

**Side effects**

- Fetches server config, and its actions call the auth service.

### `AccountSection()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The Account section: the auth forms or the account manager, by session state.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Subscribes to the auth session.

### `ApplicationSection()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The Application section: sweep range, display options and experimental features.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Subscribes to the store.

### `QuickBarSection()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The Quick bar section: choose and reorder the items in the quick bar.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Subscribes to the store.

### `ComboChip(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One shortcut chip: click to re-record it, or use its ✕ to drop it.

**Parameters**

- `props` — `object` — Component props.
- `props.combo` — `string` — The combo to display.
- `props.onRemove` — `Function` — Called when the ✕ is clicked.
- `props.onClick` — `Function` — Called when the chip itself is clicked.

**Returns**

- `React.ReactElement` — The chip.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `KeyboardSection()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The Keyboard section: view and rebind every command's shortcuts.

While recording, a capture-phase listener swallows every key, so the
shortcut being captured cannot also fire the command it is bound to —
without that, recording Ctrl+N over "New project" would start a new
project. Escape cancels.

Assigning a combo already in use takes it from the other command and says
so, rather than silently leaving two commands on one key.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Subscribes to the store. Registers a capture-phase window keydown listener while recording.

### `KeyboardSection > onKey(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Capture the next keypress as the shortcut being recorded.

**Parameters**

- `e` — `KeyboardEvent` — The keydown event.

**Returns**

- `void`

**Side effects**

- Swallows the key, then writes and persists the new binding. Escape cancels without changing anything.

### `KeyboardSection > isDefault(id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a command still carries exactly its default bindings.

**Parameters**

- `id` — `string` — Command id.

**Returns**

- `boolean` — True when the bindings match the defaults in both content and order.

**Reads external mutable state**

- the current bindings from the store.

### `SettingsWindow > esc(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Close the window on Escape.

**Parameters**

- `e` — `KeyboardEvent` — The keydown event.

**Returns**

- `void`

**Side effects**

- Closes the settings window.

### `SettingsWindow > onTitleDown(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Begin dragging the window by its title bar.

Clicks on the close button are ignored, so closing does not start a drag.

**Parameters**

- `e` — `React.MouseEvent` — The mousedown event.

**Returns**

- `void`

**Side effects**

- Registers window mousemove and mouseup listeners.

### `SettingsWindow > onTitleDown > move(ev)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply the in-progress window drag.

**Parameters**

- `ev` — `MouseEvent` — The mousemove event.

**Returns**

- `void`

**Side effects**

- Updates the window offset on every move.

### `SettingsWindow > onTitleDown > up()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

End the window drag and remove its listeners.

**Returns**

- `void`

**Side effects**

- Removes the window listeners.

### `ResetPasswordPage > submit()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Submit the new password.

**Returns**

- `Promise<any>|void` — The auth client's promise, or nothing when the two entries disagree.

**Side effects**

- Calls the auth service, which signs the user in on success.
