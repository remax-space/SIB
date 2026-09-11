import { GoogleAuth } from 'google-auth-library'
import { STORAGE_CORS } from '../lib/storage-cors'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'sib-advocacia'
const LOCATION = 'southamerica-east1'

function credentials() {
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  if (!privateKey || !clientEmail) {
    throw new Error('FIREBASE_PRIVATE_KEY e FIREBASE_CLIENT_EMAIL são obrigatórios')
  }
  return { client_email: clientEmail, private_key: privateKey }
}

async function authedFetch(url: string, init: RequestInit = {}) {
  const auth = new GoogleAuth({
    credentials: credentials(),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let body: any = text
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    /* keep text */
  }
  return { ok: response.ok, status: response.status, body }
}

async function enableApi(service: string) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${PROJECT_ID}/services/${service}:enable`
  const result = await authedFetch(url, { method: 'POST', body: '{}' })
  if (result.ok || result.status === 409) {
    console.log(`API ${service}: ok`)
    return
  }
  if (result.body?.error?.status === 'ALREADY_ENABLED' || /already enabled/i.test(JSON.stringify(result.body))) {
    console.log(`API ${service}: já habilitada`)
    return
  }
  console.warn(`API ${service}: ${result.status}`, result.body?.error?.message ?? result.body)
}

async function main() {
  console.log(`Criando Storage padrão em ${PROJECT_ID} (${LOCATION})`)

  await enableApi('storage.googleapis.com')
  await enableApi('firebasestorage.googleapis.com')

  const existing = await authedFetch(
    `https://firebasestorage.googleapis.com/v1alpha/projects/${PROJECT_ID}/defaultBucket`
  )
  if (existing.ok) {
    console.log('Bucket padrão já existe:', existing.body?.name ?? existing.body?.location ?? existing.body)
  } else {
    const created = await authedFetch(
      `https://firebasestorage.googleapis.com/v1alpha/projects/${PROJECT_ID}/defaultBucket`,
      {
        method: 'POST',
        body: JSON.stringify({
          location: LOCATION,
        }),
      }
    )
    if (!created.ok) {
      console.warn('API Firebase Storage indisponível:', created.body?.error?.message ?? created.status)
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.endsWith('.firebasestorage.app')
        ? `${PROJECT_ID}-files`
        : (process.env.FIREBASE_STORAGE_BUCKET ?? `${PROJECT_ID}-files`)
      console.log('Criando bucket GCS direto:', bucketName)
      const gcs = await authedFetch(
        `https://storage.googleapis.com/storage/v1/b?project=${PROJECT_ID}`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: bucketName,
            location: LOCATION,
            storageClass: 'STANDARD',
            iamConfiguration: {
              uniformBucketLevelAccess: { enabled: true },
            },
          }),
        }
      )
      if (!gcs.ok && gcs.status !== 409) {
        console.error('Falha ao criar bucket GCS:', gcs.status, gcs.body?.error ?? gcs.body)
        process.exit(1)
      }
      process.env.FIREBASE_STORAGE_BUCKET = bucketName
      console.log(gcs.status === 409 ? 'Bucket GCS já existia' : 'Bucket GCS criado:', bucketName)
      console.log('Atualize FIREBASE_STORAGE_BUCKET e NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET para', bucketName)
    } else {
      console.log('Bucket criado:', created.body?.name ?? created.body)
    }
  }

  const targetBucket = process.env.FIREBASE_STORAGE_BUCKET
  if (!targetBucket) throw new Error('FIREBASE_STORAGE_BUCKET ausente')
  const cors = await authedFetch(
    `https://storage.googleapis.com/storage/v1/b/${targetBucket}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        cors: STORAGE_CORS,
      }),
    }
  )
  if (!cors.ok) {
    console.error('Falha ao aplicar CORS:', cors.status, cors.body?.error ?? cors.body)
    process.exit(1)
  }
  console.log('CORS aplicado em', targetBucket)
}

main().catch((err) => {
  console.error(err?.message ?? err)
  process.exit(1)
})
