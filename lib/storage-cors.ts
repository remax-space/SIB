function extraOrigins() {
  const fromEnv = (process.env.STORAGE_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
  const fromAuth = [process.env.AUTH_URL, process.env.NEXTAUTH_URL]
    .map((origin) => origin?.trim().replace(/\/$/, ''))
    .filter((origin): origin is string => Boolean(origin))
  return [...fromAuth, ...fromEnv]
}

export const STORAGE_CORS = [
  {
    origin: [
      'http://localhost:3000',
      'https://localhost:3000',
      'https://sib-ochre.vercel.app',
      'https://sib-koharikens-projects.vercel.app',
      ...extraOrigins(),
    ].filter((origin, index, list) => list.indexOf(origin) === index),
    method: ['GET', 'PUT', 'POST', 'HEAD', 'DELETE', 'OPTIONS'],
    responseHeader: ['Content-Type', 'Content-Length', 'x-goog-resumable', 'ETag'],
    maxAgeSeconds: 3600,
  },
]
