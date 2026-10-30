// 在 jsdom 里真正挂载一次前端，检查首屏与各路由是否有运行时错误。
// 用法：先启动 API（node server/index.js），再 node scripts/dom-check.mjs
import "./../spawn-shim.mjs";
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

register("../esbuild-loader.mjs", import.meta.url);
register("./css-loader.mjs", import.meta.url);

const { build } = await import("vite");
const { default: vue } = await import("@vitejs/plugin-vue");

const outDir = "dist-domtest";
await build({
  configFile: false,
  root: process.cwd(),
  plugins: [vue()],
  esbuild: false,
  logLevel: "error",
  build: {
    outDir,
    emptyOutDir: true,
    minify: false,
    cssMinify: false,
    target: "es2020",
    lib: { entry: "scripts/mount-entry.js", formats: ["iife"], name: "LinguaApp", fileName: () => "app.js" },
  },
  define: {
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
});

const bundle = fs.readFileSync(path.join(outDir, "app.js"), "utf8");
const BASE = "http://127.0.0.1:8787";

const dom = new JSDOM(
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>`,
  { url: BASE + "/", pretendToBeVisual: true, runScripts: "outside-only" }
);
const { window } = dom;
window.process = { env: { NODE_ENV: "production" }, platform: "browser" };
window.fetch = (input, init) => fetch(new URL(input, BASE), init);
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
window.scrollTo = () => {};
window.Element.prototype.scrollTo = () => {};
window.HTMLCanvasElement.prototype.getContext = () => null;

const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.error?.stack || e.message)));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason?.stack || e.reason)));

window.eval(bundle);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

const text = window.document.body.textContent.replace(/\s+/g, " ");
check("挂载成功", window.document.querySelector("#app")?.children.length > 0);
check("首页显示今日复习", /今日|待复习|到期/.test(text), text.slice(0, 160));
check("侧栏导航齐全", ["知识库", "知识图谱", "闪卡", "复习", "自测", "AI"].every((k) => text.includes(k)), text.slice(0, 200));
check("章节数据已加载", text.includes("导论"), text.slice(0, 300));
check("没有 Vue 运行时错误", (window.__vueErrors || []).length === 0, JSON.stringify(window.__vueErrors).slice(0, 300));
check("没有未捕获异常", errors.length === 0, errors.join(" | ").slice(0, 300));

// 逐个路由切换（history.pushState + popstate）
const router = window.__router;
async function go(p) {
  window.history.pushState({}, "", p);
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  await sleep(450);
  return window.document.body.textContent.replace(/\s+/g, " ");
}

const routes = {
  "/library": /知识库|笔记|章节/,
  "/library/n08": /音素是从音质角度/,
  "/graph": /图谱|概念/,
  "/cards": /闪卡|卡片/,
  "/review": /复习|开始/,
  "/quiz": /题库|组卷/,
  "/wrongbook": /错题/,
  "/ai": /答疑|背诵|考点/,
  "/tools": /IPA|参考文献|设置/,
};

for (const [p, re] of Object.entries(routes)) {
  const t = await go(p);
  check(`路由 ${p} 渲染`, re.test(t), t.slice(0, 100));
}

// 交互：打开命令面板
const kb = new window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
window.dispatchEvent(kb);
await sleep(300);
const paletteOpen = /搜索|笔记|概念/.test(window.document.body.textContent);
check("⌘K 命令面板可打开", paletteOpen);
check("路由切换无新增错误", (window.__vueErrors || []).length === 0, JSON.stringify(window.__vueErrors).slice(0, 200));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log("errors:", errors.slice(0, 3));
process.exit(fail ? 1 : 0);
