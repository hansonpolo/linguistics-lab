<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import { api, toast, fmt } from "../lib/api.js";
import { store, refreshStats } from "../lib/store.js";

const router = useRouter();
const phase = ref("intro"); // intro | running | done
const queue = ref([]);
const idx = ref(0);
const revealed = ref(false);
const counts = ref({ learning: 0, review: 0, new: 0 });
const limits = ref({});
const mode = ref("all");
const chapter = ref("");
const limit = ref(30);
const loading = ref(false);
const results = ref([]);
const cardStart = ref(0);
const sessionStart = ref(0);
const saving = ref(false);
const showHint = ref(false);

const card = computed(() => queue.value[idx.value] || null);
const progress = computed(() => (queue.value.length ? ((idx.value + (revealed.value ? 0.5 : 0)) / queue.value.length) * 100 : 0));
const elapsed = computed(() => (sessionStart.value ? Math.round((Date.now() - sessionStart.value) / 1000) : 0));

const RATINGS = [
  { value: 1, label: "忘记", key: "1", cls: "hover:border-danger hover:text-danger" },
  { value: 2, label: "困难", key: "2", cls: "hover:border-warning hover:text-warning" },
  { value: 3, label: "良好", key: "3", cls: "hover:border-bamboo hover:text-bamboo" },
  { value: 4, label: "容易", key: "4", cls: "hover:border-indigo hover:text-indigo" },
];

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clozeHtml(text, reveal) {
  let out = escapeHtml(text);
  out = out.replace(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g, (_, ans, hint) => {
    if (reveal) return `<span class="rounded bg-bamboo/20 px-1 text-bamboo">${ans}</span>`;
    return `<span class="inline-block min-w-[64px] border-b border-dashed border-accent/70 text-center align-middle text-accent/70">${hint || "　"}</span>`;
  });
  return out.replace(/\n/g, "<br/>");
}

const frontHtml = computed(() =>
  card.value ? (card.value.type === "cloze" ? clozeHtml(card.value.front, false) : escapeHtml(card.value.front).replace(/\n/g, "<br/>")) : ""
);
const backHtml = computed(() =>
  card.value ? (card.value.type === "cloze" ? clozeHtml(card.value.front, true) : escapeHtml(card.value.back).replace(/\n/g, "<br/>")) : ""
);

async function loadQueue() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ mode: mode.value, limit: String(limit.value) });
    if (chapter.value) params.set("chapter", chapter.value);
    const res = await api.get(`/review/queue?${params}`);
    queue.value = res.cards || [];
    counts.value = res.counts || {};
    limits.value = res.limits || {};
    if (!queue.value.length) {
      toast("当前没有到期的卡片，去学一篇新笔记吧");
    } else {
      startSession();
    }
  } catch (e) {
    toast(e.message, "error");
  } finally {
    loading.value = false;
  }
}

function startSession() {
  idx.value = 0;
  revealed.value = false;
  results.value = [];
  sessionStart.value = Date.now();
  cardStart.value = Date.now();
  phase.value = "running";
}

function flip() {
  if (!card.value) return;
  revealed.value = true;
}

async function rate(value) {
  if (!revealed.value || !card.value || saving.value) return;
  saving.value = true;
  const durationMs = Date.now() - cardStart.value;
  try {
    const res = await api.post("/review/answer", { cardId: card.value.id, rating: value, durationMs });
    results.value.push({ id: card.value.id, rating: value, next: res?.card?.due, interval: card.value.preview?.[value]?.label });
    if (idx.value + 1 >= queue.value.length) {
      phase.value = "done";
      refreshStats();
    } else {
      idx.value += 1;
      revealed.value = false;
      cardStart.value = Date.now();
    }
  } catch (e) {
    toast(e.message, "error");
  } finally {
    saving.value = false;
  }
}

const summary = computed(() => {
  const s = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of results.value) s[r.rating] = (s[r.rating] || 0) + 1;
  const total = results.value.length || 1;
  return {
    ...s,
    total: results.value.length,
    retention: Math.round(((s[3] + s[4]) / total) * 100),
    minutes: Math.max(1, Math.round((Date.now() - sessionStart.value) / 60000)),
  };
});

function onKey(e) {
  if (phase.value !== "running") return;
  if (e.code === "Space" || e.key === "Enter") {
    e.preventDefault();
    if (!revealed.value) flip();
    return;
  }
  if (["1", "2", "3", "4"].includes(e.key) && revealed.value) {
    rate(Number(e.key));
  }
  if (e.key === "Escape") router.push("/");
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-[860px] flex-col px-5 py-6 md:px-8">
    <!-- 入口 -->
    <template v-if="phase === 'intro'">
      <div class="mt-6">
        <div class="eyebrow mb-2">间隔重复 · FSRS-5</div>
        <h2 class="font-serif text-[26px] text-fg">今天的队列</h2>
        <p class="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">
          队列按到期时间与新卡配额生成。评分会直接改写卡片的稳定度与下次到期日，保留率目标
          {{ Math.round((store.settings?.retention || 0.9) * 100) }}%。
        </p>

        <div class="mt-7 grid gap-3 sm:grid-cols-3">
          <div class="card px-4 py-3">
            <div class="eyebrow">待复习</div>
            <div class="mt-1 font-serif text-[24px]">{{ counts.review ?? "—" }}</div>
          </div>
          <div class="card px-4 py-3">
            <div class="eyebrow">学习中</div>
            <div class="mt-1 font-serif text-[24px]">{{ counts.learning ?? "—" }}</div>
          </div>
          <div class="card px-4 py-3">
            <div class="eyebrow">新卡</div>
            <div class="mt-1 font-serif text-[24px] text-bamboo">{{ counts.new ?? "—" }}</div>
          </div>
        </div>

        <div class="mt-6 grid gap-3 sm:grid-cols-3">
          <div>
            <label class="label">模式</label>
            <select v-model="mode" class="field">
              <option value="all">混合（推荐）</option>
              <option value="new">只学新卡</option>
              <option value="due">只复习到期</option>
            </select>
          </div>
          <div>
            <label class="label">章节</label>
            <select v-model="chapter" class="field">
              <option value="">全部章节</option>
              <option v-for="c in store.chapters" :key="c.id" :value="c.id">{{ c.ord }} · {{ c.title }}</option>
            </select>
          </div>
          <div>
            <label class="label">本轮上限</label>
            <select v-model="limit" class="field">
              <option :value="10">10 张</option>
              <option :value="20">20 张</option>
              <option :value="30">30 张</option>
              <option :value="50">50 张</option>
              <option :value="100">100 张</option>
            </select>
          </div>
        </div>

        <div class="mt-6 flex items-center gap-3">
          <button class="btn btn-accent px-5 py-2.5" :disabled="loading" @click="loadQueue">
            <Icon name="play" :size="15" />{{ loading ? "生成中…" : "开始复习" }}
          </button>
          <router-link to="/cards" class="btn">管理卡片</router-link>
          <span class="ml-auto text-[11px] text-faint">
            今日已复习 {{ store.stats?.today?.reviews || 0 }} 次
          </span>
        </div>

        <div class="card mt-8 p-4">
          <div class="eyebrow mb-2">键盘</div>
          <div class="flex flex-wrap gap-x-6 gap-y-2 text-[11.5px] text-muted">
            <span><span class="kbd">空格</span> 翻面</span>
            <span><span class="kbd">1</span> 忘记</span>
            <span><span class="kbd">2</span> 困难</span>
            <span><span class="kbd">3</span> 良好</span>
            <span><span class="kbd">4</span> 容易</span>
            <span><span class="kbd">esc</span> 退出</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 复习中 -->
    <template v-else-if="phase === 'running' && card">
      <div class="mb-4 flex items-center gap-3">
        <span class="font-mono text-[11px] text-faint">{{ idx + 1 }} / {{ queue.length }}</span>
        <div class="h-[3px] flex-1 overflow-hidden rounded-full bg-surface2">
          <div class="h-full rounded-full bg-accent transition-all duration-300" :style="{ width: progress + '%' }" />
        </div>
        <span class="text-[11px] text-faint">{{ card.chapterTitle }}</span>
      </div>

      <div class="flex flex-1 flex-col">
        <div class="card relative flex min-h-[320px] flex-col px-6 py-7 md:px-9">
          <div class="mb-4 flex items-center gap-2">
            <span class="chip !py-0.5 !text-[10px]">{{ { basic: "问答", cloze: "填空", contrast: "辨析", image: "图片" }[card.type] || card.type }}</span>
            <span v-if="card.note_title" class="text-[11px] text-faint">{{ card.note_title }}</span>
            <button class="ml-auto text-[11px] text-faint hover:text-accent" @click="showHint = !showHint">
              <Icon name="eye" :size="13" />
            </button>
          </div>

          <div v-if="showHint && card.back" class="mb-4 rounded-md border border-dashed border-line bg-surface2 px-3 py-2 text-[11.5px] text-muted">
            提示：{{ card.back.slice(0, 40) }}…
          </div>

          <div class="flex flex-1 items-center justify-center">
            <div
              class="prose-lingua w-full text-center font-serif text-[20px] leading-relaxed md:text-[23px]"
              v-html="revealed ? backHtml : frontHtml"
            />
          </div>

          <div v-if="revealed && card.back && card.type !== 'cloze'" class="mt-6 border-t border-line pt-5">
            <div class="eyebrow mb-2">答案</div>
            <div class="prose-lingua !text-[15px] leading-relaxed" v-html="backHtml" />
          </div>

          <div v-if="card.image" class="mt-4">
            <img :src="card.image" alt="" class="mx-auto max-h-[240px] rounded-md border border-line" />
          </div>
        </div>

        <div class="mt-4">
          <button v-if="!revealed" class="btn btn-accent w-full py-3 text-[13.5px]" @click="flip">
            显示答案 <span class="kbd ml-1 !border-white/20 !bg-white/10 !text-white/70">空格</span>
          </button>
          <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              v-for="r in RATINGS"
              :key="r.value"
              class="flex flex-col items-center gap-0.5 rounded-md border border-line bg-surface px-2 py-2.5 transition disabled:opacity-50"
              :class="r.cls"
              :disabled="saving"
              @click="rate(r.value)"
            >
              <span class="text-[12.5px] font-medium">{{ r.label }}</span>
              <span class="font-mono text-[10.5px] text-faint">{{ card.preview?.[r.value]?.label || "—" }}</span>
              <span class="kbd">{{ r.key }}</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 完成 -->
    <template v-else-if="phase === 'done'">
      <div class="mt-8 text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bamboo/15 text-bamboo">
          <Icon name="check" :size="22" />
        </div>
        <h2 class="font-serif text-[24px] text-fg">本轮完成</h2>
        <p class="mt-1 text-[12.5px] text-muted">共 {{ summary.total }} 张 · {{ summary.minutes }} 分钟 · 3/4 评分占比 {{ summary.retention }}%</p>

        <div class="mx-auto mt-7 grid max-w-md grid-cols-4 gap-2">
          <div class="card py-3"><div class="text-[10.5px] text-faint">忘记</div><div class="font-serif text-[20px] text-danger">{{ summary[1] }}</div></div>
          <div class="card py-3"><div class="text-[10.5px] text-faint">困难</div><div class="font-serif text-[20px] text-warning">{{ summary[2] }}</div></div>
          <div class="card py-3"><div class="text-[10.5px] text-faint">良好</div><div class="font-serif text-[20px] text-bamboo">{{ summary[3] }}</div></div>
          <div class="card py-3"><div class="text-[10.5px] text-faint">容易</div><div class="font-serif text-[20px] text-indigo">{{ summary[4] }}</div></div>
        </div>

        <div class="mt-7 flex justify-center gap-2">
          <button class="btn btn-accent" @click="phase = 'intro'; loadQueue()">再来一轮</button>
          <router-link to="/" class="btn">回到今日</router-link>
          <router-link to="/stats" class="btn" @click.prevent="router.push('/')">看统计</router-link>
        </div>

        <div class="mx-auto mt-10 max-w-lg text-left">
          <div class="eyebrow mb-2">本轮明细</div>
          <div class="card max-h-[240px] divide-y divide-line overflow-y-auto">
            <div v-for="(r, i) in results" :key="i" class="flex items-center gap-3 px-3.5 py-2 text-[11.5px]">
              <span class="font-mono text-faint">{{ String(i + 1).padStart(2, "0") }}</span>
              <span class="flex-1 truncate text-muted">{{ queue[i]?.front }}</span>
              <span class="chip !py-0.5 !text-[9.5px]">{{ RATINGS.find(x => x.value === r.rating)?.label }}</span>
              <span class="font-mono text-[10px] text-faint">{{ r.interval }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
