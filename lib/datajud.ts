const ESTADUAL: Record<string, string> = {
  '01': 'tjac',
  '02': 'tjal',
  '03': 'tjap',
  '04': 'tjam',
  '05': 'tjba',
  '06': 'tjce',
  '07': 'tjdft',
  '08': 'tjes',
  '09': 'tjgo',
  '10': 'tjma',
  '11': 'tjmt',
  '12': 'tjms',
  '13': 'tjmg',
  '14': 'tjpa',
  '15': 'tjpb',
  '16': 'tjpr',
  '17': 'tjpe',
  '18': 'tjpi',
  '19': 'tjrj',
  '20': 'tjrn',
  '21': 'tjrs',
  '22': 'tjro',
  '23': 'tjrr',
  '24': 'tjsc',
  '25': 'tjsp',
  '26': 'tjse',
  '27': 'tjto',
}

const TRABALHO: Record<string, string> = {
  '01': 'trt1',
  '02': 'trt2',
  '03': 'trt3',
  '04': 'trt4',
  '05': 'trt5',
  '06': 'trt6',
  '07': 'trt7',
  '08': 'trt8',
  '09': 'trt9',
  '10': 'trt10',
  '11': 'trt11',
  '12': 'trt12',
  '13': 'trt13',
  '14': 'trt14',
  '15': 'trt15',
  '16': 'trt16',
  '17': 'trt17',
  '18': 'trt18',
  '19': 'trt19',
  '20': 'trt20',
  '21': 'trt21',
  '22': 'trt22',
  '23': 'trt23',
  '24': 'trt24',
}

export type ParsedCnj = {
  raw: string
  digits: string
  year: string
  justice: string
  tribunal: string
  alias: string
}

const CNJ_RE = /^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/

export function normalizeCnj(input: string): string {
  return input.replace(/\D/g, '')
}

export function parseCnj(input: string): ParsedCnj | null {
  const trimmed = input.trim()
  const compact = normalizeCnj(trimmed)
  const pretty = compact.length === 20
    ? `${compact.slice(0, 7)}-${compact.slice(7, 9)}.${compact.slice(9, 13)}.${compact.slice(13, 14)}.${compact.slice(14, 16)}.${compact.slice(16)}`
    : trimmed
  const match = pretty.match(CNJ_RE) ?? compact.match(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/)
  if (!match) return null

  const [, , , year, justice, tribunal] = match
  const alias = resolveAlias(justice, tribunal)
  if (!alias) return null

  return {
    raw: pretty,
    digits: `${match[1]}${match[2]}${year}${justice}${tribunal}${match[6]}`,
    year,
    justice,
    tribunal,
    alias,
  }
}

function resolveAlias(justice: string, tribunal: string): string | null {
  if (justice === '1') return 'stf'
  if (justice === '2') return 'tst'
  if (justice === '3') return 'stj'
  if (justice === '4') return `trf${Number(tribunal)}`
  if (justice === '5') return TRABALHO[tribunal] ?? null
  if (justice === '6') return 'tse'
  if (justice === '7') return 'stm'
  if (justice === '8') return ESTADUAL[tribunal] ?? null
  if (justice === '9') return tribunal === '13' ? 'tjmsp' : tribunal === '21' ? 'tjmrs' : tribunal === '26' ? 'tjmmg' : null
  return null
}

export function datajudApiKey(): string {
  return (process.env.DATAJUD_API_KEY ?? '').trim()
}

export async function fetchDatajudProcess(numero: string): Promise<Record<string, unknown> | null> {
  const apiKey = datajudApiKey()
  const parsed = parseCnj(numero)
  if (!apiKey || !parsed) return null

  const { fetchWithTimeout } = await import('@/lib/safe-url')
  const response = await fetchWithTimeout(
    `https://api-publica.datajud.cnj.jus.br/api_publica_${parsed.alias}/_search`,
    {
      method: 'POST',
      headers: {
        Authorization: `APIKey ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: { match: { numeroProcesso: parsed.digits } },
        size: 1,
      }),
    },
    12_000
  )
  if (!response.ok) return null

  const payload = await response.json()
  const hit = payload?.hits?.hits?.[0]?._source
  return hit && typeof hit === 'object' ? (hit as Record<string, unknown>) : null
}
