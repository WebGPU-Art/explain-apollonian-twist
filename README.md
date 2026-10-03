# Explain Apollonian Twist

交互式讲解 [soluble](https://github.com/WebGPU-Art/soluble) 里的 `apollonian-twist.wgsl` 着色器:折叠、球反演、Apollonian 距离估计、第四维扭转、包围球与卫星团簇、光线步进、法线与着色。

- `index.html`:分节讲解,每节带可交互的 WebGPU / Canvas 演示
- `play.html`:全屏 3D,所有参数可调
- `src/apollonian-twist.wgsl`:原始着色器(只用于页面展示源码)
- `src/scene3d.js`:原着色器的可调版本(常量换成 uniform,并加了调试视图)

需要支持 WebGPU 的浏览器。

```bash
yarn
yarn dev
```

推送到 `main` 后由 `.github/workflows/upload.yaml` 构建并上传(静态资源走 COS CDN,页面 rsync 到服务器)。
