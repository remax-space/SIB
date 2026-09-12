import bcrypt from 'bcryptjs'
import { upsertUser } from '../lib/repo/users'

async function main() {
  const email = (process.env.MASTER_EMAIL ?? '').trim().toLowerCase()
  const password = process.env.MASTER_PASSWORD ?? ''
  const name = process.env.MASTER_NAME ?? 'Operador Mestre'

  if (!email || !password) {
    throw new Error('Defina MASTER_EMAIL e MASTER_PASSWORD no .env antes de criar o operador mestre.')
  }

  await upsertUser({
    email,
    password: await bcrypt.hash(password, 10),
    name,
    role: 'ADMIN',
  })

  console.log(`Master ADMIN ready: ${email}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
