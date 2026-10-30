import { Router } from "express";
import { db, indexNoteLinks, today, touchActivity } from "../db.js";
import { noteRow, conceptRow, parseJSON, newId, stripMarkdown } from "../lib/util.js";

export const knowledge = Router();

// 批注行统一成前端友好的形状：body 同时以 note 暴露，tag 同时以 tags 数组暴露。
function annotationRow(row) {
  if (!row) return null;
  return {
    ...row,
    note: row.body || "",
    tags: row.tag ? String(row.tag).split(/[,，\s]+/).filter(Boolean) : [],
  };
}

/* ---------------- 章节 ---------------- */

function chapterStats() {
  const rows = db.prepare(`
    SELECT ch.id, ch.title, ch.parent, ch.ord, ch.summary, ch.tags,
      (SELECT COUNT(*) FROM notes n WHERE n.chapter = ch.id) AS noteCount,
      (SELECT COUNT(*) FROM cards c JOIN notes n ON n.id = c.note_id WHERE n.chapter = ch.id) AS cardCount,
      (SELECT COUNT(*) FROM cards c JOIN notes n ON n.id = c.note_id
        WHERE n.chapter = ch.id AND c.stability >= 21) AS mastered
    FROM chapters ch ORDER BY ch.ord
  `).all();
  return rows.map((r) => ({
    ...r,
    tags: parseJSON(r.tags, []),
    mastery: r.cardCount ? Math.round((r.mastered / r.cardCount) * 100) : 0,
  }));
}

knowledge.get("/chapters", (_req, res) => res.json({ chapters: chapterStats() }));

/* ---------------- 笔记 ---------------- */

knowledge.get("/notes", (req, res) => {
  const { chapter, tag, q } = req.query;
  let sql = `SELECT n.id, n.chapter, n.title, n.summary, n.tags, n.updated_at,
      (SELECT COUNT(*) FROM cards c WHERE c.note_id = n.id) AS cardCount,
      ch.ord AS chapterOrd, ch.title AS chapterTitle
    FROM notes n LEFT JOIN chapters ch ON ch.id = n.chapter WHERE 1=1`;
  const args = [];
  if (chapter) { sql += " AND n.chapter = ?"; args.push(chapter); }
  if (tag) { sql += " AND n.tags LIKE ?"; args.push(`%${tag}%`); }
  if (q) { sql += " AND (n.title LIKE ? OR n.content LIKE ?)"; args.push(`%${q}%`, `%${q}%`); }
  sql += " ORDER BY ch.ord, n.id";
  const notes = db.prepare(sql).all(...args).map((n) => ({ ...n, tags: parseJSON(n.tags, []) }));
  res.json({ notes });
});

knowledge.get("/notes/:id", (req, res) => {
  const row = db.prepare(`SELECT n.*, ch.title AS chapterTitle, ch.ord AS chapterOrd
    FROM notes n LEFT JOIN chapters ch ON ch.id = n.chapter WHERE n.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "笔记不存在" });
  const note = noteRow(row);
  const backlinks = db.prepare(`SELECT n.id, n.title FROM note_links l JOIN notes n ON n.id = l.from_id
    WHERE l.to_id = ? ORDER BY n.id`).all(note.id);
  const outlinks = db.prepare(`SELECT n.id, n.title FROM note_links l JOIN notes n ON n.id = l.to_id
    WHERE l.from_id = ? ORDER BY n.id`).all(note.id);
  const concepts = db.prepare(`SELECT c.* FROM note_concepts nc JOIN concepts c ON c.id = nc.concept_id
    WHERE nc.note_id = ? ORDER BY c.name`).all(note.id).map(conceptRow);
  const cards = db.prepare("SELECT * FROM cards WHERE note_id = ? ORDER BY id").all(note.id)
    .map((c) => ({ ...c, tags: parseJSON(c.tags, []) }));
  const annotations = db.prepare("SELECT * FROM annotations WHERE note_id = ? ORDER BY id DESC").all(note.id)
    .map(annotationRow);
  const ids = db.prepare(`SELECT n.id FROM notes n JOIN chapters ch ON ch.id = n.chapter
    WHERE n.chapter = ? ORDER BY n.id`).all(note.chapter).map((x) => x.id);
  const idx = ids.indexOf(note.id);
  const prev = idx > 0 ? db.prepare("SELECT id, title FROM notes WHERE id = ?").get(ids[idx - 1]) : null;
  const next = idx >= 0 && idx < ids.length - 1 ? db.prepare("SELECT id, title FROM notes WHERE id = ?").get(ids[idx + 1]) : null;
  res.json({ note, backlinks, outlinks, concepts, cards, annotations, prev, next });
});

knowledge.post("/notes", (req, res) => {
  const { title, chapter, content = "", summary = "", tags = [], books = [], refs = [] } = req.body || {};
  if (!title) return res.status(400).json({ error: "标题不能为空" });
  const id = req.body.id || newId("u");
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO notes(id, chapter, title, summary, content, tags, books, refs, source, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, chapter || null, title, summary, content, JSON.stringify(tags),
    JSON.stringify(books), JSON.stringify(refs), "user", now, now
  );
  indexNoteLinks(id, content);
  res.json({ note: noteRow(db.prepare("SELECT * FROM notes WHERE id = ?").get(id)) });
});

knowledge.put("/notes/:id", (req, res) => {
  const cur = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "笔记不存在" });
  const b = req.body || {};
  const next = {
    title: b.title ?? cur.title,
    chapter: b.chapter ?? cur.chapter,
    summary: b.summary ?? cur.summary,
    content: b.content ?? cur.content,
    tags: b.tags ? JSON.stringify(b.tags) : cur.tags,
    books: b.books ? JSON.stringify(b.books) : cur.books,
    refs: b.refs ? JSON.stringify(b.refs) : cur.refs,
    pinned: b.pinned === undefined ? cur.pinned : b.pinned ? 1 : 0,
  };
  db.prepare(`UPDATE notes SET title=?, chapter=?, summary=?, content=?, tags=?, books=?, refs=?,
    pinned=?, updated_at=? WHERE id=?`).run(
    next.title, next.chapter, next.summary, next.content, next.tags, next.books, next.refs,
    next.pinned, new Date().toISOString(), req.params.id
  );
  if (b.content !== undefined || b.title !== undefined) indexNoteLinks(req.params.id, next.content);
  res.json({ note: noteRow(db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id)) });
});

knowledge.delete("/notes/:id", (req, res) => {
  db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM note_links WHERE from_id = ? OR to_id = ?").run(req.params.id, req.params.id);
  db.prepare("DELETE FROM note_concepts WHERE note_id = ?").run(req.params.id);
  db.prepare("DELETE FROM annotations WHERE note_id = ?").run(req.params.id);
  db.prepare("DELETE FROM cards WHERE note_id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- 批注 / 摘录 ---------------- */

knowledge.post("/notes/:id/annotations", (req, res) => {
  const b = req.body || {};
  const quote = b.quote || "";
  const body = b.body || b.note || "";
  const tag = b.tag || (Array.isArray(b.tags) ? b.tags.join(",") : b.tags) || "";
  if (!body && !quote) return res.status(400).json({ error: "内容不能为空" });
  const info = db.prepare("INSERT INTO annotations(note_id, quote, body, tag, created_at) VALUES(?,?,?,?,?)")
    .run(req.params.id, quote, body, tag, new Date().toISOString());
  const row = db.prepare("SELECT * FROM annotations WHERE id = ?").get(info.lastInsertRowid);
  res.json({ annotation: annotationRow(row) });
});

knowledge.delete("/annotations/:id", (req, res) => {
  db.prepare("DELETE FROM annotations WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- 概念与图谱 ---------------- */

knowledge.get("/concepts", (req, res) => {
  const rows = db.prepare("SELECT * FROM concepts ORDER BY chapter, name").all().map(conceptRow);
  res.json({ concepts: rows });
});

knowledge.get("/concepts/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM concepts WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "概念不存在" });
  const concept = conceptRow(row);
  const rels = db.prepare(`SELECT r.type, c.id, c.name, c.school FROM concept_relations r
    JOIN concepts c ON c.id = CASE WHEN r.from_id = ? THEN r.to_id ELSE r.from_id END
    WHERE r.from_id = ? OR r.to_id = ?`).all(concept.id, concept.id, concept.id);
  const notes = db.prepare(`SELECT n.id, n.title FROM note_concepts nc JOIN notes n ON n.id = nc.note_id
    WHERE nc.concept_id = ?`).all(concept.id);
  res.json({ concept, relations: rels, notes });
});

knowledge.get("/graph", (req, res) => {
  const { chapter, type } = req.query;
  let nodes = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM concept_relations r
      WHERE r.from_id = c.id OR r.to_id = c.id) AS degree
    FROM concepts c ORDER BY c.chapter`).all().map(conceptRow);
  if (chapter) nodes = nodes.filter((n) => n.chapter === chapter);
  const ids = new Set(nodes.map((n) => n.id));
  let edges = db.prepare("SELECT * FROM concept_relations").all()
    .filter((e) => ids.has(e.from_id) && ids.has(e.to_id));
  if (type) edges = edges.filter((e) => e.type === type);
  const chapters = db.prepare("SELECT id, title, ord FROM chapters ORDER BY ord").all();
  res.json({ nodes, edges, chapters });
});

/* ---------------- 标签与搜索 ---------------- */

knowledge.get("/tags", (_req, res) => {
  const counter = new Map();
  const add = (arr) => arr.forEach((t) => t && counter.set(t, (counter.get(t) || 0) + 1));
  for (const r of db.prepare("SELECT tags FROM notes").all()) add(parseJSON(r.tags, []));
  for (const r of db.prepare("SELECT tags FROM cards").all()) add(parseJSON(r.tags, []));
  for (const r of db.prepare("SELECT tags FROM questions").all()) add(parseJSON(r.tags, []));
  const tags = [...counter.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
  res.json({ tags });
});

knowledge.get("/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ notes: [], cards: [], questions: [], concepts: [] });
  const like = `%${q}%`;
  const notes = db.prepare(`SELECT id, title, chapter, summary FROM notes
    WHERE title LIKE ? OR content LIKE ? LIMIT 12`).all(like, like);
  const cards = db.prepare(`SELECT id, front, type, note_id FROM cards
    WHERE front LIKE ? OR back LIKE ? LIMIT 12`).all(like, like);
  const questions = db.prepare(`SELECT id, stem, type, chapter FROM questions
    WHERE stem LIKE ? LIMIT 12`).all(like);
  const concepts = db.prepare(`SELECT id, name, definition FROM concepts
    WHERE name LIKE ? OR aliases LIKE ? OR definition LIKE ? LIMIT 12`).all(like, like, like);
  res.json({ notes, cards, questions, concepts });
});

/* ---------------- 概览 ---------------- */

knowledge.get("/bootstrap", (_req, res) => {
  const chapters = chapterStats();
  const due = db.prepare(`SELECT COUNT(*) c FROM cards WHERE suspended = 0 AND
    (state = 0 OR due <= ?)`).get(new Date().toISOString()).c;
  const counts = {
    chapters: chapters.length,
    notes: db.prepare("SELECT COUNT(*) c FROM notes").get().c,
    cards: db.prepare("SELECT COUNT(*) c FROM cards").get().c,
    questions: db.prepare("SELECT COUNT(*) c FROM questions").get().c,
    concepts: db.prepare("SELECT COUNT(*) c FROM concepts").get().c,
    due,
  };
  const date = today();
  const act = db.prepare("SELECT * FROM activity WHERE date = ?").get(date) || { reviews: 0, questions: 0, minutes: 0 };
  const notes = db.prepare(`SELECT n.id, n.chapter, n.title, n.summary, n.tags, n.updated_at,
      (SELECT COUNT(*) FROM cards c WHERE c.note_id = n.id) AS cardCount,
      ch.ord AS chapterOrd, ch.title AS chapterTitle
    FROM notes n LEFT JOIN chapters ch ON ch.id = n.chapter ORDER BY ch.ord, n.id`).all()
    .map((n) => ({ ...n, tags: parseJSON(n.tags, []) }));
  const counter = new Map();
  const addTags = (arr) => arr.forEach((t) => t && counter.set(t, (counter.get(t) || 0) + 1));
  for (const r of db.prepare("SELECT tags FROM notes").all()) addTags(parseJSON(r.tags, []));
  for (const r of db.prepare("SELECT tags FROM cards").all()) addTags(parseJSON(r.tags, []));
  for (const r of db.prepare("SELECT tags FROM questions").all()) addTags(parseJSON(r.tags, []));
  const tags = [...counter.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
  res.json({ chapters, counts, today: { date, ...act }, notes, tags });
});

knowledge.post("/activity", (req, res) => {
  const { minutes = 0, reviews = 0, questions = 0 } = req.body || {};
  touchActivity({ minutes, reviews, questions });
  res.json({ ok: true });
});

/* 供内部复用 */
export function noteMarkdownText(id) {
  const row = db.prepare("SELECT content FROM notes WHERE id = ?").get(id);
  return row ? stripMarkdown(row.content) : "";
}
