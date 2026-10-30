// 校验 Markdown 渲染管线：公式、脚注、双向链接、概念链接、标题锚点。
import { register } from "node:module";
register("./css-loader.mjs", import.meta.url);
const { renderMarkdown, extractHeadings } = await import("../src/lib/markdown.js");
const { db } = await import("../server/db.js");

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

// 1. 种子笔记整体渲染
const note = db.prepare("SELECT * FROM notes WHERE id = 'n08'").get();
const html = renderMarkdown(note.content);
check("渲染出正文段落", html.includes("<p>"), html.slice(0, 80));
check("KaTeX 公式已渲染", html.includes("katex"), "");
check("脚注已渲染", html.includes("footnote"), "");
check("笔记互链转为 data-note", html.includes('data-note="n07"') || html.includes('data-note="n09"'), "");
check("概念链转为 data-concept", html.includes("data-concept"), "");
check("摘录引用块", html.includes("<blockquote"), "");
check("未执行原始 HTML（防注入）", !renderMarkdown('<script>alert(1)</script>').includes("<script>"), "");

// 2. 标题提取
const heads = extractHeadings(note.content);
check("提取到标题", heads.length >= 2, `len=${heads.length}`);
check("标题带 id", heads.every((h) => h.id), JSON.stringify(heads.slice(0, 2)));

// 3. 全部 24 篇笔记都能渲染且公式无错
const notes = db.prepare("SELECT id, content, title FROM notes").all();
let bad = [];
for (const n of notes) {
  const out = renderMarkdown(n.content);
  if (out.includes("katex-error") || out.includes("KaTeX parse error")) bad.push(n.id);
}
check("24 篇笔记公式全部解析成功", bad.length === 0, bad.join(","));

// 4. 卡片 cloze 语法检查（Review.vue 的正则）
const CLOZE = /\{\{c\d+::(.*?)(?:::(.*?))?\}\}/;
const clozeCards = db.prepare("SELECT front FROM cards WHERE type = 'cloze'").all();
const brokenCloze = clozeCards.filter((c) => !CLOZE.test(c.front));
check("填空卡均含 cloze 标记", brokenCloze.length === 0, `${brokenCloze.length} 张异常`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
