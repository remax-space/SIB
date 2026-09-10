import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = (process.env.MASTER_EMAIL ?? 'mestre@sib.local').trim().toLowerCase()
  const password = process.env.MASTER_PASSWORD ?? 'SibMestre@2026'
  const name = process.env.MASTER_NAME ?? 'Operador Mestre'

  if (!password) {
    throw new Error('MASTER_PASSWORD is empty')
  }

  await prisma.user.upsert({
    where: { email },
    update: {
      password: await bcrypt.hash(password, 10),
      name,
      role: 'ADMIN',
    },
    create: {
      email,
      password: await bcrypt.hash(password, 10),
      name,
      role: 'ADMIN',
    },
  })

  console.log(`Master ADMIN ready: ${email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
