import { GoogleAuth } from 'google-auth-library'

async function main() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  const headers = { Authorization: `Bearer ${token.token}` }

  const checks = [
    'https://storage.googleapis.com/storage/v1/b?project=sib-advocacia',
    'https://serviceusage.googleapis.com/v1/projects/sib-advocacia/services/storage.googleapis.com',
    'https://serviceusage.googleapis.com/v1/projects/sib-advocacia/services/firebasestorage.googleapis.com',
    'https://cloudbilling.googleapis.com/v1/projects/sib-advocacia/billingInfo',
  ]

  for (const url of checks) {
    const response = await fetch(url, { headers })
    const body: any = await response.json()
    const summary = body.error?.message
      || body.state
      || body.billingAccountName
      || (Array.isArray(body.items) ? `buckets:${body.items.length}` : JSON.stringify(body).slice(0, 200))
    console.log(response.status, url.replace('https://', '').split('/')[0], summary)
  }
}

main().catch((err) => {
  console.error(err?.message ?? err)
  process.exit(1)
})
