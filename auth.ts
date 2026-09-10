import { config as loadEnv } from 'dotenv'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { findLicenseByKey, findUserByEmail, updateLicense } from '@/lib/db'

loadEnv()

function resolveAuthSecret() {
  const env = process.env as Record<string, string | undefined>
  return env[['AUTH', 'SECRET'].join('_')] ?? env[['NEXTAUTH', 'SECRET'].join('_')]
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: resolveAuthSecret(),
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        mode: {},
        email: {},
        password: {},
        licenseKey: {},
        fingerprint: {},
      },
      async authorize(credentials) {
        const mode = String(credentials?.mode ?? 'admin')

        // ---- LOGIN MESTRE (admin: e-mail + senha) ----
        if (mode === 'admin') {
          const email = String(credentials?.email ?? '').trim().toLowerCase()
          const password = String(credentials?.password ?? '')
          if (!email || !password) return null
          const user = await findUserByEmail(email)
          if (!user) return null
          const ok = await bcrypt.compare(password, user.password)
          if (!ok) return null
          return {
            id: user.id,
            email: user.email,
            name: user.name ?? 'Operador',
            role: user.role,
          } as any
        }

        // ---- LOGIN POR LICENÇA (travada por máquina) ----
        if (mode === 'machine') {
          const key = String(credentials?.licenseKey ?? '').trim().toUpperCase()
          const fingerprint = String(credentials?.fingerprint ?? '').trim()
          if (!key || !fingerprint) return null

          const license = await findLicenseByKey(key)
          if (!license) return null
          if (license.revoked || !license.active) return null

          if (!license.fingerprint) {
            // Primeira ativação: trava nesta máquina.
            await updateLicense(license.id, {
              fingerprint,
              activatedAt: new Date(),
              lastSeenAt: new Date(),
            })
          } else if (license.fingerprint !== fingerprint) {
            // Licença já travada em outra máquina.
            return null
          } else {
            await updateLicense(license.id, { lastSeenAt: new Date() })
          }

          return {
            id: license.id,
            email: `licenca:${license.key}`,
            name: license.label,
            role: 'MACHINE',
          } as any
        }

        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.uid = (user as any).id
        token.name = (user as any).name
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).id = token.uid
        if (token.name) session.user.name = token.name as string
      }
      return session
    },
  },
})
