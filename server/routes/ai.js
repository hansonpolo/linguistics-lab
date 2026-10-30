import { Router } from "express";
import { db, getSetting } from "../db.js";
import { parseJSON, stripMarkdown, tokenize, questionRow } from "../lib/util.js";

export const ai = Router();

/* ================= 本地接地检索 ================= */

function loadIndex() {
  const notes = db.prepare("SELECT id, chapter, title, summary, content, refs FROM notes").all();
  const concepts = db.prepare("SELECT * FROM concepts").all().map((c) => ({
    ...c, aliases: parseJSON(c.aliases, []),
  }));
  return { notes, concepts };
}

function scoreText(queryTokens, text) {
  const toks = tokenize(text);
  const set = new Set(toks.map((t) => t.toLowerCase()));
  let score = 0;
  for (const q of queryTokens) {
    const k = q.toLowerCase();
    if (set.has(k)) score += k.length >= 3 ? 3 : 2;
    else if (text.includes(k)) score += 1;
  }
  return score;
}

function findConcepts(query, index) {
  const q = query.trim();
  const hits = [];
  for (const c of index.concepts) {
    const names = [c.name, ...c.aliases];
    if (names.some((n) => n && q.includes(n))) hits.push({ ...c, hit: 2 });
  }
  return hits.sort((a, b) => b.name.length - a.name.length);
}

function retrieveNotes(query, index, limit = 3) {
  const qTokens = tokenize(query).slice(0, 60);
  const scored = index.notes.map((n) => {
    const text = `${n.title} ${n.summary} ${stripMarkdown(n.content)}`;
    let s = scoreText(qTokens, text);
    if (qTokens.some((t) => t.length >= 2 && n.title.includes(t))) s += 6;
    return { note: n, score: s };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.note);
}

function sentences(text) {
  return stripMarkdown(text).split(/(?<=[。！？；])/).map((s) => s.trim()).filter((s) => s.length > 12);
}

function pickParagraphs(note, query, limit = 3) {
  const qTokens = tokenize(query);
  const paras = stripMarkdown(note.content).split(/\n{1,}/).map((p) => p.trim()).filter((p) => p.length > 30);
  return paras
    .map((p) => ({ p, s: scoreText(qTokens, p) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

function debateSentences(notes) {
  const out = [];
  for (const n of notes) {
    for (const s of sentences(n.content)) {
      if (/(争议|分歧|不同看法|也有学者|另一些学者|尚未定论|存在争论)/.test(s)) out.push({ text: s, note: n });
    }
  }
  return out.slice(0, 4);
}

function hypothesisSentences(notes) {
  const out = [];
  for (const n of notes) {
    for (const s of sentences(n.content)) {
      if (/(假说|假设|推测|猜想|一家之言|实验性)/.test(s)) out.push({ text: s, note: n });
    }
  }
  return out.slice(0, 3);
}

function refsOf(notes) {
  const seen = new Set();
  const refs = [];
  for (const n of notes) {
    for (const r of parseJSON(n.refs, [])) {
      if (!seen.has(r)) { seen.add(r); refs.push({ text: r, noteId: n.id, noteTitle: n.title }); }
    }
  }
  return refs;
}

/* ================= 可选大模型 ================= */

function aiConfig() {
  return {
    base: (getSetting("ai_base_url", "") || process.env.AI_BASE_URL || "").trim(),
    model: (getSetting("ai_model", "") || process.env.AI_MODEL || "").trim(),
    key: (getSetting("ai_key", "") || process.env.AI_KEY || "").trim(),
  };
}

async function callLLM(messages, { timeout = 60000 } = {}) {
  const { base, model, key } = aiConfig();
  if (!base || !model || !key) return null;
  const url = base.replace(/\/$/, "") + "/chat/completions";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
  } finally {
    clearTimeout(t);
  }
}

const SYSTEM_PROMPT = `你是《语言学概论》课程的助教，以叶蜚声、徐通锵《语言学纲要》的教材口径为基准。
硬性要求：
1. 回答必须分成三段，标题严格用：【教材主流结论】【学界争议观点】【小众假说】。
2. 只使用提供的资料作答；资料没有的内容，写「本站知识库未收录，不作推断」，严禁编造语言学理论、学者、著作或年份。
3. 每个结论后用（来源：笔记标题）标注。语言简洁、术语准确，可用少量 Markdown 列表。
4. 若问题涉及易混概念，先给出辨析要点，再给三段式结论。`;

/* ================= 问答 ================= */

ai.get("/ai/status", (_req, res) => {
  const { base, model } = aiConfig();
  res.json({ mode: base && model ? "api" : "local", model: model || null, base: base || null });
});

ai.post("/ai/ask", async (req, res) => {
  const { question = "", mode = "explain" } = req.body || {};
  if (!question.trim()) return res.status(400).json({ error: "请输入问题" });
  const index = loadIndex();
  const concepts = findConcepts(question, index);
  const notes = retrieveNotes(question, index, 3);

  if (mode === "distinguish" && concepts.length >= 2) {
    const [a, b] = concepts;
    const sections = buildDistinguish(a, b, notes);
    return res.json(makePayload(question, mode, concepts, notes, sections, false));
  }

  const sections = buildExplain(question, concepts, notes);
  const { base, model, key } = aiConfig();
  if (base && model && key) {
    const context = notes.map((n, i) => `【资料${i + 1}：${n.title}】\n${stripMarkdown(n.content).slice(0, 2400)}`).join("\n\n");
    const conceptText = concepts.map((c) => `${c.name}：${c.definition}`).join("\n");
    try {
      const text = await callLLM([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `资料：\n${context}\n\n概念卡：\n${conceptText}\n\n问题：${question}` },
      ]);
      if (text) {
        return res.json({
          ...makePayload(question, mode, concepts, notes, sections, true),
          llm: text,
        });
      }
    } catch (e) {
      // 失败时退回本地接地回答，不阻断学习
    }
  }
  res.json(makePayload(question, mode, concepts, notes, sections, false));
});

function makePayload(question, mode, concepts, notes, sections, llmUsed) {
  return {
    question, mode,
    concepts: concepts.map((c) => ({ id: c.id, name: c.name, school: c.school, definition: c.definition })),
    notes: notes.map((n) => ({ id: n.id, title: n.title, chapter: n.chapter })),
    sections,
    sources: refsOf(notes),
    engine: llmUsed ? "api+local" : "local",
    disclaimer: "本地知识库接地回答：仅引用站内笔记与概念卡，未生成未经核实的内容。",
  };
}

function buildExplain(question, concepts, notes) {
  const mainstream = [];
  for (const c of concepts.slice(0, 3)) {
    mainstream.push({ text: `**${c.name}**：${c.definition}`, noteId: null });
  }
  for (const n of notes) {
    for (const p of pickParagraphs(n, question, 2)) {
      mainstream.push({ text: p, noteId: n.id, noteTitle: n.title });
    }
  }
  const debates = debateSentences(notes).map((d) => ({
    text: d.text, noteId: d.note.id, noteTitle: d.note.title,
  }));
  const hypotheses = hypothesisSentences(notes).map((d) => ({
    text: d.text, noteId: d.note.id, noteTitle: d.note.title,
  }));

  return [
    {
      key: "mainstream",
      label: "教材主流结论",
      tone: "primary",
      blocks: mainstream.length ? mainstream : [{
        text: notes.length
          ? "检索到相关笔记，但未定位到可直接引用的段落，请打开来源笔记阅读。"
          : "本站知识库暂未收录该问题，建议先在「课程」中补充相关笔记。",
      }],
      empty: false,
    },
    {
      key: "debate",
      label: "学界争议观点",
      tone: "warning",
      blocks: debates.length ? debates : [{
        text: "所检索的教材口径中未见明确分歧表述；如需拓展，可查阅索绪尔《普通语言学教程》与布龙菲尔德《语言论》相关章节。",
      }],
      empty: !debates.length,
    },
    {
      key: "hypothesis",
      label: "小众假说",
      tone: "muted",
      blocks: hypotheses.length ? hypotheses : [{
        text: "本站知识库未收录小众假说，按「不编造」原则不作推断。",
      }],
      empty: !hypotheses.length,
    },
  ];
}

function buildDistinguish(a, b, notes) {
  const related = db.prepare(`SELECT type FROM concept_relations
    WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`)
    .all(a.id, b.id, b.id, a.id);
  const noteNames = notes.map((n) => n.title).join("、");
  const isOpposed = related.some((r) => r.type === "opposes");
  const common = unique([...a.definition.split(/[，。；]/), ...b.definition.split(/[，。；]/)]
    .filter((x) => x.length >= 4).filter((x) => a.definition.includes(x) && b.definition.includes(x))).slice(0, 2);

  const diff = [{
    text: `**${a.name}**（${a.school || "普通语言学"}）：${a.definition}`,
    noteId: null,
  }, {
    text: `**${b.name}**（${b.school || "普通语言学"}）：${b.definition}`,
    noteId: null,
  }, {
    text: isOpposed
      ? `二者在概念体系中构成**对立/易混关系**：${a.name} 与 ${b.name} 不可互相替换，判断时先看其所属的分析层面与功能定位。`
      : `二者在概念体系中为**相关关系**，需结合具体层级区分，不宜简单对立。`,
  }];

  return [
    {
      key: "mainstream", label: "教材主流结论", tone: "primary",
      blocks: [
        ...diff,
        ...notes.flatMap((n) => pickParagraphs(n, `${a.name} ${b.name}`, 1)
          .map((p) => ({ text: p, noteId: n.id, noteTitle: n.title }))),
      ],
      empty: false,
    },
    {
      key: "debate", label: "学界争议观点", tone: "warning",
      blocks: debateSentences(notes).length
        ? debateSentences(notes).map((d) => ({ text: d.text, noteId: d.note.id, noteTitle: d.note.title }))
        : [{ text: "两者在主流教材中的区分较为明确，未检索到实质分歧。" }],
      empty: !debateSentences(notes).length,
    },
    {
      key: "hypothesis", label: "小众假说", tone: "muted",
      blocks: [{ text: "本站知识库未收录针对该组概念的小众假说，不作推断。" }],
      empty: true,
    },
  ];
}

function unique(arr) {
  return [...new Set(arr)];
}

/* ================= 背诵抽查 ================= */

ai.post("/ai/recite/start", (req, res) => {
  const { noteId } = req.body || {};
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId);
  if (!note) return res.status(404).json({ error: "笔记不存在" });
  const concepts = db.prepare(`SELECT c.name FROM note_concepts nc JOIN concepts c ON c.id = nc.concept_id
    WHERE nc.note_id = ?`).all(noteId).map((c) => c.name);
  const headings = [...note.content.matchAll(/^##+\s+(.+)$/gm)].map((m) => m[1].trim());
  const bolds = [...note.content.matchAll(/\*\*([^*]{2,16})\*\*/g)].map((m) => m[1]);
  const keywords = unique([...concepts, ...bolds]).slice(0, 12);
  const prompts = [];
  if (concepts.length) prompts.push(`请用自己的话解释「${concepts[0]}」，并说明它与相邻概念的区别。`);
  if (headings.length) prompts.push(`请复述本节「${headings[0]}」的要点（不少于 3 点）。`);
  prompts.push(`请概括《${note.title}》的核心结论。`);
  res.json({
    note: { id: note.id, title: note.title },
    prompts,
    keywords,
    reference: pickParagraphs(note, keywords.join(" "), 2),
  });
});

ai.post("/ai/recite/check", (req, res) => {
  const { noteId, answer = "" } = req.body || {};
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId);
  if (!note) return res.status(404).json({ error: "笔记不存在" });
  const concepts = db.prepare(`SELECT c.name FROM note_concepts nc JOIN concepts c ON c.id = nc.concept_id
    WHERE nc.note_id = ?`).all(noteId).map((c) => c.name);
  const bolds = [...note.content.matchAll(/\*\*([^*]{2,16})\*\*/g)].map((m) => m[1]);
  const keywords = unique([...concepts, ...bolds]).slice(0, 14);
  const hit = keywords.filter((k) => answer.includes(k));
  const missing = keywords.filter((k) => !answer.includes(k));
  const len = answer.trim().length;
  const lengthScore = Math.min(1, len / 180);
  const coverage = keywords.length ? hit.length / keywords.length : 0;
  const score = Math.round((coverage * 0.7 + lengthScore * 0.3) * 100);
  const comments = [];
  if (len < 40) comments.push("答案过短，考试作答建议先下定义、再展开，至少 3 个层次。");
  if (coverage < 0.4) comments.push("关键术语覆盖不足，注意踩分点：「定义 + 分类/特征 + 例子」。");
  if (missing.length) comments.push(`可能遗漏的踩分点：${missing.slice(0, 6).join("、")}。`);
  if (score >= 80) comments.push("覆盖面良好，可再补一个具体语言事实作为例证。");
  res.json({
    score, coverage: Math.round(coverage * 100), length: len,
    hit, missing, comments,
    reference: pickParagraphs(note, keywords.join(" "), 3),
    note: { id: note.id, title: note.title },
  });
});

/* ================= 考点提取与闪卡草稿 ================= */

ai.post("/ai/extract", (req, res) => {
  const { noteId, text = "" } = req.body || {};
  let source = text;
  let title = "粘贴文本";
  if (noteId) {
    const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId);
    if (note) { source = note.content; title = note.title; }
  }
  if (!source.trim()) return res.status(400).json({ error: "没有可提取的内容" });
  const headings = [...source.matchAll(/^##+\s+(.+)$/gm)].map((m) => m[1].trim());
  const bolds = unique([...source.matchAll(/\*\*([^*]{2,24})\*\*/g)].map((m) => m[1]));
  const concepts = db.prepare("SELECT name FROM concepts").all().map((c) => c.name);
  const terms = unique([...bolds, ...concepts.filter((c) => source.includes(c))]);
  const sentences = splitSentences(stripMarkdown(source));
  const points = sentences
    .filter((s) => terms.some((t) => s.includes(t)) && s.length >= 20)
    .slice(0, 10);
  res.json({
    title,
    outline: headings,
    terms,
    points,
    suggestedCards: terms.slice(0, 8).map((t, i) => ({
      type: i % 3 === 0 ? "cloze" : "basic",
      front: i % 3 === 0 ? `{{c1::${t}}}` : `什么是「${t}」？`,
      back: sentences.find((s) => s.includes(t)) || "",
      tags: [t],
    })),
  });
});

function splitSentences(text) {
  return text.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean);
}

ai.post("/ai/make-cards", (req, res) => {
  const { noteId, count = 6 } = req.body || {};
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId);
  if (!note) return res.status(404).json({ error: "笔记不存在" });
  const concepts = db.prepare(`SELECT c.* FROM note_concepts nc JOIN concepts c ON c.id = nc.concept_id
    WHERE nc.note_id = ?`).all(noteId);
  const sentences = splitSentences(stripMarkdown(note.content));
  const drafts = [];
  for (const c of concepts) {
    drafts.push({
      note_id: noteId, type: "basic", front: `什么是「${c.name}」？`,
      back: c.definition, tags: [c.name], source: "概念卡",
    });
  }
  const bolds = unique([...note.content.matchAll(/\*\*([^*]{2,20})\*\*/g)].map((m) => m[1]));
  for (const b of bolds) {
    const s = sentences.find((x) => x.includes(b));
    if (!s) continue;
    drafts.push({
      note_id: noteId, type: "cloze",
      front: s.replace(b, `{{c1::${b}}}`), back: s, tags: [b], source: "正文挖空",
    });
  }
  res.json({ drafts: drafts.slice(0, Number(count) || 6) });
});

/* ================= 出题（草稿，需人工审核） ================= */

ai.post("/ai/make-quiz", (req, res) => {
  const { noteId, count = 4 } = req.body || {};
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId);
  if (!note) return res.status(404).json({ error: "笔记不存在" });
  const concepts = db.prepare(`SELECT c.name, c.definition FROM note_concepts nc
    JOIN concepts c ON c.id = nc.concept_id WHERE nc.note_id = ?`).all(noteId);
  const sentences = splitSentences(stripMarkdown(note.content)).filter((s) => s.length > 24);
  const drafts = [];
  for (const c of concepts) {
    drafts.push({
      chapter: note.chapter, type: "term", stem: `名词解释：${c.name}`,
      options: [], answer: c.definition, rubric: c.definition.split(/[，。；]/).filter(Boolean).slice(0, 4),
      analysis: "对照概念定义，检查是否涵盖：性质、功能、与相邻概念的区别。",
      difficulty: 2, tags: [c.name], source: `AI 草稿·${note.title}`,
    });
  }
  for (const s of sentences.slice(0, 6)) {
    const terms = concepts.map((c) => c.name).filter((n) => s.includes(n));
    if (!terms.length) continue;
    drafts.push({
      chapter: note.chapter, type: "short", stem: `结合教材，说明「${terms[0]}」在下列论述中的作用：\n\n> ${s}`,
      options: [], answer: s, rubric: [terms[0], "教材定义", "结合材料"],
      analysis: "开放题，重点看是否准确使用术语并结合材料。",
      difficulty: 3, tags: terms, source: `AI 草稿·${note.title}`,
    });
  }
  res.json({
    drafts: drafts.slice(0, Number(count) || 4),
    warning: "AI 草稿仅供参考，请核对教材口径后再入库。",
  });
});
