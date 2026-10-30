import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, getSettings, setSetting, indexNoteLinks, ensureSettings } from "../db.js";
import { parseJSON, noteRow, cardRow, questionRow, newId } from "../lib/util.js";

export const tools = Router();

/* ================= 参考文献（GB/T 7714-2015） ================= */

const TYPE_CODE = {
  book: "M", journal: "J", thesis: "D", chapter: "C", report: "R",
  standard: "S", newspaper: "N", web: "EB/OL", patent: "P",
};

function authorList(raw) {
  if (!raw) return "";
  const parts = String(raw)
    .split(/[;；,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length > 3) return `${parts.slice(0, 3).join(", ")}, 等`;
  return parts.join(", ");
}

function init(name) {
  if (!name) return "";
  return String(name).split(/\s+/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

/**
 * 依据 GB/T 7714-2015 生成著录条目
 * input: {type, authors, title, place, publisher, year, edition, volume, issue, pages, journal, school, url, accessed, translator, isbn}
 */
export function formatReference(input = {}) {
  const {
    type = "book", authors = "", title = "", place = "", publisher = "", year = "",
    edition = "", volume = "", issue = "", pages = "", journal = "", school = "",
    url = "", accessed = "", translator = "", newspaper = "", date = "",
  } = input;
  const code = TYPE_CODE[type] || "M";
  const A = authorList(authors);
  const T = String(title).trim();
  if (!T) return "";
  const yearPart = year ? `${place ? place + ": " : ""}${publisher || school || ""}${publisher || school ? ", " : ""}${year}` : "";
  const pagePart = pages ? `: ${pages}` : "";

  switch (type) {
    case "journal":
      return `${A ? A + ". " : ""}${T}[J]. ${journal || ""}${journal ? ", " : ""}${year}${volume ? `, ${volume}` : ""}${issue ? `(${issue})` : ""}${pagePart}.`;
    case "thesis":
      return `${A ? A + ". " : ""}${T}[D]. ${place || "北京"}: ${school || ""}, ${year}.`;
    case "chapter":
      return `${A ? A + ". " : ""}${T}[M]//${publisher || ""}. ${journal || ""}. ${place || "北京"}: ${publisher || ""}, ${year}${pagePart}.`;
    case "report":
      return `${A ? A + ". " : ""}${T}[R]. ${place || ""}: ${publisher || ""}, ${year}.`;
    case "standard":
      return `${A ? A + ". " : ""}${T}[S]. ${place || "北京"}: ${publisher || ""}, ${year}.`;
    case "newspaper":
      return `${A ? A + ". " : ""}${T}[N]. ${newspaper || ""}, ${date || year}${pagePart}.`;
    case "web":
      return `${A ? A + ". " : ""}${T}[EB/OL]. (${date || year})[${accessed || year}]. ${url}.`;
    default: {
      const ed = edition ? `${edition}版. ` : "";
      const tr = translator ? `${translator}, 译. ` : "";
      return `${A ? A + ". " : ""}${T}[${code}]. ${ed}${tr}${yearPart}${pagePart}.`;
    }
  }
}

tools.post("/tools/refs", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body || {}];
  const out = items.map((it, i) => ({
    index: i + 1,
    text: formatReference(it),
  })).filter((x) => x.text);
  res.json({ items: out, style: "GB/T 7714-2015" });
});

/* ================= 设置 ================= */

tools.get("/settings", (_req, res) => {
  const s = getSettings();
  if (s.ai_key) s.ai_key_set = "1";
  delete s.ai_key;
  res.json({ settings: s });
});

tools.put("/settings", (req, res) => {
  const allowed = ["retention", "new_per_day", "review_per_day", "theme", "ai_base_url",
    "ai_model", "ai_key", "daily_goal", "exam_minutes"];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    if (v === undefined || v === null) continue;
    setSetting(k, v);
  }
  ensureSettings();
  res.json({ ok: true });
});

/* ================= 导入 / 导出 ================= */

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch === "\r") { /* skip */ }
    else cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

tools.post("/import/cards", (req, res) => {
  const { data = "", format = "csv", noteId = null, tags = [] } = req.body || {};
  let rows = [];
  if (format === "json") {
    try {
      const arr = typeof data === "string" ? JSON.parse(data) : data;
      rows = (Array.isArray(arr) ? arr : arr.cards || []).map((c) => ({
        front: c.front || c.Front || c.正面 || "",
        back: c.back || c.Back || c.背面 || "",
        type: c.type || "basic",
        tags: c.tags || tags,
        note_id: c.note_id || noteId,
      }));
    } catch {
      return res.status(400).json({ error: "JSON 解析失败" });
    }
  } else {
    const table = parseCSV(data);
    if (!table.length) return res.status(400).json({ error: "没有可导入的内容" });
    const header = table[0].map((h) => h.trim().toLowerCase());
    const hasHeader = header.some((h) => ["front", "back", "正面", "背面", "question", "answer"].includes(h));
    const body = hasHeader ? table.slice(1) : table;
    const idx = (names, fallback) => {
      const i = header.findIndex((h) => names.includes(h));
      return i >= 0 ? i : fallback;
    };
    const fi = hasHeader ? idx(["front", "question", "正面", "问题"], 0) : 0;
    const bi = hasHeader ? idx(["back", "answer", "背面", "答案"], 1) : 1;
    const ti = hasHeader ? idx(["tags", "tag", "标签"], -1) : -1;
    rows = body.map((r) => ({
      front: (r[fi] || "").trim(),
      back: (r[bi] || "").trim(),
      type: "basic",
      tags: ti >= 0 && r[ti] ? r[ti].split(/[ ,，;；]+/).filter(Boolean) : tags,
      note_id: noteId,
    })).filter((r) => r.front);
  }
  if (!rows.length) return res.status(400).json({ error: "未解析到有效卡片" });

  const ins = db.prepare(`INSERT INTO cards(id, note_id, type, front, back, image, tags, due,
    stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,0,0,0,0,0,0,0,NULL,?,?)`);
  const now = new Date().toISOString();
  let n = 0;
  for (const r of rows) {
    const id = newId("i");
    ins.run(id, r.note_id, r.type, r.front, r.back, "", JSON.stringify(r.tags || []), now, now, now);
    n++;
  }
  db.prepare("INSERT INTO imports(kind, filename, count, created_at) VALUES('cards',?,?,?)")
    .run(noteId || "混合", n, now);
  res.json({ imported: n });
});

tools.get("/export", (req, res) => {
  const scope = String(req.query.scope || "all");
  const payload = {
    app: "yuyanxue-lab",
    version: 1,
    exportedAt: new Date().toISOString(),
    chapters: db.prepare("SELECT * FROM chapters").all(),
    notes: db.prepare("SELECT * FROM notes").all().map(noteRow),
    cards: db.prepare("SELECT * FROM cards").all().map(cardRow),
    questions: db.prepare("SELECT * FROM questions").all().map(questionRow),
    annotations: db.prepare("SELECT * FROM annotations").all(),
    reviews: scope === "all" ? db.prepare("SELECT * FROM reviews").all() : [],
    settings: Object.fromEntries(
      Object.entries(getSettings()).filter(([k]) => k !== "ai_key")
    ),
  };
  if (scope === "notes") return res.json({ notes: payload.notes, chapters: payload.chapters });
  if (scope === "cards") return res.json({ cards: payload.cards });
  if (scope === "questions") return res.json({ questions: payload.questions });
  res.json(payload);
});

tools.get("/export/cards.csv", (_req, res) => {
  const rows = db.prepare("SELECT * FROM cards").all();
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["front,back,tags,type,note_id"];
  for (const r of rows) lines.push([r.front, r.back, parseJSON(r.tags, []).join(" "), r.type, r.note_id || ""].map(esc).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="lingua-cards.csv"');
  res.send("\uFEFF" + lines.join("\r\n"));
});

tools.post("/import/backup", (req, res) => {
  const data = req.body || {};
  const now = new Date().toISOString();
  let stats = { chapters: 0, notes: 0, cards: 0, questions: 0 };
  try {
    if (Array.isArray(data.chapters)) {
      const ins = db.prepare("INSERT OR REPLACE INTO chapters(id,parent,title,ord,summary,tags) VALUES(?,?,?,?,?,?)");
      for (const c of data.chapters) {
        ins.run(c.id, c.parent ?? null, c.title, c.order ?? c.ord ?? 0, c.summary ?? "",
          JSON.stringify(c.tags ?? []));
        stats.chapters++;
      }
    }
    if (Array.isArray(data.notes)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO notes(id, chapter, title, summary, content, tags, books, refs,
        source, pinned, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const n of data.notes) {
        ins.run(n.id, n.chapter ?? null, n.title, n.summary ?? "", n.content, JSON.stringify(n.tags ?? []),
          JSON.stringify(n.books ?? []), JSON.stringify(n.refs ?? []), n.source ?? "import",
          n.pinned ? 1 : 0, n.created_at || now, now);
        stats.notes++;
      }
      for (const n of data.notes) indexNoteLinks(n.id, n.content);
    }
    if (Array.isArray(data.cards)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO cards(id, note_id, type, front, back, image, tags, due,
        stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, suspended,
        created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const c of data.cards) {
        ins.run(c.id, c.note_id ?? null, c.type ?? "basic", c.front, c.back ?? "", c.image ?? "",
          JSON.stringify(c.tags ?? []), c.due || now, c.stability || 0, c.difficulty || 0,
          c.elapsed_days || 0, c.scheduled_days || 0, c.reps || 0, c.lapses || 0, c.state || 0,
          c.last_review || null, c.suspended ? 1 : 0, c.created_at || now, now);
        stats.cards++;
      }
    }
    if (Array.isArray(data.questions)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO questions(id, chapter, type, stem, options, answer,
        rubric, analysis, difficulty, tags, source, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const q of data.questions) {
        ins.run(q.id, q.chapter ?? null, q.type, q.stem, JSON.stringify(q.options ?? []), q.answer ?? "",
          JSON.stringify(q.rubric ?? []), q.analysis ?? "", q.difficulty ?? 2,
          JSON.stringify(q.tags ?? []), q.source ?? "import", q.created_at || now);
        stats.questions++;
      }
    }
    res.json({ ok: true, stats });
  } catch (e) {
    res.status(400).json({ error: `导入失败：${e.message}`, stats });
  }
});

tools.get("/imports", (_req, res) => {
  res.json({ imports: db.prepare("SELECT * FROM imports ORDER BY created_at DESC LIMIT 20").all() });
});

tools.get("/backup/file", (_req, res) => {
  const src = path.join(DATA_DIR, "lingua.db");
  res.download(src, `lingua-backup-${Date.now()}.db`);
});

tools.get("/about", (_req, res) => {
  const files = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : [];
  res.json({
    dataDir: DATA_DIR,
    files,
    node: process.version,
    uptime: Math.round(process.uptime()),
  });
});
