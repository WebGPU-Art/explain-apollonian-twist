import { defineConfig } from 'vite'
import { resolve } from 'path'

// 页面:2D 原作的讲解 + 全屏玩法,以及 soluble 3D 版的讲解 + 全屏玩法
const pages = ['index', 'play', 'twist3d', 'twist3d-play']

export default defineConfig({
  // CI 里设置 VITE_BASE_URL=https://cos-sh.tiye.me/<owner>/<repo>/ ,让 js/css 走 CDN;
  // 本地开发时未设置,走 "/"。页面之间的链接全部是相对路径,所以同时能部署在服务器子目录下。
  base: process.env.VITE_BASE_URL || '/',
  server: { port: Number(process.env.PORT) || 5173 },
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(__dirname, `${p}.html`)])),
    },
  },
})
