import fs from 'fs/promises'
import path from 'path'
import {
  generatePresignedUploadUrl,
  getFileUrl as s3GetFileUrl,
  deleteFile as s3DeleteFile,
} from './s3'
import { getBucket } from '@/lib/firebase/admin'

const ROOT = path.join(process.cwd(), 'data', 'uploads')

export function storageDriver(): 'local' | 's3' | 'firebase' {
  const driver = process.env.STORAGE_DRIVER
  if (driver === 'firebase' || driver === 's3' || driver === 'local') return driver
  return process.env.AWS_ACCESS_KEY_ID ? 's3' : 'local'
}

export function isLocalStorage() {
  return storageDriver() === 'local'
}

function safeKey(key: string) {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('Caminho de arquivo inválido')
  }
  return normalized
}

function resolveLocal(key: string) {
  const root = path.resolve(ROOT)
  const full = path.resolve(root, safeKey(key))
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('Caminho de arquivo inválido')
  }
  return full
}

async function generateFirebaseUploadTarget(fileName: string, contentType: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const cloud_storage_path = `uploads/${Date.now()}-${safeName}`
  const [uploadUrl] = await getBucket().file(cloud_storage_path).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  })
  return { uploadUrl, cloud_storage_path }
}

export async function generateUploadTarget(fileName: string, contentType: string) {
  const driver = storageDriver()
  if (driver === 'firebase') {
    return generateFirebaseUploadTarget(fileName, contentType)
  }
  if (driver === 's3') {
    return generatePresignedUploadUrl(fileName, contentType, false)
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const cloud_storage_path = `uploads/${Date.now()}-${safeName}`
  return {
    uploadUrl: `/api/documents/local-put?key=${encodeURIComponent(cloud_storage_path)}`,
    cloud_storage_path,
  }
}

export async function writeLocalFile(key: string, body: Buffer) {
  const full = resolveLocal(key)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, body)
}

export async function writeStoredFile(key: string, body: Buffer, contentType?: string) {
  if (storageDriver() === 'firebase') {
    await getBucket().file(safeKey(key)).save(body, {
      resumable: false,
      contentType: contentType || 'application/octet-stream',
    })
    return
  }
  await writeLocalFile(key, body)
}

export async function readStoredFile(
  key: string,
  contentType: string,
  isPublic: boolean
): Promise<Buffer> {
  const driver = storageDriver()
  if (driver === 'firebase') {
    const [buf] = await getBucket().file(key).download()
    return buf
  }
  if (driver === 'local' || key.startsWith('uploads/')) {
    return fs.readFile(resolveLocal(key))
  }

  const fileUrl = await s3GetFileUrl(key, contentType, isPublic)
  const fileResponse = await fetch(fileUrl)
  if (!fileResponse.ok) {
    throw new Error('Erro ao baixar arquivo do armazenamento')
  }
  return Buffer.from(await fileResponse.arrayBuffer())
}

export async function deleteStoredFile(key: string) {
  const driver = storageDriver()
  if (driver === 'firebase') {
    try {
      await getBucket().file(key).delete({ ignoreNotFound: true })
    } catch (err: any) {
      if (err?.code !== 404) throw err
    }
    return
  }
  if (driver === 'local' || key.startsWith('uploads/')) {
    try {
      await fs.unlink(resolveLocal(key))
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err
    }
    return
  }
  await s3DeleteFile(key)
}
