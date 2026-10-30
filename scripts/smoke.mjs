// 端到端接口冒烟测试：在已启动的 API 服务上跑一遍完整学习流程。
const BASE = "http://127.0.0.1:8787/api";
let pass = 0, fail = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

// 1. 复习流程
let r = await call("GET", "/review/queue?limit=3");
check("队列返回卡片", r.data.cards?.length > 0, JSON.stringify(r.data).slice(0, 120));
const card = r.data.cards[0];
const preview = card.preview;
check("四档间隔预览齐全", ["1", "2", "3", "4"].every((k) => preview?.[k]?.label), JSON.stringify(preview));

const cardBefore = (await call("GET", `/review/preview/${card.id}`));
check("读取单卡预览", !!cardBefore.data.preview, JSON.stringify(cardBefore.data).slice(0, 120));
r = await call("POST", "/review/answer", { cardId: card.id, rating: 3, durationMs: 4200 });
check("评分写入成功", r.status === 200 && r.data.card, JSON.stringify(r.data).slice(0, 160));
const cardList = await call("GET", "/cards?limit=200");
const cardAfterCard = cardList.data.cards.find((c) => c.id === card.id);
check("状态从新卡变为学习/复习", cardAfterCard && cardAfterCard.state > 0, `state=${cardAfterCard?.state}`);

r = await call("GET", "/stats");
check("统计有复习记录", r.data.counts && r.data.today.reviews >= 1, JSON.stringify(r.data.today));

// 2. 错题流程：给一张卡评 1 分应进入错题本
const q = await call("GET", "/review/queue?limit=1&mode=all");
const card2 = q.data.cards.find((c) => c.id !== card.id) || q.data.cards[0];
await call("POST", "/review/answer", { cardId: card2.id, rating: 1, durationMs: 2000 });
const wb = await call("GET", "/wrongbook");
check("答错进入错题本", wb.data.items.some((i) => i.kind === "card"), JSON.stringify(wb.data).slice(0, 160));

// 3. 组卷 + 作答 + 判分
const qs = await call("GET", "/questions?type=choice");
const picked = qs.data.questions.slice(0, 2);
r = await call("POST", "/quiz/sessions", {
  title: "冒烟测试卷",
  mode: "practice",
  config: { chapters: [], types: ["choice"], counts: { choice: 2 }, minutes: 10 },
});
check("创建试卷", r.status === 200 && r.data.session?.items?.length === 2, JSON.stringify(r.data).slice(0, 160));
const session = r.data.session;

const responses = session.items.map((it) => ({
  questionId: it.question.id,
  response: it.question.answer,
  selfScore: 1,
}));
r = await call("POST", `/quiz/sessions/${session.id}/submit`, { responses, durationSec: 95 });
check("提交并出分", r.status === 200 && r.data.report?.pct === 100, JSON.stringify(r.data.report || r.data).slice(0, 200));

r = await call("POST", `/quiz/sessions/${session.id}/submit`, { responses, durationSec: 120 });
check("重复提交被拒绝", r.status === 400, `status=${r.status}`);

// 4. 自测判分（check 接口）
r = await call("POST", "/quiz/check", { questionId: picked[0].id, response: picked[0].answer });
check("单题判分正确", r.data.correct === true, JSON.stringify(r.data).slice(0, 140));

// 5. AI 学习助手
r = await call("POST", "/ai/ask", { mode: "explain", question: "什么是音位？它和音素有什么区别" });
check("AI 三段式回答", r.data.sections?.length === 3, JSON.stringify(r.data).slice(0, 160));
check("AI 回答有教材来源", (r.data.concepts?.length || 0) > 0);

r = await call("POST", "/ai/recite/start", { noteId: "n08" });
check("背诵抽题", r.data.prompts?.length > 0, JSON.stringify(r.data).slice(0, 120));
r = await call("POST", "/ai/recite/check", { noteId: "n08", answer: "音位是语言中能够区别意义的最小语音单位，音素是从音质角度划分的最小语音单位。" });
check("背诵批改给分", typeof r.data.score === "number", JSON.stringify(r.data).slice(0, 160));

r = await call("POST", "/ai/make-cards", { noteId: "n08", count: 3 });
check("AI 生成闪卡草稿", r.data.drafts?.length >= 1 && r.data.drafts.length <= 3, JSON.stringify(r.data).slice(0, 120));

// 6. 工具：参考文献 / 导出 / 导入
r = await call("POST", "/tools/refs", {
  type: "book", authors: "叶蜚声；徐通锵", title: "语言学纲要", place: "北京",
  publisher: "北京大学出版社", year: "2010", edition: "4",
});
check("GB/T 7714 格式化", r.data.items?.[0]?.text?.includes("北京大学出版社"), JSON.stringify(r.data).slice(0, 160));

r = await call("GET", "/export?scope=cards");
check("导出全部卡片", Array.isArray(r.data.cards) && r.data.cards.length === 60, `len=${r.data.cards?.length}`);

const csv = "front,back,tags\n语言,音义结合的符号系统,冒烟\n";
const imp = await fetch(BASE + "/import/cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format: "csv", data: csv }) });
const impData = await imp.json();
check("CSV 导入卡片", impData.imported >= 1, JSON.stringify(impData));

// 7. 笔记：新建 → 链接索引 → 搜索 → 删除
r = await call("POST", "/notes", { chapter: "c03", title: "冒烟测试笔记", summary: "临时", content: "关于[[概念:音位]]与[[n08]]的关系。", tags: ["临时"] });
check("新建笔记", r.status === 200 && r.data.note?.id, JSON.stringify(r.data).slice(0, 120));
const noteId = r.data.note?.id;
r = await call("GET", `/notes/${noteId}`);
check("笔记反链索引", r.data.outlinks?.length >= 1, JSON.stringify(r.data.outlinks));
r = await call("GET", "/search?q=音位");
check("搜索有结果", (r.data.notes?.length || 0) + (r.data.concepts?.length || 0) > 0, JSON.stringify(r.data).slice(0, 120));
r = await call("POST", `/notes/${noteId}/annotations`, { text: "这是摘录", note: "批注" });
const anns = await call("GET", `/notes/${noteId}`);
check("摘录批注", anns.data.annotations?.length === 1, JSON.stringify(anns.data.annotations));
await call("DELETE", `/notes/${noteId}`);
check("删除笔记", (await call("GET", `/notes/${noteId}`)).status === 404);

// 8. 备份 / 设置
r = await call("GET", "/backup/file");
check("下载备份接口返回非空", r.status === 200);
r = await call("PUT", "/settings", { retention: 0.9, new_per_day: 25 });
const st = await call("GET", "/settings"); check("设置写入", st.data.settings?.new_per_day === "25", JSON.stringify(st.data.settings));
r = await call("PUT", "/settings", { new_per_day: 20 });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
