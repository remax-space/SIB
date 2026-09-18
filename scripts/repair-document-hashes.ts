import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '../lib/firebase/admin'
import { readStoredFile } from '../lib/storage'

// Only repair fingerprints demonstrably produced by the old path+time bug.
// A different hash must remain an integrity failure, never be accepted silently.
async function main() {
  const ids = process.argv.slice(2).filter(arg => arg !== '--apply')
  if (!ids.length) throw new Error('Informe os IDs dos documentos; use --apply para salvar a correção.')
  const apply = process.argv.includes('--apply')
  for (const id of ids) {
    const ref = getDb().collection('documents').doc(id)
    const snapshot = await ref.get(), doc = snapshot.data()
    if (!doc) throw new Error(`Documento não encontrado: ${id}`)
    const bytes = await readStoredFile(doc.cloudStoragePath, doc.mimeType, Boolean(doc.isPublic))
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual === doc.sha256) { console.log(`${id}: hash do conteúdo já correto`); continue }
    const uploadedAt = doc.uploadedAt?.toMillis?.()
    let legacyTime: number | undefined
    if (typeof uploadedAt === 'number') {
      for (let time = Math.floor(uploadedAt); time >= uploadedAt - 10_000; time--) {
        if (createHash('sha256').update(`${doc.cloudStoragePath}-${time}`).digest('hex') === doc.sha256) { legacyTime = time; break }
      }
    }
    if (legacyTime === undefined) throw new Error(`${id}: divergência não corresponde ao bug antigo; nenhuma alteração feita neste documento`)
    if (apply) {
      await getDb().runTransaction(async tx => {
        const current = (await tx.get(ref)).data()
        if (current?.sha256 !== doc.sha256 || current?.cloudStoragePath !== doc.cloudStoragePath) throw new Error('Documento mudou durante a correção')
        tx.update(ref, { sha256: actual, fileSize: bytes.length, hashCorrection: {
          previousValue: doc.sha256, legacyTime, correctedAt: Timestamp.now(),
          reason: 'LEGACY_PATH_TIMESTAMP_HASH',
          note: 'Referência de integridade estabelecida a partir do arquivo armazenado nesta data; não comprova o conteúdo no momento do upload original.',
        } })
      })
    }
    console.log(`${id}: bug antigo confirmado; ${apply ? 'hash corrigido com histórico preservado' : 'correção disponível (--apply)'}`)
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
