// Authentication: Better Auth on SQLite, mounted at /api/auth/* by index.js.
//
// Methods enabled:
//  - email + password (with password reset; change password when signed in)
//  - social sign-in for any provider whose credentials are present in env:
//      GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//      FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET
//      APPLE_CLIENT_ID / APPLE_CLIENT_SECRET
//      GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
//  - account linking: a signed-in user can attach/detach social logins
//
// Reset emails go through SMTP when SMTP_HOST is configured; otherwise the
// reset link is printed to the server log (dev mode).
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.ACOUSIM_DATA_DIR || join(__dirname, 'data')
mkdirSync(DATA_DIR, { recursive: true })

const BASE_URL = process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 8788}`

if (!process.env.BETTER_AUTH_SECRET) {
  console.error('WARNING: BETTER_AUTH_SECRET not set — using an insecure dev secret. Set it in production!')
}

// social providers: enabled only when credentials exist
const PROVIDER_DEFS = ['google', 'facebook', 'apple', 'github']
const socialProviders = {}
for (const p of PROVIDER_DEFS) {
  const id = process.env[`${p.toUpperCase()}_CLIENT_ID`]
  const secret = process.env[`${p.toUpperCase()}_CLIENT_SECRET`]
  if (id && secret) socialProviders[p] = { clientId: id, clientSecret: secret }
}
/**
 * Social provider names that are configured and therefore offered in the UI.
 *
 * A provider appears automatically once both its client id and secret are
 * present in the environment, so enabling one is a deployment change rather
 * than a code change.
 */
export const enabledProviders = Object.keys(socialProviders)

/**
 * Send a transactional email, or log it when no SMTP host is configured.
 *
 * Falling back to the log rather than throwing keeps password reset usable
 * in development: the reset link is printed to the server output instead of
 * being delivered.
 *
 * @param {object} msg - The message.
 * @param {string} msg.to - Recipient address.
 * @param {string} msg.subject - Subject line.
 * @param {string} msg.text - Plain-text body.
 * @returns {Promise<void>} Resolves once the message is sent or logged.
 * @sideEffect Sends mail over SMTP, or writes to the server log. Reads SMTP configuration from the environment.
 */
async function sendEmail({ to, subject, text }) {
  if (process.env.SMTP_HOST) {
    const { default: nodemailer } = await import('nodemailer')
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
    await transport.sendMail({ from: process.env.SMTP_FROM || 'AcouSim <no-reply@localhost>', to, subject, text })
  } else {
    console.error(`\n[auth email → ${to}] ${subject}\n${text}\n(configure SMTP_HOST to send real email)\n`)
  }
}

export const auth = betterAuth({
  database: new Database(join(DATA_DIR, 'acousim.db')),
  baseURL: BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET || 'acousim-dev-secret-do-not-use-in-production',
  trustedOrigins: [BASE_URL, 'http://localhost:5173', 'http://localhost:5199'],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    /**
     * Email a password-reset link.
     *
     * @param {object} req - Reset request from Better Auth.
     * @param {object} req.user - The account requesting the reset.
     * @param {string} req.url - The single-use reset link.
     * @returns {Promise<void>} Resolves once the message is sent or logged.
     * @sideEffect Sends an email.
     */
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your AcouSim password',
        text: `Hi ${user.name || ''},\n\nReset your AcouSim password here:\n${url}\n\nIf you didn't request this, ignore this email.`,
      })
    },
  },
  socialProviders,
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: enabledProviders, // allow linking any configured provider
      allowDifferentEmails: true,
    },
  },
  user: {
    deleteUser: { enabled: true },
    changeEmail: { enabled: false },
  },
})

// Create/upgrade the auth tables on startup (idempotent).
/**
 * Create or upgrade the auth tables.
 *
 * Idempotent, and run on every start, so a deployment never needs a
 * separate migration step.
 *
 * @returns {Promise<void>} Resolves once the schema is current.
 * @sideEffect Writes to the SQLite database.
 */
export async function migrateAuthDb() {
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
}
