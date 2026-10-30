// 回归：笔记详情页必须渲染标题、正文、反链与关联闪卡
import fs from "node:fs";
import { JSDOM } from "jsdom";

const BASE = "http://127.0.0.1:8787";
const js = fs.readFileSync("dist-domtest/app.js", "utf8");
const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div></body></html>`, {
  url: BASE + "/library/n08", runScripts: "outside-only", pretendToBeVisual: true,
});
const w = dom.window;
w.process = { env: { NODE_ENV: "production" }, platform: "browser" };
w.fetch = (i, o) => fetch(new URL(i, BASE), o);
w.Element.prototype.scrollTo = () => {};
w.HTMLCanvasElement.prototype.getContext = () => null;
w.eval(js);
await new Promise((r) => setTimeout(r, 900));
const body = w.document.body.textContent.replace(/\s+/g, " ");
const checks = [
  ["标题", /音素与音位/],
  ["正文", /音素是从音质角度/],
  ["反向链接", /反向链接/],
  ["关联闪卡", /关联闪卡/],
  ["参考文献", /参考文献|GB\/T 7714/],
  ["上下篇", /上一篇|下一篇/],
];
let bad = 0;
for (const [name, re] of checks) {
  const ok = re.test(body);
  if (!ok) bad++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
}
console.log(`\n${checks.length - bad} passed, ${bad} failed`);
