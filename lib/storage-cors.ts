export const STORAGE_CORS = [
  {
    origin: [
      'http://localhost:3000',
      'https://localhost:3000',
      'https://sib-ochre.vercel.app',
      'https://sib-koharikens-projects.vercel.app',
    ],
    method: ['GET', 'PUT', 'POST', 'HEAD', 'DELETE', 'OPTIONS'],
    responseHeader: ['Content-Type', 'Content-Length', 'x-goog-resumable', 'ETag'],
    maxAgeSeconds: 3600,
  },
  {
    origin: ['*'],
    method: ['GET', 'PUT', 'HEAD', 'OPTIONS'],
    responseHeader: ['Content-Type', 'Content-Length', 'x-goog-resumable'],
    maxAgeSeconds: 3600,
  },
]
