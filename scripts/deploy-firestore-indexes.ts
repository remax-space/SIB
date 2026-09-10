import { readFileSync } from 'fs'
import path from 'path'
import { v1 } from '@google-cloud/firestore-api'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'sib-advocacia'
const DATABASE = '(default)'

type IndexField = { fieldPath: string; order?: string; arrayConfig?: string }
type IndexDef = { collectionGroup: string; queryScope: string; fields: IndexField[] }

function signature(collectionGroup: string, queryScope: string, fields: IndexField[]) {
  const relevant = (fields ?? []).filter((field) => field.fieldPath !== '__name__')
  return [
    collectionGroup,
    queryScope,
    ...relevant.map((field) => `${field.fieldPath}:${field.order ?? field.arrayConfig ?? ''}`),
  ].join('|')
}

async function main() {
  const wanted = JSON.parse(readFileSync(path.resolve(process.cwd(), 'firestore.indexes.json'), 'utf8')).indexes as IndexDef[]

  const client = new v1.FirestoreAdminClient({
    projectId: PROJECT_ID,
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    },
    fallback: true,
  })

  const parentAll = `projects/${PROJECT_ID}/databases/${DATABASE}/collectionGroups/-`
  const [existing] = await client.listIndexes({ parent: parentAll })

  const existingSigs = new Set(
    (existing ?? []).map((index) => {
      const collectionGroup = String(index.name ?? '').split('/collectionGroups/')[1]?.split('/')[0] ?? ''
      return signature(collectionGroup, String(index.queryScope ?? 'COLLECTION'), (index.fields ?? []) as IndexField[])
    })
  )

  console.log(`Índices atuais via SDK: ${existing?.length ?? 0}`)

  let created = 0
  for (const index of wanted) {
    const sig = signature(index.collectionGroup, index.queryScope, index.fields)
    if (existingSigs.has(sig)) {
      console.log(`Já existe: ${sig}`)
      continue
    }

    const parent = `projects/${PROJECT_ID}/databases/${DATABASE}/collectionGroups/${index.collectionGroup}`
    try {
      const [operation] = await client.createIndex({
        parent,
        index: {
          queryScope: index.queryScope as any,
          fields: index.fields.map((field) => ({
            fieldPath: field.fieldPath,
            order: field.order as any,
            arrayConfig: field.arrayConfig as any,
          })),
        },
      })
      created += 1
      console.log(`Publicado: ${sig}`)
      if (typeof operation?.name === 'string') {
        console.log(`  operação: ${operation.name}`)
      }
    } catch (err: any) {
      const code = err?.code
      const message = String(err?.details ?? err?.message ?? err)
      if (code === 6 || /ALREADY_EXISTS/i.test(message)) {
        console.log(`Já existe: ${sig}`)
        continue
      }
      throw err
    }
  }

  if (created === 0) {
    console.log('Nenhum índice novo era necessário.')
    return
  }
  console.log(`${created} índice(s) enviado(s) pelo Firestore Admin SDK. A construção pode levar alguns minutos.`)
}

main().catch((err) => {
  console.error(err?.details ?? err?.message ?? err)
  process.exit(1)
})
