import { getBucket } from '../lib/firebase/admin'

async function main() {
  const bucket = getBucket()
  const file = bucket.file('_healthcheck.txt')
  await file.save(`ok ${new Date().toISOString()}`, { contentType: 'text/plain', resumable: false })
  const [buf] = await file.download()
  await file.delete({ ignoreNotFound: true })
  console.log('STORAGE_OK', bucket.name, buf.toString('utf8'))
}

main().catch((err) => {
  console.error('STORAGE_ERR', err?.message ?? err)
  process.exit(1)
})
