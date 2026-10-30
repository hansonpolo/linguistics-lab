// 受限沙箱中 esbuild 无法启动子进程服务。
// 本项目只用到 esbuild 的 define 替换能力，这里提供等价的纯 JS 实现；
// esbuild-loader.mjs 把 "esbuild" 说明符指向本模块。
export const version = "0.24.2";

const SPECIAL = ".*+?^${}()|[]\\";

function escapeRe(str) {
  let out = "";
  for (const ch of str) out += SPECIAL.includes(ch) ? "\\" + ch : ch;
  return out;
}

function applyDefine(code, define = {}) {
  let out = code;
  for (const [key, value] of Object.entries(define || {})) {
    if (value === undefined) continue;
    const lit = JSON.stringify(value);
    const re = new RegExp("(?<![\\w$.])" + escapeRe(key) + "(?![\\w$])", "g");
    out = out.replace(re, lit);
  }
  return out;
}

export function transformSync(code, opts = {}) {
  return { code: applyDefine(String(code), opts.define), map: "", warnings: [], legalComments: "" };
}

export async function transform(code, opts = {}) {
  return transformSync(code, opts);
}

export function formatMessagesSync(msgs = []) {
  return msgs.map((m) => String(m.text ?? m));
}

export function formatMessages(msgs = []) {
  return Promise.resolve(formatMessagesSync(msgs));
}

export function analyzeMetafileSync() {
  return "";
}

export function build() {
  throw new Error("esbuild build is unavailable: child processes are blocked in this sandbox");
}

export const buildSync = build;

export function context() {
  throw new Error("esbuild context is unavailable: child processes are blocked in this sandbox");
}

export function stop() {}

export default {
  version, transform, transformSync, formatMessages, formatMessagesSync,
  analyzeMetafileSync, build, buildSync, context, stop,
};
