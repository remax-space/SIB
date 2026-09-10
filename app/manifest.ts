import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SIB — Sistema de Inteligência Basile',
    short_name: 'SIB',
    description: 'Sistema de Inteligência Basile — análise jurídica com IA',
    start_url: '/',
    display: 'standalone',
    background_color: '#0D0F14',
    theme_color: '#0D0F14',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
