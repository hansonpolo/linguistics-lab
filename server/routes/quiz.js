import { Router } from "express";
import { db, touchActivity, today } from "../db.js";
import { parseJSON, questionRow, newId } from "../lib/util.js";

export const quiz = Router();

const POINTS = { choice: 2, judge: 1, term: 4, short: 6, material: 10 };
const iso = () => new Date().toISOString();

function rowWithMeta(q) {
  const chapter = q.chapter
    ? db.prepare("SELECT title FROM chapters WHERE id = ?").get(q.chapter)
    : null;
  return { ...questionRow(q), chapterTitle: chapter?.title || null, points: POINTS[q.type] || 2 };
}

/* ---------------- 题库 ---------------- */

quiz.get("/questions", (req, res) => {
  const { chapter, type, q, limit = 200 } = req.query;
  let sql = "SELECT * FROM questions WHERE 1=1";
  const args = [];
  if (chapter) { sql += " AND chapter = ?"; args.push(chapter); }
  if (type) { sql += " AND type = ?"; args.push(type); }
  if (q) { sql += " AND (stem LIKE ? OR answer LIKE ?)"; args.push(`%${q}%`, `%${q}%`); }
  sql += " ORDER BY chapter, id LIMIT ?";
  args.push(Math.min(500, Number(limit) || 200));
  res.json({ questions: db.prepare(sql).all(...args).map(rowWithMeta) });
});

quiz.post("/questions", (req, res) => {
  const b = req.body || {};
  if (!b.stem || !b.type) return res.status(400).json({ error: "题干与题型必填" });
  const id = b.id || newId("q");
  db.prepare(`INSERT INTO questions(id, chapter, type, stem, options, answer, rubric, analysis,
    difficulty, tags, source, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, b.chapter || null, b.type, b.stem, JSON.stringify(b.options || []), b.answer || "",
    JSON.stringify(b.rubric || []), b.analysis || "", b.difficulty || 2,
    JSON.stringify(b.tags || []), b.source || "自编", iso()
  );
  res.json({ question: rowWithMeta(db.prepare("SELECT * FROM questions WHERE id = ?").get(id)) });
});

quiz.delete("/questions/:id", (req, res) => {
  db.prepare("DELETE FROM questions WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- 练习（即时判分） ---------------- */

quiz.post("/quiz/check", (req, res) => {
  const { questionId, response = "" } = req.body || {};
  const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId);
  if (!q) return res.status(404).json({ error: "题目不存在" });
  const row = rowWithMeta(q);
  const graded = gradeOne(row, response);
  if (graded.correct === false) recordWrong(row, graded);
  touchActivity({ questions: 1 });
  res.json({ ...graded, answer: row.answer, analysis: row.analysis, rubric: row.rubric });
});

function normalize(s = "") {
  return String(s).trim().replace(/\s+/g, "").replace(/[。；;，,]$/, "").toLowerCase();
}

function gradeOne(q, response) {
  if (q.type === "choice" || q.type === "judge") {
    const correct = normalize(response) === normalize(q.answer);
    return { correct, score: correct ? q.points : 0, mode: "auto" };
  }
  return {
    correct: null,
    score: null,
    mode: "self",
    hint: "主观题请对照参考答案与踩分点自评",
  };
}

function recordWrong(q, graded) {
  const note = q.chapter
    ? db.prepare("SELECT id FROM notes WHERE chapter = ? ORDER BY id LIMIT 1").get(q.chapter)
    : null;
  const card = note ? db.prepare("SELECT id FROM cards WHERE note_id = ? LIMIT 1").get(note.id) : null;
  const existing = db.prepare("SELECT * FROM wrong_items WHERE question_id = ?").get(q.id);
  if (existing) {
    db.prepare(`UPDATE wrong_items SET wrong_count = wrong_count + 1, last_wrong_at = ?,
      resolved = 0, note_id = COALESCE(note_id, ?), card_id = COALESCE(card_id, ?) WHERE question_id = ?`)
      .run(iso(), note?.id || null, card?.id || null, q.id);
  } else {
    db.prepare(`INSERT INTO wrong_items(question_id, note_id, card_id, wrong_count, last_wrong_at)
      VALUES(?,?,?,1,?)`).run(q.id, note?.id || null, card?.id || null, iso());
  }
}

/* ---------------- 套卷 ---------------- */

quiz.post("/quiz/sessions", (req, res) => {
  const { title = "自组练习卷", mode = "practice", config = {} } = req.body || {};
  const chapters = Array.isArray(config.chapters) ? config.chapters.filter(Boolean) : [];
  const types = Array.isArray(config.types) && config.types.length ? config.types : Object.keys(POINTS);
  const counts = config.counts || {};
  const limits = config.limits || {};
  const mins = Number(config.minutes) || 0;

  let where = "WHERE 1=1";
  const args = [];
  if (chapters.length) {
    where += ` AND chapter IN (${chapters.map(() => "?").join(",")})`;
    args.push(...chapters);
  }
  if (types.length) {
    where += ` AND type IN (${types.map(() => "?").join(",")})`;
    args.push(...types);
  }
  const picked = [];
  for (const t of types) {
    const n = Number(counts[t] ?? limits[t] ?? 0);
    if (n <= 0) continue;
    const rows = db.prepare(`SELECT * FROM questions ${where} AND type = ? ORDER BY RANDOM() LIMIT ?`)
      .all(...args, t, n);
    picked.push(...rows);
  }
  if (!picked.length) {
    // 未指定数量时随机取 20 题
    picked.push(...db.prepare(`SELECT * FROM questions ${where} ORDER BY RANDOM() LIMIT 20`).all(...args));
  }
  if (!picked.length) return res.status(400).json({ error: "没有符合条件的题目" });
  if (mode === "exam") picked.sort((a, b) => (a.type === b.type ? a.id.localeCompare(b.id) : 0));

  const id = newId("s");
  const createdAt = iso();
  db.prepare("INSERT INTO quiz_sessions(id, title, mode, config, created_at) VALUES(?,?,?,?,?)")
    .run(id, title, mode, JSON.stringify({ ...config, chapters, types }), createdAt);
  const insItem = db.prepare("INSERT INTO quiz_items(session_id, question_id, ord) VALUES(?,?,?)");
  picked.forEach((q, i) => insItem.run(id, q.id, i));

  res.json({
    session: {
      id, title, mode, createdAt,
      minutes: mins || (mode === "exam" ? 60 : 0),
      items: picked.map((q, i) => ({ ord: i + 1, question: rowWithMeta(q) })),
    },
  });
});

quiz.get("/quiz/sessions/:id", (req, res) => {
  const s = db.prepare("SELECT * FROM quiz_sessions WHERE id = ?").get(req.params.id);
  if (!s) return res.status(404).json({ error: "套卷不存在" });
  const items = db.prepare(`SELECT qi.*, q.* FROM quiz_items qi JOIN questions q ON q.id = qi.question_id
    WHERE qi.session_id = ? ORDER BY qi.ord`).all(req.params.id);
  const questions = items.map((it) => ({
    ord: it.ord,
    response: it.response,
    correct: it.correct,
    score: it.score,
    question: rowWithMeta(it),
  }));
  res.json({
    session: { ...s, config: parseJSON(s.config, {}), items: s.submitted_at ? questions : questions.map((x) => ({ ord: x.ord, question: x.question })) },
    submitted: !!s.submitted_at,
    result: s.submitted_at ? buildReport(s, questions) : null,
  });
});

quiz.post("/quiz/sessions/:id/submit", (req, res) => {
  const s = db.prepare("SELECT * FROM quiz_sessions WHERE id = ?").get(req.params.id);
  if (!s) return res.status(404).json({ error: "套卷不存在" });
  if (s.submitted_at) return res.status(400).json({ error: "该套卷已提交" });
  const { responses = [], durationSec = 0 } = req.body || {};
  const map = new Map(responses.map((r) => [r.questionId, r]));
  const items = db.prepare("SELECT * FROM quiz_items WHERE session_id = ? ORDER BY ord").all(req.params.id);
  const upd = db.prepare(`UPDATE quiz_items SET response=?, correct=?, score=?, feedback=?, answered_at=?
    WHERE id=?`);
  let total = 0;
  let score = 0;
  const graded = [];
  for (const it of items) {
    const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(it.question_id);
    if (!q) continue;
    const row = rowWithMeta(q);
    const r = map.get(q.id) || {};
    let correct = null;
    let sc = 0;
    if (q.type === "choice" || q.type === "judge") {
      correct = normalize(r.response || "") === normalize(q.answer);
      sc = correct ? row.points : 0;
    } else {
      const self = r.selfScore === undefined || r.selfScore === null ? 0 : Number(r.selfScore);
      sc = Math.round(row.points * Math.max(0, Math.min(1, self)) * 10) / 10;
      correct = sc >= row.points * 0.6;
    }
    if (!correct) recordWrong(row, { score: sc });
    total += row.points;
    score += sc;
    upd.run(JSON.stringify(r.response ?? ""), correct ? 1 : 0, sc, r.feedback || "", iso(), it.id);
    graded.push({
      ord: it.ord, question: row, response: r.response ?? "",
      selfScore: r.selfScore ?? null, correct, score: sc, feedback: r.feedback || "",
    });
  }
  db.prepare("UPDATE quiz_sessions SET submitted_at=?, score=?, total=?, duration_sec=? WHERE id=?")
    .run(iso(), score, total, Math.round(durationSec), req.params.id);
  touchActivity({ questions: graded.length, minutes: Math.round((durationSec || 0) / 60) });
  res.json({ report: buildReport({ ...s, score, total, duration_sec: durationSec }, graded) });
});

function buildReport(s, items) {
  const byType = {};
  for (const it of items) {
    const t = it.question.type;
    byType[t] = byType[t] || { count: 0, score: 0, total: 0, correct: 0 };
    byType[t].count++;
    byType[t].score += it.score || 0;
    byType[t].total += it.question.points;
    byType[t].correct += it.correct ? 1 : 0;
  }
  const total = s.total ?? items.reduce((a, b) => a + b.question.points, 0);
  const score = s.score ?? items.reduce((a, b) => a + (b.score || 0), 0);
  return {
    score, total, pct: total ? Math.round((score / total) * 100) : 0,
    durationSec: s.duration_sec || 0,
    byType,
    items,
  };
}

quiz.get("/quiz/history", (_req, res) => {
  const rows = db.prepare("SELECT * FROM quiz_sessions ORDER BY created_at DESC LIMIT 20").all();
  res.json({ sessions: rows.map((r) => ({ ...r, config: parseJSON(r.config, {}) })) });
});

/* ---------------- 错题本 ---------------- */

quiz.get("/wrongbook", (req, res) => {
  const { resolved } = req.query;
  let sql = `SELECT w.*, q.stem, q.type, q.chapter, q.answer, n.title AS noteTitle, ch.title AS chapterTitle
    FROM wrong_items w LEFT JOIN questions q ON q.id = w.question_id
    LEFT JOIN notes n ON n.id = w.note_id LEFT JOIN chapters ch ON ch.id = q.chapter`;
  const args = [];
  if (resolved === "0") sql += " WHERE w.resolved = 0";
  if (resolved === "1") sql += " WHERE w.resolved = 1";
  sql += " ORDER BY w.resolved, w.last_wrong_at DESC";
  const rows = db.prepare(sql).all(...args);
  res.json({
    items: rows.map((r) => ({ ...r, kind: r.question_id?.startsWith("card:") ? "card" : "question" })),
    unresolved: db.prepare("SELECT COUNT(*) c FROM wrong_items WHERE resolved = 0").get().c,
  });
});

quiz.post("/wrongbook/:id/resolve", (req, res) => {
  db.prepare("UPDATE wrong_items SET resolved = ? WHERE id = ?").run(req.body?.resolved ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

quiz.delete("/wrongbook/:id", (req, res) => {
  db.prepare("DELETE FROM wrong_items WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

quiz.get("/quiz/today", (_req, res) => {
  const d = today();
  const row = db.prepare("SELECT * FROM activity WHERE date = ?").get(d) || { questions: 0, reviews: 0, minutes: 0 };
  res.json({ today: { date: d, ...row } });
});
