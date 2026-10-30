import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newCardState } from "./lib/fsrs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
export const SEED_DIR = path.join(__dirname, "seed");

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "lingua.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY, parent TEXT, title TEXT NOT NULL, ord INTEGER NOT NULL,
  summary TEXT DEFAULT '', tags TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, chapter TEXT, title TEXT NOT NULL, summary TEXT DEFAULT '',
  content TEXT NOT NULL, tags TEXT DEFAULT '[]', books TEXT DEFAULT '[]', refs TEXT DEFAULT '[]',
  source TEXT DEFAULT 'seed', pinned INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS note_links (
  from_id TEXT NOT NULL, to_id TEXT NOT NULL, PRIMARY KEY (from_id, to_id)
);
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, chapter TEXT, definition TEXT DEFAULT '',
  school TEXT DEFAULT '', era TEXT DEFAULT '', aliases TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS concept_relations (
  from_id TEXT NOT NULL, to_id TEXT NOT NULL, type TEXT NOT NULL, PRIMARY KEY (from_id, to_id, type)
);
CREATE TABLE IF NOT EXISTS note_concepts (
  note_id TEXT NOT NULL, concept_id TEXT NOT NULL, PRIMARY KEY (note_id, concept_id)
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, note_id TEXT, type TEXT DEFAULT 'basic', front TEXT NOT NULL,
  back TEXT DEFAULT '', image TEXT DEFAULT '', tags TEXT DEFAULT '[]',
  due TEXT, stability REAL DEFAULT 0, difficulty REAL DEFAULT 0,
  elapsed_days INTEGER DEFAULT 0, scheduled_days INTEGER DEFAULT 0,
  reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0, state INTEGER DEFAULT 0,
  last_review TEXT, suspended INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(state, due);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL, rating INTEGER NOT NULL,
  state INTEGER, due TEXT, stability REAL, difficulty REAL,
  elapsed_days INTEGER, last_elapsed_days INTEGER DEFAULT 0,
  scheduled_days INTEGER, reviewed_at TEXT NOT NULL, duration_ms INTEGER DEFAULT 0,
  phase TEXT
);
CREATE INDEX IF NOT EXISTS idx_reviews_at ON reviews(reviewed_at);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY, chapter TEXT, type TEXT NOT NULL, stem TEXT NOT NULL,
  options TEXT DEFAULT '[]', answer TEXT DEFAULT '', rubric TEXT DEFAULT '[]',
  analysis TEXT DEFAULT '', difficulty INTEGER DEFAULT 2, tags TEXT DEFAULT '[]',
  source TEXT DEFAULT '', created_at TEXT
);
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY, title TEXT, mode TEXT DEFAULT 'practice', config TEXT DEFAULT '{}',
  created_at TEXT, submitted_at TEXT, score REAL, total REAL, duration_sec INTEGER
);
CREATE TABLE IF NOT EXISTS quiz_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, question_id TEXT NOT NULL,
  ord INTEGER, response TEXT, correct INTEGER, score REAL, feedback TEXT, answered_at TEXT
);
CREATE TABLE IF NOT EXISTS wrong_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, question_id TEXT UNIQUE NOT NULL, note_id TEXT, card_id TEXT,
  wrong_count INTEGER DEFAULT 1, last_wrong_at TEXT, resolved INTEGER DEFAULT 0, memo TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, note_id TEXT NOT NULL, quote TEXT DEFAULT '',
  body TEXT DEFAULT '', tag TEXT DEFAULT '', created_at TEXT
);
CREATE TABLE IF NOT EXISTS activity (
  date TEXT PRIMARY KEY, reviews INTEGER DEFAULT 0, questions INTEGER DEFAULT 0, minutes INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, filename TEXT, count INTEGER, created_at TEXT
);
`;

db.exec(SCHEMA);

export function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}
export function getSettings() {
  const out = {};
  for (const r of db.prepare("SELECT key, value FROM settings").all()) out[r.key] = r.value;
  return out;
}

export const DEFAULT_SETTINGS = {
  retention: "0.9",
  new_per_day: "20",
  review_per_day: "120",
  theme: "dark",
  ai_base_url: "",
  ai_model: "",
  ai_key: "",
  daily_goal: "30",
  exam_minutes: "60",
};

export function ensureSettings() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (getSetting(k) === null) setSetting(k, v);
  }
}

export function touchActivity({ reviews = 0, questions = 0, minutes = 0 } = {}, date = today()) {
  const row = db.prepare("SELECT * FROM activity WHERE date = ?").get(date);
  if (!row) {
    db.prepare("INSERT INTO activity(date, reviews, questions, minutes) VALUES(?,?,?,?)").run(
      date, reviews, questions, minutes
    );
  } else {
    db.prepare(
      "UPDATE activity SET reviews = reviews + ?, questions = questions + ?, minutes = minutes + ? WHERE date = ?"
    ).run(reviews, questions, minutes, date);
  }
}

export function today(d = new Date()) {
  // 以本地时区（Asia/Shanghai）生成 YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(d);
}

function readSeed(name) {
  const p = path.join(SEED_DIR, name);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`[seed] 解析失败 ${name}: ${e.message}`);
    return null;
  }
}

/** 从笔记正文解析 [[nXX]] 与 [[概念:名称]] */
export function indexNoteLinks(noteId, content) {
  const links = new Set();
  for (const m of content.matchAll(/\[\[(n\d{2,})(?:\|[^\]]*)?\]\]/g)) {
    if (m[1] !== noteId) links.add(m[1]);
  }
  const concepts = new Set();
  for (const m of content.matchAll(/\[\[概念:([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const row = db.prepare("SELECT id FROM concepts WHERE name = ?").get(m[1].trim());
    if (row) concepts.add(row.id);
  }
  db.prepare("DELETE FROM note_links WHERE from_id = ?").run(noteId);
  db.prepare("DELETE FROM note_concepts WHERE note_id = ?").run(noteId);
  for (const to of links) {
    if (db.prepare("SELECT 1 FROM notes WHERE id = ?").get(to)) {
      db.prepare("INSERT OR IGNORE INTO note_links(from_id, to_id) VALUES(?, ?)").run(noteId, to);
    }
  }
  for (const cid of concepts) {
    db.prepare("INSERT OR IGNORE INTO note_concepts(note_id, concept_id) VALUES(?, ?)").run(noteId, cid);
  }
  return { links: [...links], concepts: [...concepts] };
}

export function reseed({ force = false } = {}) {
  const count = db.prepare("SELECT COUNT(*) AS c FROM chapters").get().c;
  if (count > 0 && !force) return false;

  if (force) {
    const tables = ["note_links", "note_concepts", "concept_relations", "concepts", "cards",
      "reviews", "questions", "quiz_items", "quiz_sessions", "wrong_items", "annotations",
      "notes", "chapters", "activity"];
    for (const t of tables) db.exec(`DELETE FROM ${t};`);
  }

  const chapters = readSeed("chapters.json");
  const concepts = readSeed("concepts.json");
  const notes1 = readSeed("notes-part1.json");
  const notes2 = readSeed("notes-part2.json");
  const cards = readSeed("cards.json");
  const questions = readSeed("questions.json");

  const now = new Date().toISOString();

  if (chapters?.length) {
    const ins = db.prepare(
      "INSERT OR REPLACE INTO chapters(id, parent, title, ord, summary, tags) VALUES(?,?,?,?,?,?)"
    );
    chapters.forEach((c, i) =>
      ins.run(c.id, c.parent ?? null, c.title, c.order ?? i + 1, c.summary ?? "", JSON.stringify(c.tags ?? []))
    );
  }

  if (concepts?.concepts?.length) {
    const ins = db.prepare(
      "INSERT OR REPLACE INTO concepts(id, name, chapter, definition, school, era, aliases) VALUES(?,?,?,?,?,?,?)"
    );
    for (const k of concepts.concepts) {
      ins.run(k.id, k.name, k.chapter ?? null, k.definition ?? "", k.school ?? "", k.era ?? "", JSON.stringify(k.aliases ?? []));
    }
    const rel = db.prepare("INSERT OR IGNORE INTO concept_relations(from_id, to_id, type) VALUES(?,?,?)");
    for (const k of concepts.concepts) {
      for (const r of k.relations ?? []) {
        if (!r?.to || !r?.type) continue;
        rel.run(k.id, r.to, r.type);
      }
    }
  }

  const notes = [...(notes1?.notes ?? []), ...(notes2?.notes ?? [])];
  if (notes.length) {
    const ins = db.prepare(
      `INSERT OR REPLACE INTO notes(id, chapter, title, summary, content, tags, books, refs, source, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,'seed',?,?)`
    );
    for (const n of notes) {
      ins.run(n.id, n.chapter ?? null, n.title, n.summary ?? "", n.content, JSON.stringify(n.tags ?? []),
        JSON.stringify(n.books ?? []), JSON.stringify(n.refs ?? []), now, now);
    }
    for (const n of notes) indexNoteLinks(n.id, n.content);
  }

  if (cards?.cards?.length) {
    const ins = db.prepare(
      `INSERT OR REPLACE INTO cards(id, note_id, type, front, back, image, tags, due, stability, difficulty,
        elapsed_days, scheduled_days, reps, lapses, state, last_review, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,0,0,0,0,0,0,0,NULL,?,?)`
    );
    const st = newCardState();
    for (const c of cards.cards) {
      ins.run(c.id, c.note ?? null, c.type ?? "basic", c.front, c.back ?? "", c.image ?? "",
        JSON.stringify(c.tags ?? []), st.due, now, now);
    }
  }

  if (questions?.questions?.length) {
    const ins = db.prepare(
      `INSERT OR REPLACE INTO questions(id, chapter, type, stem, options, answer, rubric, analysis,
        difficulty, tags, source, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    for (const q of questions.questions) {
      ins.run(q.id, q.chapter ?? null, q.type, q.stem, JSON.stringify(q.options ?? []), q.answer ?? "",
        JSON.stringify(q.rubric ?? []), q.analysis ?? "", q.difficulty ?? 2, JSON.stringify(q.tags ?? []),
        q.source ?? "", now);
    }
  }

  ensureSettings();
  const stats = {
    chapters: db.prepare("SELECT COUNT(*) c FROM chapters").get().c,
    notes: db.prepare("SELECT COUNT(*) c FROM notes").get().c,
    concepts: db.prepare("SELECT COUNT(*) c FROM concepts").get().c,
    cards: db.prepare("SELECT COUNT(*) c FROM cards").get().c,
    questions: db.prepare("SELECT COUNT(*) c FROM questions").get().c,
  };
  console.log("[seed] 完成", stats);
  return stats;
}

// 启动时自动播种（有种子文件且库为空）
reseed();
ensureSettings();
