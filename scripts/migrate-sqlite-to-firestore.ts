import { PrismaClient } from '@prisma/client'
import { Timestamp } from 'firebase-admin/firestore'
import fs from 'fs/promises'
import path from 'path'
import { getBucket, getDb } from '../lib/firebase/admin'
import { saveExtractedText } from '../lib/repo/text-store'

const dryRun = process.argv.includes('--dry-run')
const prisma = new PrismaClient()

function ts(value: Date | null | undefined) {
  return value ? Timestamp.fromDate(value) : null
}

async function copyLocalFile(cloudPath: string) {
  if (!cloudPath) return
  const local = path.resolve(process.cwd(), 'data', cloudPath)
  try {
    const buf = await fs.readFile(local)
    if (dryRun) {
      console.log(`  [dry-run] upload ${cloudPath} (${buf.length} bytes)`)
      return
    }
    await getBucket().file(cloudPath).save(buf, { resumable: false })
    console.log(`  uploaded ${cloudPath}`)
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      console.log(`  skip missing local file ${cloudPath}`)
      return
    }
    console.warn(`  failed to upload ${cloudPath}:`, err?.message ?? err)
  }
}

async function main() {
  console.log(dryRun ? 'Dry-run: lendo SQLite sem gravar no Firestore' : 'Migrando SQLite -> Firestore')

  const [users, cases, documents, analyses, providers, settings, licenses] = await Promise.all([
    prisma.user.findMany(),
    prisma.case.findMany(),
    prisma.document.findMany(),
    prisma.analysis.findMany(),
    prisma.providerConfig.findMany(),
    prisma.setting.findMany(),
    prisma.license.findMany(),
  ])

  console.log({
    users: users.length,
    cases: cases.length,
    documents: documents.length,
    analyses: analyses.length,
    providers: providers.length,
    settings: settings.length,
    licenses: licenses.length,
  })

  if (dryRun) {
    console.log('Dry-run concluído.')
    return
  }

  const db = getDb()

  for (const user of users) {
    await db.collection('users').doc(user.email.toLowerCase()).set({
      id: user.id,
      email: user.email.toLowerCase(),
      password: user.password,
      name: user.name,
      role: user.role,
      createdAt: ts(user.createdAt),
    })
  }

  for (const item of cases) {
    const documentCount = documents.filter((d) => d.caseId === item.id).length
    const analysisCount = analyses.filter((a) => a.caseId === item.id).length
    await db.collection('cases').doc(item.id).set({
      caseId: item.caseId,
      title: item.title,
      clientName: item.clientName,
      clientDoc: item.clientDoc,
      classText: item.classText,
      primaryRole: item.primaryRole,
      status: item.status,
      objective: item.objective,
      notes: item.notes,
      cutoffDate: item.cutoffDate,
      documentCount,
      analysisCount,
      createdAt: ts(item.createdAt),
      updatedAt: ts(item.updatedAt),
    })
  }

  for (const doc of documents) {
    await db.collection('documents').doc(doc.id).set({
      caseId: doc.caseId,
      filename: doc.filename,
      cloudStoragePath: doc.cloudStoragePath,
      isPublic: doc.isPublic,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      sha256: doc.sha256,
      readStatus: doc.readStatus,
      extractedTextPreview: doc.extractedText ? doc.extractedText.slice(0, 2000) : null,
      textLength: doc.extractedText?.length ?? 0,
      pageCount: doc.pageCount,
      uploadedAt: ts(doc.uploadedAt),
    })
    if (doc.extractedText) {
      try {
        await saveExtractedText(doc.id, doc.extractedText)
      } catch (err: any) {
        console.warn(`  extractedText Storage falhou para ${doc.id}:`, err?.message ?? err)
      }
    }
    await copyLocalFile(doc.cloudStoragePath)
  }

  for (const analysis of analyses) {
    await db.collection('analyses').doc(analysis.id).set({
      caseId: analysis.caseId,
      jobId: analysis.jobId,
      missionLiteral: analysis.missionLiteral,
      authorizedProduct: analysis.authorizedProduct,
      provider: analysis.provider,
      modelUsed: analysis.modelUsed,
      runMode: analysis.runMode,
      status: analysis.status,
      documentIds: analysis.documentIds,
      currentAgent: analysis.currentAgent,
      basileResult: analysis.basileResult,
      advocadoResult: analysis.advocadoResult,
      cabecaResult: analysis.cabecaResult,
      auditorResult: analysis.auditorResult,
      mestreResult: analysis.mestreResult,
      orientacoesResult: analysis.orientacoesResult,
      jurisprudenciaResult: analysis.jurisprudenciaResult,
      icpScore: analysis.icpScore,
      exitCode: analysis.exitCode,
      errorDetail: analysis.errorDetail,
      createdAt: ts(analysis.createdAt),
      completedAt: ts(analysis.completedAt),
    })
  }

  for (const provider of providers) {
    await db.collection('providerConfigs').doc(provider.provider).set({
      provider: provider.provider,
      apiKey: provider.apiKey,
      model: provider.model,
      enabled: provider.enabled,
      updatedAt: ts(provider.updatedAt),
    })
  }

  for (const setting of settings) {
    await db.collection('settings').doc(setting.key).set({
      key: setting.key,
      value: setting.value,
    })
  }

  for (const license of licenses) {
    await db.collection('licenses').doc(license.id).set({
      key: license.key,
      label: license.label,
      fingerprint: license.fingerprint,
      active: license.active,
      revoked: license.revoked,
      activatedAt: ts(license.activatedAt),
      lastSeenAt: ts(license.lastSeenAt),
      notes: license.notes,
      createdAt: ts(license.createdAt),
    })
  }

  console.log('Migração concluída.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
