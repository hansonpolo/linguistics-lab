// 生产构建脚本。
//
// 为什么不直接 `vite build`：
//   本机（DSH 沙箱）禁止创建子进程，而 esbuild 需要启动常驻子进程，
//   Vite 在 Windows 上还会 exec("net use") 探测网络盘。两者都会 EPERM。
//   这里用 Vite 的 JS API 在进程内构建（Rollup），并用纯 JS 的 esbuild shim
//   只承担 `process.env.NODE_ENV` 之类的 define 替换；产物与常规 Vite 构建一致。
//
// 在不受限的普通环境里，`npx vite build`（即 npm run build:vite）同样可用。
import "./spawn-shim.mjs";
import { register } from "node:module";

register("./esbuild-loader.mjs", import.meta.url);

const { build } = await import("vite");
const { default: vue } = await import("@vitejs/plugin-vue");

await build({
  configFile: false,
  root: process.cwd(),
  plugins: [vue()],
  esbuild: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    cssMinify: false,
    target: "es2020",
    sourcemap: false,
  },
  define: {
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
});

console.log("✓ 构建完成：dist/");
