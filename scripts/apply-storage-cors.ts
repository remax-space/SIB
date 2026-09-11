import { GoogleAuth } from 'google-auth-library'
import { STORAGE_CORS } from '../lib/storage-cors'

function credentials() {
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  if (!privateKey || !clientEmail) {
    throw new Error('FIREBASE_PRIVATE_KEY e FIREBASE_CLIENT_EMAIL são obrigatórios')
  }
  return { client_email: clientEmail, private_key: privateKey }
}

async function main() {
  const targetBucket = process.env.FIREBASE_STORAGE_BUCKET
  if (!targetBucket) throw new Error('FIREBASE_STORAGE_BUCKET ausente')

  const auth = new GoogleAuth({
    credentials: credentials(),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()

  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(targetBucket)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cors: STORAGE_CORS }),
    }
  )
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('Falha ao aplicar CORS:', response.status, body?.error ?? body)
    process.exit(1)
  }
  console.log('CORS aplicado em', targetBucket)
}

main().catch((err) => {
  console.error(err?.message ?? err)
  process.exit(1)
})
