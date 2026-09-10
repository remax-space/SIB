export class UniqueConstraintError extends Error {
  code = 'P2002' as const

  constructor(message = 'Já existe um registro com este valor único') {
    super(message)
    this.name = 'UniqueConstraintError'
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Registro não encontrado') {
    super(message)
    this.name = 'NotFoundError'
  }
}
