<script setup>
import { ref, computed, onMounted } from "vue";
import Icon from "../components/Icon.vue";
import { api, toast } from "../lib/api.js";
import { store } from "../lib/store.js";
import { renderMarkdown } from "../lib/markdown.js";

const tab = ref("ask"); // ask | recite | extract
const status = ref({ mode: "local" });
const question = ref("");
const mode = ref("explain");
const asking = ref(false);
const answer = ref(null);
const history = ref([]);

const noteId = ref("");
const recite = ref(null);
const reciteAnswer = ref("");
const reciteResult = ref(null);
const working = ref(false);

const source = ref("");
const extract = ref(null);
const cards = ref([]);
const quizDrafts = ref([]);
const chosen = ref(new Set());
const extractTab = ref("cards");

const examples = [
  "语言与言语的区别是什么？",
  "音位和音素有什么不同？",
  "组合关系与聚合关系如何区分？",
  "为什么说语言符号具有任意性？",
  "语法化与类推的差别",
];

const TONE = {
  primary: { border: "border-bamboo/50", text: "text-bamboo", bg: "bg-bamboo/[0.06]" },
  warning: { border: "border-warning/50", text: "text-warning", bg: "bg-warning/[0.06]" },
  muted: { border: "border-line2", text: "text-muted", bg: "bg-surface2/60" },
};

async function ask(text) {
  const qtext = (text ?? question.value).trim();
  if (!qtext) return toast("请输入问题", "error");
  question.value = qtext;
  asking.value = true;
  answer.value = null;
  try {
    const res = await api.post("/ai/ask", { mode: mode.value, question: qtext });
    answer.value = res;
    history.value = [{ q: qtext, mode: mode.value, at: Date.now() }, ...history.value].slice(0, 6);
  } catch (e) {
    toast(e.message, "error");
  } finally {
    asking.value = false;
  }
}

async function startRecite() {
  if (!noteId.value) return toast("请选择一篇笔记", "error");
  working.value = true;
  reciteResult.value = null;
  try {
    recite.value = await api.post("/ai/recite/start", { noteId: noteId.value });
    reciteAnswer.value = "";
  } catch (e) {
    toast(e.message, "error");
  } finally {
    working.value = false;
  }
}

async function checkRecite() {
  if (reciteAnswer.value.trim().length < 10) return toast("答案太短，再写几点", "error");
  working.value = true;
  try {
    reciteResult.value = await api.post("/ai/recite/check", { noteId: noteId.value, answer: reciteAnswer.value });
  } catch (e) {
    toast(e.message, "error");
  } finally {
    working.value = false;
  }
}

async function runExtract() {
  if (!noteId.value && !source.value.trim()) return toast("选择笔记或粘贴文本", "error");
  working.value = true;
  extract.value = null;
  try {
    extract.value = await api.post("/ai/extract", { noteId: noteId.value || undefined, text: source.value });
    cards.value = (extract.value.suggestedCards || []).map((c) => ({ ...c, checked: true }));
    extractTab.value = "cards";
  } catch (e) {
    toast(e.message, "error");
  } finally {
    working.value = false;
  }
}

async function genCards() {
  if (!noteId.value) return toast("请选择笔记", "error");
  working.value = true;
  try {
    const res = await api.post("/ai/make-cards", { noteId: noteId.value, count: 8 });
    cards.value = (res.drafts || []).map((c) => ({ ...c, checked: true }));
    extractTab.value = "cards";
  } catch (e) {
    toast(e.message, "error");
  } finally {
    working.value = false;
  }
}

async function genQuiz() {
  if (!noteId.value) return toast("请选择笔记", "error");
  working.value = true;
  try {
    const res = await api.post("/ai/make-quiz", { noteId: noteId.value, count: 6 });
    quizDrafts.value = (res.drafts || []).map((d) => ({ ...d, checked: true }));
    extractTab.value = "quiz";
  } catch (e) {
    toast(e.message, "error");
  } finally {
    working.value = false;
  }
}

async function saveCards() {
  const picked = cards.value.filter((c) => c.checked);
  if (!picked.length) return toast("未选择草稿", "error");
  working.value = true;
  let ok = 0;
  for (const c of picked) {
    try {
      await api.post("/cards", {
        note_id: noteId.value || null,
        type: c.type,
        front: c.front,
        back: c.back,
        tags: c.tags || [],
      });
      ok++;
    } catch (e) {
      /* 单条失败继续 */
    }
  }
  toast(`已入库 ${ok} 张闪卡，可在闪卡页复习`);
  cards.value = cards.value.filter((c) => !c.checked);
  working.value = false;
}

async function saveQuiz() {
  const picked = quizDrafts.value.filter((d) => d.checked);
  if (!picked.length) return toast("未选择草稿", "error");
  working.value = true;
  let ok = 0;
  for (const d of picked) {
    try {
      await api.post("/questions", d);
      ok++;
    } catch (e) {
      /* ignore */
    }
  }
  toast(`已入库 ${ok} 道题`);
  quizDrafts.value = quizDrafts.value.filter((d) => !d.checked);
  working.value = false;
}

function toggleAll(list, val) {
  list.forEach((x) => (x.checked = val));
}

function md(text) {
  return renderMarkdown(text || "");
}

onMounted(async () => {
  try {
    status.value = await api.get("/ai/status");
  } catch (e) {
    /* ignore */
  }
});
</script>

<template>
  <div class="mx-auto w-full max-w-[980px] px-5 py-6 md:px-8">
    <header class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="eyebrow mb-1.5">教材口径 · 本地接地</div>
        <h2 class="font-serif text-[24px] text-fg">AI 学习助手</h2>
        <p class="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          回答严格区分【教材主流结论 / 学界争议观点 / 小众假说】，只引用站内笔记与概念卡并标注来源；
          知识库没有的内容会明确说明，不作推断。
        </p>
      </div>
      <span class="chip" :class="status.mode === 'api' ? '!border-bamboo/40 !text-bamboo' : ''">
        <span class="mr-1 h-1.5 w-1.5 rounded-full" :class="status.mode === 'api' ? 'bg-bamboo' : 'bg-muted'" />
        {{ status.mode === "api" ? `接入模型 ${status.model}` : "本地检索模式" }}
      </span>
    </header>

    <div class="mb-5 flex gap-1 border-b border-line">
      <button
        v-for="t in [{ k: 'ask', l: '答疑与辨析' }, { k: 'recite', l: '背诵抽查' }, { k: 'extract', l: '提取考点 / 生成' }]"
        :key="t.k"
        class="relative -mb-px px-4 py-2 text-[13px] transition"
        :class="tab === t.k ? 'text-fg' : 'text-muted hover:text-fg'"
        @click="tab = t.k"
      >
        {{ t.l }}
        <span v-if="tab === t.k" class="absolute inset-x-2 -bottom-px h-[2px] rounded bg-accent" />
      </button>
    </div>

    <!-- 答疑 -->
    <template v-if="tab === 'ask'">
      <div class="card p-4">
        <div class="mb-3 flex gap-2">
          <button
            v-for="m in [{ k: 'explain', l: '概念答疑' }, { k: 'distinguish', l: '易混辨析' }]"
            :key="m.k"
            class="chip !px-3"
            :class="mode === m.k ? '!border-accent !text-accent' : ''"
            @click="mode = m.k"
          >{{ m.l }}</button>
          <span class="ml-auto text-[11px] text-faint">{{ mode === "distinguish" ? "问题中请包含两个概念" : "可自由提问" }}</span>
        </div>
        <div class="flex gap-2">
          <textarea
            v-model="question"
            class="field min-h-[62px] flex-1 resize-y !text-[13px]"
            :placeholder="mode === 'distinguish' ? '如：语言与言语的区别是什么？' : '如：为什么说音位是一种社会约定？'"
            @keydown.ctrl.enter="ask()"
          />
          <button class="btn btn-accent self-end px-4" :disabled="asking" @click="ask()">
            <Icon :name="asking ? 'loader' : 'send'" :size="15" :class="asking ? 'animate-spin' : ''" />
          </button>
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <button v-for="e in examples" :key="e" class="chip !text-[11px] hover:!border-line2" @click="ask(e)">{{ e }}</button>
        </div>
      </div>

      <div v-if="answer" class="mt-5 space-y-3">
        <div class="flex flex-wrap items-center gap-2 text-[11px] text-faint">
          <span>引擎：{{ answer.engine === "api+local" ? "模型接引 + 本地资料" : "本地检索" }}</span>
          <span>·</span>
          <span>引用 {{ answer.notes.length }} 篇笔记 / {{ answer.concepts.length }} 个概念</span>
        </div>

        <section v-for="s in answer.sections" :key="s.key" class="rounded-md border-l-2 px-4 py-3.5" :class="[TONE[s.tone].border, TONE[s.tone].bg]">
          <div class="mb-2 flex items-center gap-2">
            <span class="text-[11px] font-medium tracking-wide" :class="TONE[s.tone].text">【{{ s.label }}】</span>
            <span v-if="s.empty" class="text-[10px] text-faint">知识库未收录</span>
          </div>
          <div class="space-y-2">
            <div v-for="(b, i) in s.blocks" :key="i" class="text-[13px] leading-[1.85] text-fg/90">
              <div class="prose-lingua !text-[13px]" v-html="md(b.text)" />
              <router-link v-if="b.noteId" :to="`/library/${b.noteId}`" class="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-faint hover:text-bamboo">
                <Icon name="link" :size="10" />来源：{{ b.noteTitle }}
              </router-link>
            </div>
          </div>
        </section>

        <div v-if="answer.llm" class="card px-4 py-3.5">
          <div class="eyebrow mb-2">模型补充（需自行核对）</div>
          <div class="prose-lingua !text-[13px]" v-html="md(answer.llm)" />
        </div>

        <div class="card px-4 py-3">
          <div class="eyebrow mb-2">引用来源</div>
          <ul class="space-y-1 text-[11.5px] text-muted">
            <li v-for="(src, i) in answer.sources" :key="i">{{ src }}</li>
          </ul>
          <p class="mt-2 border-t border-line pt-2 text-[10.5px] text-faint">{{ answer.disclaimer }}</p>
        </div>

        <div v-if="answer.concepts.length" class="flex flex-wrap gap-1.5">
          <router-link v-for="c in answer.concepts" :key="c.id" to="/graph" class="chip !text-[11px]">
            {{ c.name }}<span v-if="c.school" class="ml-1 text-faint">{{ c.school }}</span>
          </router-link>
        </div>
      </div>

      <div v-else-if="!asking" class="mt-10 text-center">
        <div class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-muted">
          <Icon name="ai" :size="20" />
        </div>
        <p class="text-[12.5px] text-muted">提问后，助手会先检索站内笔记与概念卡，再按三段式组织回答。</p>
      </div>
    </template>

    <!-- 背诵 -->
    <template v-else-if="tab === 'recite'">
      <div class="card p-4">
        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-[240px] flex-1">
            <label class="label">抽查笔记</label>
            <select v-model="noteId" class="field">
              <option value="">选择一篇笔记…</option>
              <option v-for="n in store.notes" :key="n.id" :value="n.id">{{ n.chapterTitle }} · {{ n.title }}</option>
            </select>
          </div>
          <button class="btn btn-accent" :disabled="working" @click="startRecite">抽题</button>
        </div>
      </div>

      <div v-if="recite" class="mt-4 space-y-4">
        <div class="card px-5 py-4">
          <div class="eyebrow mb-2.5">{{ recite.note.title }} · 请口头作答后落笔</div>
          <ol class="space-y-2 text-[13px] leading-relaxed text-fg">
            <li v-for="(p, i) in recite.prompts" :key="i" class="flex gap-2"><span class="text-accent">{{ i + 1 }}.</span>{{ p }}</li>
          </ol>
          <div class="mt-3 flex flex-wrap gap-1">
            <span class="text-[10.5px] text-faint">关键词：</span>
            <span v-for="k in recite.keywords" :key="k" class="chip !py-0 !text-[10px]">{{ k }}</span>
          </div>
        </div>

        <div class="card p-4">
          <textarea v-model="reciteAnswer" class="field min-h-[170px] resize-y !text-[13px] leading-relaxed" placeholder="按踩分点写：定义 → 特征/分类 → 与相邻概念的区别 → 例子…" />
          <div class="mt-2 flex items-center gap-2">
            <button class="btn btn-accent" :disabled="working" @click="checkRecite">按踩分点批改</button>
            <span class="text-[11px] text-faint">{{ reciteAnswer.length }} 字</span>
          </div>
        </div>

        <div v-if="reciteResult" class="card px-5 py-4">
          <div class="flex items-baseline gap-3">
            <div class="font-serif text-[30px]" :class="reciteResult.score >= 70 ? 'text-bamboo' : reciteResult.score >= 45 ? 'text-warning' : 'text-danger'">{{ reciteResult.score }}</div>
            <div class="text-[11.5px] text-faint">术语覆盖 {{ reciteResult.coverage }}% · {{ reciteResult.length }} 字</div>
          </div>
          <div class="mt-3 space-y-1.5">
            <div v-for="(c, i) in reciteResult.comments" :key="i" class="border-l-2 border-line2 pl-2.5 text-[12px] leading-relaxed text-muted">{{ c }}</div>
          </div>
          <div v-if="reciteResult.missing.length" class="mt-3">
            <div class="text-[10.5px] text-faint">未覆盖</div>
            <div class="mt-1 flex flex-wrap gap-1">
              <span v-for="k in reciteResult.missing" :key="k" class="chip !border-danger/30 !py-0 !text-[10px] !text-danger/80">{{ k }}</span>
            </div>
          </div>
          <div class="mt-4 border-t border-line pt-3">
            <div class="eyebrow mb-2">参考段落</div>
            <div v-for="(p, i) in reciteResult.reference" :key="i" class="prose-lingua mb-2 !text-[12.5px]" v-html="md(p)" />
          </div>
        </div>
      </div>
    </template>

    <!-- 提取 -->
    <template v-else>
      <div class="card p-4">
        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <label class="label">从笔记提取</label>
            <select v-model="noteId" class="field">
              <option value="">选择笔记…</option>
              <option v-for="n in store.notes" :key="n.id" :value="n.id">{{ n.title }}</option>
            </select>
          </div>
          <div class="md:row-span-2">
            <label class="label">或粘贴文本（课件 / 笔记 / 摘录）</label>
            <textarea v-model="source" class="field min-h-[92px] resize-y !text-[12px]" placeholder="粘贴 PPT 文字、阅读笔记…" />
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-accent" :disabled="working" @click="runExtract"><Icon name="layers" :size="14" />提取考点</button>
            <button class="btn" :disabled="working" @click="genCards"><Icon name="cards" :size="14" />生成闪卡</button>
            <button class="btn" :disabled="working" @click="genQuiz"><Icon name="quiz" :size="14" />生成题目</button>
          </div>
        </div>
      </div>

      <div v-if="extract" class="mt-4 grid gap-4 md:grid-cols-[240px_1fr]">
        <aside class="space-y-3">
          <div class="card p-4">
            <div class="eyebrow mb-2">结构</div>
            <ul v-if="extract.outline.length" class="space-y-1 text-[11.5px] text-muted">
              <li v-for="(h, i) in extract.outline" :key="i" class="truncate">· {{ h }}</li>
            </ul>
            <p v-else class="text-[11.5px] text-faint">未识别到小标题</p>
          </div>
          <div class="card p-4">
            <div class="eyebrow mb-2">术语</div>
            <div class="flex flex-wrap gap-1">
              <span v-for="t in extract.terms" :key="t" class="chip !py-0 !text-[10px]">{{ t }}</span>
            </div>
          </div>
        </aside>
        <div>
          <div class="mb-3 flex items-center gap-2">
            <button class="chip" :class="extractTab === 'cards' ? '!border-accent !text-accent' : ''" @click="extractTab = 'cards'">
              闪卡草稿 {{ cards.length }}
            </button>
            <button class="chip" :class="extractTab === 'quiz' ? '!border-accent !text-accent' : ''" @click="extractTab = 'quiz'">
              题目草稿 {{ quizDrafts.length }}
            </button>
            <span class="ml-auto text-[10.5px] text-faint">草稿需人工核对后入库</span>
          </div>

          <template v-if="extractTab === 'cards'">
            <div v-if="cards.length" class="space-y-2">
              <div v-for="(c, i) in cards" :key="i" class="card flex items-start gap-3 px-3.5 py-2.5">
                <input v-model="c.checked" type="checkbox" class="mt-1 accent-[var(--accent)]" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="chip !py-0 !text-[9.5px]">{{ c.type === "cloze" ? "填空" : "问答" }}</span>
                    <span class="text-[10.5px] text-faint">{{ (c.tags || []).join(" · ") }}</span>
                  </div>
                  <div class="mt-1 text-[12.5px] text-fg">{{ c.front }}</div>
                  <div class="mt-0.5 line-clamp-2 text-[11.5px] text-muted">{{ c.back }}</div>
                </div>
                <button class="text-faint hover:text-danger" @click="cards.splice(i, 1)"><Icon name="x" :size="13" /></button>
              </div>
              <div class="flex gap-2">
                <button class="btn btn-accent" :disabled="working" @click="saveCards">入库选中</button>
                <button class="btn" @click="toggleAll(cards, true)">全选</button>
              </div>
            </div>
            <div v-else class="card px-4 py-10 text-center text-[12px] text-faint">尚无草稿，点击「提取考点」或「生成闪卡」</div>
          </template>

          <template v-else>
            <div v-if="quizDrafts.length" class="space-y-2">
              <div v-for="(d, i) in quizDrafts" :key="i" class="card flex items-start gap-3 px-3.5 py-2.5">
                <input v-model="d.checked" type="checkbox" class="mt-1 accent-[var(--accent)]" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="chip !py-0 !text-[9.5px]">{{ { term: "名词解释", short: "简答" }[d.type] || d.type }}</span>
                    <span class="text-[10.5px] text-faint">{{ d.source }}</span>
                  </div>
                  <div class="mt-1 whitespace-pre-wrap text-[12.5px] text-fg">{{ d.stem }}</div>
                  <details class="mt-1">
                    <summary class="cursor-pointer text-[10.5px] text-faint">参考答案与踩分点</summary>
                    <div class="mt-1 whitespace-pre-wrap rounded bg-surface2 p-2 text-[11.5px] text-muted">{{ d.answer }}</div>
                    <div class="mt-1 flex flex-wrap gap-1">
                      <span v-for="(r, j) in d.rubric" :key="j" class="chip !py-0 !text-[9.5px]">{{ r }}</span>
                    </div>
                  </details>
                </div>
                <button class="text-faint hover:text-danger" @click="quizDrafts.splice(i, 1)"><Icon name="x" :size="13" /></button>
              </div>
              <div class="flex gap-2">
                <button class="btn btn-accent" :disabled="working" @click="saveQuiz">审核后入库</button>
                <button class="btn" @click="toggleAll(quizDrafts, true)">全选</button>
              </div>
            </div>
            <div v-else class="card px-4 py-10 text-center text-[12px] text-faint">尚无题目草稿，点击「生成题目」</div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
