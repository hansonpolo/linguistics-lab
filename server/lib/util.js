/** 行数据 JSON 字段解析与小工具 */
export function parseJSON(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function noteRow(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseJSON(row.tags, []),
    books: parseJSON(row.books, []),
    refs: parseJSON(row.refs, []),
  };
}

export function cardRow(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseJSON(row.tags, []),
    suspended: !!row.suspended,
  };
}

export function questionRow(row) {
  if (!row) return null;
  return {
    ...row,
    options: parseJSON(row.options, []),
    rubric: parseJSON(row.rubric, []),
    tags: parseJSON(row.tags, []),
  };
}

export function conceptRow(row) {
  if (!row) return null;
  return { ...row, aliases: parseJSON(row.aliases, []) };
}

export function newId(prefix = "x") {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** 粗略中文分词：按标点/空白切分，并保留 2-4 字连续片段用于检索 */
export function tokenize(text = "") {
  const clean = String(text).replace(/[【】\[\]（）()《》「」“”"'，。？！；：、\n\r\t]/g, " ");
  const chunks = clean.split(/\s+/).filter(Boolean);
  const tokens = new Set();
  for (const c of chunks) {
    if (/^[a-zA-Z]+$/.test(c)) {
      tokens.add(c.toLowerCase());
      continue;
    }
    for (let i = 0; i < c.length; i++) {
      for (let n = 2; n <= 4 && i + n <= c.length; n++) tokens.add(c.slice(i, i + n));
    }
    tokens.add(c);
  }
  return [...tokens];
}

export function stripMarkdown(md = "") {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/\[\[[^\]]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[\^[^\]]*\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
