import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相対パスにして、どの URL 配下に置いても動くようにする（Hash ルーターのため URL の書き換えは不要）。
  base: './',
  plugins: [
    react(),
    // NFR-6: 初回読み込み後は、ネットワークなしで全機能を使えるようにする。
    // generateSW で、ビルドで出力される全アセットをプリキャッシュする（外部 CDN は使わない）。
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: '筋トレ管理',
        short_name: '筋トレ管理',
        description: '筋トレの記録・履歴・推移を管理するアプリ（データは端末内に保存）',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1f2937',
        background_color: '#1f2937',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
