// Better Auth client: session hook + sign-in/up/out, password flows, and
// social account linking. Same-origin /api/auth (vite proxies in dev).
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()

export const PROVIDER_LABELS = {
  google: 'Google',
  facebook: 'Facebook',
  apple: 'Apple',
  github: 'GitHub',
  credential: 'Email & password',
}
