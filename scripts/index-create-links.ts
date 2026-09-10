import { getDb } from '../lib/firebase/admin'

const queries = [
  {
    name: 'documents(caseId, uploadedAt desc)',
    run: () => getDb().collection('documents').where('caseId', '==', '_probe').orderBy('uploadedAt', 'desc').limit(1).get(),
  },
  {
    name: 'analyses(caseId, createdAt desc)',
    run: () => getDb().collection('analyses').where('caseId', '==', '_probe').orderBy('createdAt', 'desc').limit(1).get(),
  },
  {
    name: 'cases(status, createdAt desc)',
    run: () => getDb().collection('cases').where('status', '==', '_probe').orderBy('createdAt', 'desc').limit(1).get(),
  },
  {
    name: 'cases(classText, createdAt desc)',
    run: () => getDb().collection('cases').where('classText', '==', '_probe').orderBy('createdAt', 'desc').limit(1).get(),
  },
  {
    name: 'cases(status, classText, createdAt desc)',
    run: () =>
      getDb()
        .collection('cases')
        .where('status', '==', '_probe')
        .where('classText', '==', '_probe')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get(),
  },
]

async function main() {
  for (const query of queries) {
    try {
      await query.run()
      console.log(`OK (índice já serve): ${query.name}`)
    } catch (err: any) {
      const text = String(err?.message ?? err)
      const url = text.match(/https:\/\/[^\s]+/)?.[0]
      console.log(`FALTA: ${query.name}`)
      console.log(url ?? text)
      console.log('')
    }
  }
}

main().catch((err) => {
  console.error(err?.message ?? err)
  process.exit(1)
})
