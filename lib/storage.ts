import fs from 'fs/promises'
import path from 'path'
import {
  generatePresignedUploadUrl,
  getFileUrl as s3GetFileUrl,
  deleteFile as s3DeleteFile,
} from './s3'

const ROOT = path.join(process.cwd(), 'data', 'uploads')

export function isLocalStorage() {
  if (process.env.STORAGE_DRIVER === 's3') return false
  if (process.env.STORAGE_DRIVER === 'local') return true
  return !process.env.AWS_ACCESS_KEY_ID
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

export async function generateUploadTarget(fileName: string, contentType: string) {
  if (!isLocalStorage()) {
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

export async function readStoredFile(
  key: string,
  contentType: string,
  isPublic: boolean
): Promise<Buffer> {
  if (isLocalStorage() || key.startsWith('uploads/')) {
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
  if (isLocalStorage() || key.startsWith('uploads/')) {
    try {
      await fs.unlink(resolveLocal(key))
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err
    }
    return
  }
  await s3DeleteFile(key)
}
