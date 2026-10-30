import { Router } from "express";
import { db, getSetting, touchActivity, today } from "../db.js";
import { cardRow, parseJSON, newId } from "../lib/util.js";
import { schedule, previewIntervals, State } from "../lib/fsrs.js";

export const review = Router();

const iso = () => new Date().toISOString();

function withNote(row) {
  return {
    ...cardRow(row),
    noteTitle: row.noteTitle,
    chapter: row.chapter,
    chapterTitle: row.chapterTitle,
  };
}

const CARD_SELECT = `SELECT c.*, n.title AS noteTitle, n.chapter AS chapter, ch.title AS chapterTitle
  FROM cards c LEFT JOIN notes n ON n.id = c.note_id LEFT JOIN chapters ch ON ch.id = n.chapter`;

/* ---------------- 卡片管理 ---------------- */

review.get("/cards", (req, res) => {
  const { note, tag, state, q, limit = 200 } = req.query;
  let sql = `${CARD_SELECT} WHERE 1=1`;
  const args = [];
  if (note) { sql += " AND c.note_id = ?"; args.push(note); }
  if (tag) { sql += " AND c.tags LIKE ?"; args.push(`%${tag}%`); }
  if (state !== undefined && state !== "") { sql += " AND c.state = ?"; args.push(Number(state)); }
  if (q) { sql += " AND (c.front LIKE ? OR c.back LIKE ?)"; args.push(`%${q}%`, `%${q}%`); }
  sql += " ORDER BY c.due LIMIT ?";
  args.push(Math.min(500, Number(limit) || 200));
  const cards = db.prepare(sql).all(...args).map(withNote);
  res.json({ cards, total: cards.length });
});

review.post("/cards", (req, res) => {
  const { note_id = null, type = "basic", front, back = "", tags = [], image = "" } = req.body || {};
  if (!front) return res.status(400).json({ error: "正面内容不能为空" });
  const id = req.body.id || newId("f");
  db.prepare(`INSERT INTO cards(id, note_id, type, front, back, image, tags, due,
    stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,0,0,0,0,0,0,0,NULL,?,?)`).run(
    id, note_id, type, front, back, image, JSON.stringify(tags), iso(), iso(), iso()
  );
  res.json({ card: cardRow(db.prepare(`${CARD_SELECT} WHERE c.id = ?`).get(id)) });
});

review.put("/cards/:id", (req, res) => {
  const cur = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "卡片不存在" });
  const b = req.body || {};
  db.prepare(`UPDATE cards SET note_id=?, type=?, front=?, back=?, image=?, tags=?,
    suspended=?, updated_at=? WHERE id=?`).run(
    b.note_id ?? cur.note_id, b.type ?? cur.type, b.front ?? cur.front, b.back ?? cur.back,
    b.image ?? cur.image, b.tags ? JSON.stringify(b.tags) : cur.tags,
    b.suspended === undefined ? cur.suspended : b.suspended ? 1 : 0, iso(), req.params.id
  );
  res.json({ card: cardRow(db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id)) });
});

review.delete("/cards/:id", (req, res) => {
  db.prepare("DELETE FROM cards WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

review.post("/cards/:id/reset", (req, res) => {
  db.prepare(`UPDATE cards SET state=0, due=?, stability=0, difficulty=0, elapsed_days=0,
    scheduled_days=0, reps=0, lapses=0, last_review=NULL WHERE id=?`).run(iso(), req.params.id);
  res.json({ ok: true });
});

/* ---------------- 复习队列 ---------------- */

review.get("/review/queue", (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const mode = String(req.query.mode || "all");
  const chapter = req.query.chapter;
  const tag = req.query.tag;
  const now = iso();
  const todayStr = today();
  const newPerDay = Number(getSetting("new_per_day", "20"));
  const reviewPerDay = Number(getSetting("review_per_day", "120"));
  const retention = Number(getSetting("retention", "0.9"));

  const introducedToday = db.prepare(
    "SELECT COUNT(*) c FROM reviews WHERE state = 0 AND substr(reviewed_at, 1, 10) = ?"
  ).get(todayStr).c;
  const reviewedToday = db.prepare(
    "SELECT COUNT(*) c FROM reviews WHERE substr(reviewed_at, 1, 10) = ?"
  ).get(todayStr).c;

  const newRemaining = Math.max(0, newPerDay - introducedToday);
  const reviewRemaining = Math.max(0, reviewPerDay - reviewedToday);

  let filter = "c.suspended = 0 AND c.due <= ?";
  const args = [now];
  if (chapter) { filter += " AND n.chapter = ?"; args.push(chapter); }
  if (tag) { filter += " AND c.tags LIKE ?"; args.push(`%${tag}%`); }
  if (mode === "new") filter += " AND c.state = 0";
  if (mode === "due") filter += " AND c.state > 0";

  const pool = db.prepare(`${CARD_SELECT} WHERE ${filter} ORDER BY c.due`).all(...args).map(withNote);
  const learn = pool.filter((c) => c.state === 1 || c.state === 3);
  const reviewDue = pool.filter((c) => c.state === 2);
  const fresh = pool.filter((c) => c.state === 0);

  let picked = [...learn, ...reviewDue.slice(0, Math.max(0, reviewRemaining - learn.length))];
  if (mode === "all" || mode === "new") picked = [...learn, ...reviewDue.slice(0, Math.max(0, reviewRemaining - learn.length)),
    ...fresh.slice(0, newRemaining)];
  if (mode === "due") picked = [...learn, ...reviewDue].slice(0, reviewPerDay);
  picked = picked.slice(0, limit);

  const cards = picked.map((c) => ({
    ...c,
    preview: previewIntervals(c, { retention }),
  }));

  res.json({
    cards,
    counts: {
      learning: learn.length,
      review: reviewDue.length,
      new: fresh.length,
      available: pool.length,
    },
    limits: { newRemaining, reviewRemaining, newPerDay, reviewPerDay },
  });
});

review.get("/review/preview/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "卡片不存在" });
  const retention = Number(getSetting("retention", "0.9"));
  res.json({ preview: previewIntervals(row, { retention }) });
});

review.post("/review/answer", (req, res) => {
  const { cardId, rating, durationMs = 0 } = req.body || {};
  const g = Number(rating);
  if (!cardId || g < 1 || g > 4) return res.status(400).json({ error: "参数不合法" });
  const row = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId);
  if (!row) return res.status(404).json({ error: "卡片不存在" });

  const retention = Number(getSetting("retention", "0.9"));
  const prevState = row.state;
  const { card, log } = schedule(row, g, { retention });
  db.prepare(`UPDATE cards SET due=?, stability=?, difficulty=?, elapsed_days=?, scheduled_days=?,
    reps=?, lapses=?, state=?, last_review=?, updated_at=? WHERE id=?`).run(
    card.due, card.stability, card.difficulty, card.elapsed_days, card.scheduled_days,
    card.reps, card.lapses, card.state, card.last_review, iso(), cardId
  );
  db.prepare(`INSERT INTO reviews(card_id, rating, state, due, stability, difficulty, elapsed_days,
    last_elapsed_days, scheduled_days, reviewed_at, duration_ms, phase)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    cardId, g, prevState, card.due, card.stability, card.difficulty, card.elapsed_days,
    row.elapsed_days || 0, card.scheduled_days, card.last_review, Math.round(durationMs), log.phase
  );
  touchActivity({ reviews: 1, minutes: Math.round(durationMs / 60000) });
  if (g === 1) {
    const exists = db.prepare("SELECT 1 FROM wrong_items WHERE question_id = ?").get(`card:${cardId}`);
    if (!exists) {
      db.prepare("INSERT INTO wrong_items(question_id, note_id, card_id, wrong_count, last_wrong_at) VALUES(?,?,?,1,?)")
        .run(`card:${cardId}`, row.note_id, cardId, iso());
    }
  }
  res.json({ card: cardRow(db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId)), log });
});

/* ---------------- 统计 ---------------- */

function localDate(isoStr) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(isoStr));
}

review.get("/stats", (_req, res) => {
  const all = db.prepare("SELECT * FROM cards").all();
  const now = Date.now();
  const total = all.length;
  const mastered = all.filter((c) => c.stability >= 21).length;
  const stateCount = { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0 };
  for (const c of all) {
    if (c.suspended) stateCount.suspended++;
    if (c.state === 0) stateCount.new++;
    else if (c.state === 1) stateCount.learning++;
    else if (c.state === 2) stateCount.review++;
    else if (c.state === 3) stateCount.relearning++;
  }
  const dueNow = all.filter((c) => !c.suspended && new Date(c.due).getTime() <= now).length;

  const reviews = db.prepare("SELECT * FROM reviews ORDER BY reviewed_at").all();
  const byDay = new Map();
  for (const r of reviews) {
    const d = localDate(r.reviewed_at);
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }
  const todayStr = today();
  // 连续打卡（今天或昨天有复习都算延续）
  let streak = 0;
  const cursor = new Date(`${todayStr}T12:00:00+08:00`);
  if (!byDay.get(todayStr)) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(cursor);
    if (byDay.get(key)) { streak++; cursor.setDate(cursor.getDate() - 1); } else break;
    if (streak > 2000) break;
  }

  const heatmap = [];
  for (let i = 181; i >= 0; i--) {
    const d = new Date(`${todayStr}T12:00:00+08:00`);
    d.setDate(d.getDate() - i);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(d);
    heatmap.push({ date: key, count: byDay.get(key) || 0 });
  }

  const forecast = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(`${todayStr}T12:00:00+08:00`);
    d.setDate(d.getDate() + i);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(d);
    forecast.push({ date: key, count: 0 });
  }
  const fIndex = new Map(forecast.map((f, i) => [f.date, i]));
  for (const c of all) {
    if (c.suspended || c.state === 0 || c.state === 1 || c.state === 3) continue;
    const key = localDate(c.due);
    if (fIndex.has(key)) forecast[fIndex.get(key)].count++;
  }

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = reviews.filter((r) => r.reviewed_at >= cutoff);
  const retention30 = recent.length
    ? Math.round((recent.filter((r) => r.rating > 1).length / recent.length) * 100)
    : null;

  const chapterRows = db.prepare(`
    SELECT ch.id, ch.title, ch.ord, COUNT(c.id) AS cardCount,
      SUM(CASE WHEN c.stability >= 21 THEN 1 ELSE 0 END) AS mastered
    FROM chapters ch LEFT JOIN notes n ON n.chapter = ch.id LEFT JOIN cards c ON c.note_id = n.id
    GROUP BY ch.id ORDER BY ch.ord`).all();
  const chapterMastery = chapterRows.map((r) => ({
    id: r.id, title: r.title, cardCount: r.cardCount, mastered: r.mastered || 0,
    mastery: r.cardCount ? Math.round(((r.mastered || 0) / r.cardCount) * 100) : 0,
  }));

  const weakest = db.prepare(`${CARD_SELECT} WHERE c.lapses > 0 ORDER BY c.lapses DESC, c.stability ASC LIMIT 6`).all()
    .map(withNote);

  const act = db.prepare("SELECT * FROM activity WHERE date = ?").get(todayStr) || { reviews: 0, questions: 0, minutes: 0 };

  res.json({
    counts: { total, mastered, mastery: total ? Math.round((mastered / total) * 100) : 0, ...stateCount },
    dueNow,
    streak,
    retention30,
    heatmap,
    forecast,
    chapterMastery,
    weakest,
    today: { date: todayStr, ...act },
    totalReviews: reviews.length,
    totalMinutes: db.prepare("SELECT COALESCE(SUM(minutes),0) m FROM activity").get().m,
  });
});
