import { randomBytes } from 'crypto'

export function createId() {
  return randomBytes(12).toString('hex')
}
