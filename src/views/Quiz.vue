<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import { api, toast, fmt } from "../lib/api.js";
import { store, refreshStats } from "../lib/store.js";

const router = useRouter();
const tab = ref("bank"); // bank | build | history
const questions = ref([]);
const sessions = ref([]);
const loading = ref(false);
const filter = ref({ chapter: "", type: "", q: "" });

const TYPES = [
  { key: "choice", label: "选择", points: 2 },
  { key: "judge", label: "判断", points: 1 },
  { key: "term", label: "名词解释", points: 4 },
  { key: "short", label: "简答", points: 6 },
  { key: "material", label: "材料分析", points: 10 },
];

const build = ref({
  title: "自组练习卷",
  mode: "practice",
  chapters: [],
  types: ["choice", "judge", "term"],
  counts: { choice: 8, judge: 4, term: 2, short: 0, material: 0 },
  minutes: 30,
});

const selectedCount = computed(() => Object.values(build.value.counts).reduce((a, b) => a + (Number(b) || 0), 0));
const previewTotal = computed(() =>
  TYPES.reduce((a, t) => a + (Number(build.value.counts[t.key]) || 0) * t.points, 0)
);

async function loadQuestions() {
  loading.value = true;
  try {
    const p = new URLSearchParams();
    if (filter.value.chapter) p.set("chapter", filter.value.chapter);
    if (filter.value.type) p.set("type", filter.value.type);
    if (filter.value.q) p.set("q", filter.value.q);
    const res = await api.get(`/questions?${p}`);
    questions.value = res.questions || [];
  } catch (e) {
    toast(e.message, "error");
  } finally {
    loading.value = false;
  }
}

async function loadHistory() {
  try {
    const res = await api.get("/quiz/history");
    sessions.value = res.sessions || [];
  } catch (e) {
    toast(e.message, "error");
  }
}

function toggleChapter(id) {
  const i = build.value.chapters.indexOf(id);
  if (i >= 0) build.value.chapters.splice(i, 1);
  else build.value.chapters.push(id);
}

function toggleType(key) {
  const i = build.value.types.indexOf(key);
  if (i >= 0) build.value.types.splice(i, 1);
  else build.value.types.push(key);
}

async function createSession() {
  if (!selectedCount.value) return toast("请至少选择一道题", "error");
  loading.value = true;
  try {
    const res = await api.post("/quiz/sessions", {
      title: build.value.title || "自组练习卷",
      mode: build.value.mode,
      config: {
        chapters: build.value.chapters,
        types: build.value.types,
        counts: build.value.counts,
        minutes: build.value.mode === "exam" ? Number(build.value.minutes) || 45 : 0,
      },
    });
    router.push(`/quiz/session/${res.session.id}`);
  } catch (e) {
    toast(e.message, "error");
  } finally {
    loading.value = false;
  }
}

function typeLabel(t) {
  return TYPES.find((x) => x.key === t)?.label || t;
}

function answerPreview(q) {
  if (q.type === "choice") return q.answer;
  if (q.type === "judge") return q.answer;
  return (q.answer || "").slice(0, 60) + ((q.answer || "").length > 60 ? "…" : "");
}

onMounted(() => {
  loadQuestions();
  loadHistory();
});
</script>

<template>
  <div class="mx-auto w-full max-w-[1080px] px-5 py-6 md:px-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="eyebrow mb-1.5">自测 · 组卷 · 错题</div>
        <h2 class="font-serif text-[24px] text-fg">题库与练习</h2>
        <p class="mt-1 text-[12.5px] text-muted">
          共 {{ store.counts?.questions || questions.length }} 道题，{{ TYPES.length }} 种题型。主观题按参考要点自评。
        </p>
      </div>
      <div class="flex gap-2">
        <router-link to="/wrongbook" class="btn">
          <Icon name="wrong" :size="14" />错题本
        </router-link>
      </div>
    </header>

    <div class="mb-5 flex gap-1 border-b border-line">
      <button
        v-for="t in [{ k: 'bank', l: '题库' }, { k: 'build', l: '组卷' }, { k: 'history', l: '练习记录' }]"
        :key="t.k"
        class="relative -mb-px px-4 py-2 text-[13px] transition"
        :class="tab === t.k ? 'text-fg' : 'text-muted hover:text-fg'"
        @click="tab = t.k; t.k === 'history' && loadHistory()"
      >
        {{ t.l }}
        <span v-if="tab === t.k" class="absolute inset-x-2 -bottom-px h-[2px] rounded bg-accent" />
      </button>
    </div>

    <!-- 题库 -->
    <template v-if="tab === 'bank'">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <div class="relative">
          <Icon name="search" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input v-model="filter.q" class="field !w-[240px] !pl-8" placeholder="搜索题干…" @keyup.enter="loadQuestions" />
        </div>
        <select v-model="filter.chapter" class="field !w-[190px]" @change="loadQuestions">
          <option value="">全部章节</option>
          <option v-for="c in store.chapters" :key="c.id" :value="c.id">{{ c.ord }} · {{ c.title }}</option>
        </select>
        <select v-model="filter.type" class="field !w-[130px]" @change="loadQuestions">
          <option value="">全部题型</option>
          <option v-for="t in TYPES" :key="t.key" :value="t.key">{{ t.label }}</option>
        </select>
        <span class="ml-auto text-[11.5px] text-faint">{{ questions.length }} 道</span>
      </div>

      <div class="space-y-2">
        <details v-for="q in questions" :key="q.id" class="card group px-4 py-3">
          <summary class="flex cursor-pointer list-none items-start gap-3">
            <span class="mt-0.5 chip !py-0.5 !text-[10px]">{{ typeLabel(q.type) }}</span>
            <span class="flex-1 text-[13.5px] leading-relaxed text-fg">{{ q.stem }}</span>
            <span class="mt-0.5 font-mono text-[10px] text-faint">{{ q.points }}分</span>
          </summary>
          <div class="mt-3 space-y-2 border-t border-line pt-3 text-[12.5px]">
            <div v-if="q.options?.length" class="grid gap-1.5 sm:grid-cols-2">
              <div v-for="(o, i) in q.options" :key="i" class="rounded border border-line bg-surface2 px-2.5 py-1.5">
                <span class="mr-1.5 font-mono text-[10px] text-faint">{{ typeof o === "string" ? "ABCD"[i] : o.key }}</span>{{ typeof o === "string" ? o : o.text }}
              </div>
            </div>
            <div><span class="text-faint">参考答案：</span><span class="text-bamboo">{{ answerPreview(q) }}</span></div>
            <div v-if="q.rubric?.length">
              <div class="mb-1 text-faint">踩分点</div>
              <ul class="space-y-0.5 text-muted">
                <li v-for="(r, i) in q.rubric" :key="i" class="flex gap-1.5"><span class="text-accent">·</span>{{ r }}</li>
              </ul>
            </div>
            <div v-if="q.analysis" class="text-muted"><span class="text-faint">解析：</span>{{ q.analysis }}</div>
            <div class="flex items-center gap-2 pt-1 text-[10.5px] text-faint">
              <span>{{ q.chapterTitle }}</span><span>·</span><span>{{ q.source }}</span>
            </div>
          </div>
        </details>
        <div v-if="!questions.length && !loading" class="card px-4 py-12 text-center text-[13px] text-faint">没有匹配的题目</div>
      </div>
    </template>

    <!-- 组卷 -->
    <template v-else-if="tab === 'build'">
      <div class="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div class="space-y-5">
          <section class="card p-5">
            <div class="eyebrow mb-3">基本信息</div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label class="label">卷名</label>
                <input v-model="build.title" class="field" placeholder="如：语音与音位 专项" />
              </div>
              <div>
                <label class="label">模式</label>
                <div class="flex gap-2">
                  <button
                    v-for="m in [{ k: 'practice', l: '练习卷' }, { k: 'exam', l: '模拟套卷' }]"
                    :key="m.k"
                    class="btn flex-1"
                    :class="build.mode === m.k ? '!border-accent !text-accent' : ''"
                    @click="build.mode = m.k"
                  >{{ m.l }}</button>
                </div>
              </div>
              <div>
                <label class="label">限时（分钟）</label>
                <input v-model.number="build.minutes" type="number" min="5" max="180" class="field" :disabled="build.mode !== 'exam'" />
              </div>
            </div>
          </section>

          <section class="card p-5">
            <div class="eyebrow mb-3">章节范围 <span class="ml-1 font-normal normal-case tracking-normal text-faint">不选为全部</span></div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="c in store.chapters"
                :key="c.id"
                class="chip transition"
                :class="build.chapters.includes(c.id) ? '!border-accent !text-accent' : ''"
                @click="toggleChapter(c.id)"
              >{{ c.ord }} · {{ c.title }}</button>
            </div>
          </section>

          <section class="card p-5">
            <div class="eyebrow mb-3">题型与数量</div>
            <div class="space-y-2.5">
              <div v-for="t in TYPES" :key="t.key" class="flex items-center gap-3">
                <button
                  class="flex w-[110px] items-center gap-2 rounded border px-2.5 py-1.5 text-[12.5px]"
                  :class="build.types.includes(t.key) ? 'border-accent/60 text-fg' : 'border-line text-faint'"
                  @click="toggleType(t.key)"
                >
                  <span class="h-1.5 w-1.5 rounded-full" :class="build.types.includes(t.key) ? 'bg-accent' : 'bg-line2'" />
                  {{ t.label }}
                </button>
                <input
                  v-model.number="build.counts[t.key]"
                  type="number"
                  min="0"
                  max="20"
                  class="field !w-[76px] !py-1.5 text-center"
                  :disabled="!build.types.includes(t.key)"
                />
                <span class="text-[11px] text-faint">× {{ t.points }} 分</span>
              </div>
            </div>
          </section>
        </div>

        <aside class="space-y-4">
          <div class="card p-5 lg:sticky lg:top-4">
            <div class="eyebrow mb-3">本卷摘要</div>
            <dl class="space-y-2 text-[12.5px]">
              <div class="flex justify-between"><dt class="text-muted">题量</dt><dd class="font-mono">{{ selectedCount }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">总分</dt><dd class="font-mono">{{ previewTotal }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">章节</dt><dd>{{ build.chapters.length ? build.chapters.length + " 章" : "全部" }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">限时</dt><dd>{{ build.mode === "exam" ? build.minutes + " 分" : "不限" }}</dd></div>
            </dl>
            <p class="mt-4 text-[11px] leading-relaxed text-faint">
              组卷时按题型随机抽题；题量不足会以实际可用数量为准。
            </p>
            <button class="btn btn-accent mt-4 w-full py-2.5" :disabled="loading || !selectedCount" @click="createSession">
              开始答题
            </button>
          </div>
        </aside>
      </div>
    </template>

    <!-- 记录 -->
    <template v-else>
      <div v-if="sessions.length" class="space-y-2">
        <button
          v-for="s in sessions"
          :key="s.id"
          class="card flex w-full items-center gap-4 px-4 py-3 text-left transition hover:border-line2"
          @click="router.push(`/quiz/session/${s.id}`)"
        >
          <div class="flex-1">
            <div class="text-[13px] text-fg">{{ s.title }}</div>
            <div class="mt-0.5 text-[11px] text-faint">
              {{ fmt.dateTime(s.created_at) }} · {{ s.mode === "exam" ? "模拟套卷" : "练习" }}
              <span v-if="s.config?.chapters?.length"> · {{ s.config.chapters.length }} 章</span>
            </div>
          </div>
          <div v-if="s.submitted_at" class="text-right">
            <div class="font-mono text-[15px]" :class="(s.score / (s.total || 1)) >= 0.8 ? 'text-bamboo' : (s.score / (s.total || 1)) >= 0.6 ? 'text-warning' : 'text-danger'">
              {{ s.score }}<span class="text-[11px] text-faint">/{{ s.total }}</span>
            </div>
            <div class="text-[10.5px] text-faint">{{ Math.round((s.score / (s.total || 1)) * 100) }}%</div>
          </div>
          <span v-else class="chip !py-0.5 !text-[10px]">未提交</span>
        </button>
      </div>
      <div v-else class="card px-4 py-14 text-center text-[13px] text-faint">还没有练习记录</div>
    </template>
  </div>
</template>
