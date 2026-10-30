import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import katex from "katex";
import "katex/dist/katex.min.css";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
});

md.use(footnote);

/* ---- KaTeX 行内与块级公式 ---- */
function katexRender(src, display) {
  try {
    return katex.renderToString(src, {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      trust: true,
    });
  } catch (e) {
    return `<code class="katex-err">${md.utils.escapeHtml(src)}</code>`;
  }
}

md.inline.ruler.before("escape", "math_inline", (state, silent) => {
  const src = state.src;
  const pos = state.pos;
  if (src[pos] !== "$") return false;
  if (src[pos + 1] === "$") return false;
  let end = pos + 1;
  while (end < src.length) {
    if (src[end] === "\\") { end += 2; continue; }
    if (src[end] === "$") break;
    if (src[end] === "\n") return false;
    end++;
  }
  if (end >= src.length) return false;
  const content = src.slice(pos + 1, end).trim();
  if (!content) return false;
  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = content;
  }
  state.pos = end + 1;
  return true;
});

md.renderer.rules.math_inline = (tokens, idx) => katexRender(tokens[idx].content, false);

md.block.ruler.before("fence", "math_block", (state, startLine, endLine, silent) => {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const line = state.src.slice(start, max).trim();
  if (!line.startsWith("$$")) return false;
  if (silent) return true;
  let nextLine = startLine;
  let content = "";
  if (line.length > 2 && line.endsWith("$$")) {
    content = line.slice(2, -2).trim();
    nextLine = startLine + 1;
  } else {
    content = line.slice(2);
    let closed = false;
    for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
      const s = state.bMarks[nextLine] + state.tShift[nextLine];
      const e = state.eMarks[nextLine];
      const text = state.src.slice(s, e);
      const idx = text.indexOf("$$");
      if (idx >= 0) {
        content += "\n" + text.slice(0, idx);
        closed = true;
        break;
      }
      content += "\n" + text;
    }
    if (!closed) return false;
  }
  state.line = nextLine + 1;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = content.trim();
  token.map = [startLine, state.line];
  return true;
});

md.renderer.rules.math_block = (tokens, idx) =>
  `<div class="katex-block">${katexRender(tokens[idx].content, true)}</div>\n`;

/* ---- [[n05]] 笔记链接 与 [[概念:音位]] ---- */
md.inline.ruler.before("link", "wikilink", (state, silent) => {
  const src = state.src;
  const pos = state.pos;
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
  const close = src.indexOf("]]", pos + 2);
  if (close < 0) return false;
  const inner = src.slice(pos + 2, close).trim();
  if (!inner || inner.length > 60 || inner.includes("[")) return false;
  if (!silent) {
    const token = state.push("wikilink", "", 0);
    token.content = inner;
  }
  state.pos = close + 2;
  return true;
});

md.renderer.rules.wikilink = (tokens, idx, _opts, env) => {
  const inner = tokens[idx].content;
  const esc = md.utils.escapeHtml;
  if (inner.startsWith("概念:")) {
    const name = inner.slice(3).trim();
    return `<span class="wl" data-concept="${esc(name)}">${esc(name)}</span>`;
  }
  const title = env?.noteTitle?.(inner);
  return `<a class="wl" href="/library/${encodeURIComponent(inner)}" data-note="${esc(inner)}">${esc(title || inner)}</a>`;
};

/* ---- 给标题加锚点 id，便于文内目录 ---- */
md.core.ruler.push("heading_ids", (state) => {
  let i = 0;
  for (const token of state.tokens) {
    if (token.type !== "heading_open") continue;
    const inline = state.tokens[state.tokens.indexOf(token) + 1];
    const text = inline?.content || `h${i}`;
    token.attrSet("id", `h-${i}`);
    token.meta = { text };
    i++;
  }
});

/* ---- 外链新窗口 ---- */
const defaultLink = md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") || "";
  if (/^https?:/.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return defaultLink(tokens, idx, options, env, self);
};

export function renderMarkdown(src, env = {}) {
  if (!src) return "";
  return md.render(src, env);
}

export function extractHeadings(src) {
  if (!src) return [];
  const tokens = md.parse(src, {});
  const out = [];
  let i = 0;
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].type === "heading_open") {
      out.push({ id: `h-${i}`, level: Number(tokens[k].tag.slice(1)), text: tokens[k + 1]?.content || "" });
      i++;
    }
  }
  return out;
}

export default md;
