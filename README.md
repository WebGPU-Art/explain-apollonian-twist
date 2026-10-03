# Explain Apollian Twist

交互式讲解 Shadertoy [Apollian with a twist (Wl3fzM)](https://www.shadertoy.com/view/Wl3fzM)(CC0):折叠、球反演、距离估计、第四维 twist、两层缩放、地板与两盏灯的阴影、配色辉光与后处理。

- `index.html`:分节讲解,每节带可交互的 WebGPU / Canvas 演示
- `play.html`:全屏,所有参数可调
- `src/shader.js`:原 GLSL 的 WGSL 移植(常量换成 uniform)
- `src/apollian-twist.glsl`:原始 GLSL,仅用于页面展示

需要支持 WebGPU 的浏览器。

```bash
yarn
yarn dev
```

推送到 `main` 后由 `.github/workflows/upload.yaml` 构建并上传(静态资源走 COS CDN,页面 rsync 到服务器)。
