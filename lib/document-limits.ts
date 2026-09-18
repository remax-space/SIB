export const MAX_PDF_BYTES = 200 * 1024 * 1024
export const PDF_SIZE_ERROR = 'O PDF deve ter até 200 MB.'

export function validatePdfSize(size: number) {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Arquivo vazio ou tamanho inválido.')
  if (size > MAX_PDF_BYTES) throw new Error(PDF_SIZE_ERROR)
}
