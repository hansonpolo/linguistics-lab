<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import { api, toast, fmt } from "../lib/api.js";
import { refreshStats } from "../lib/store.js";

const route = useRoute();
const router = useRouter();
const session = ref(null);
const submitted = ref(false);
const report = ref(null);
const loading = ref(true);
const idx = ref(0);
const responses = reactive({});
const revealRef = reactive({});
const saving = ref(false);
const remain = ref(0);
const startedAt = Date.now();
let timer = null;

const TYPES = {
  choice: { label: "选择", points: 2 },
  judge: { label: "判断", points: 1 },
  term: { label: "名词解释", points: 4 },
  short: { label: "简答", points: 6 },
  material: { label: "材料分析", points: 10 },
};

const items = computed(() => session.value?.items || []);
const item = computed(() => items.value[idx.value] || null);
const q = computed(() => item.value?.question || null);
const answeredCount = computed(() => items.value.filter((it) => isAnswered(it.question)).length);

function isAnswered(question) {
  const r = responses[question.id];
  if (!r) return false;
  if (question.type === "choice" || question.type === "judge") return !!r.response;
  return !!String(r.response || "").trim() || r.selfScore !== undefined;
}

function optionText(o) {
  return typeof o === "string" ? o : o?.text || "";
}
function optionKey(o, i) {
  return typeof o === "string" ? "ABCD"[i] : o?.key || "ABCD"[i];
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get(`/quiz/sessions/${route.params.id}`);
    session.value = res.session;
    submitted.value = res.submitted;
    report.value = res.result;
    if (res.submitted) {
      for (const it of res.session.items || []) {
        responses[it.question.id] = { response: it.response, selfScore: it.selfScore, feedback: it.feedback };
      }
    } else if (res.session.minutes) {
      remain.value = res.session.minutes * 60;
      startedAt.value = new Date(res.session.created_at || Date.now()).getTime();
      const spent = Math.round((Date.now() - startedAt.value) / 1000);
      remain.value = Math.max(0, res.session.minutes * 60 - spent);
      timer = setInterval(() => {
        remain.value = Math.max(0, remain.value - 1);
        if (remain.value === 0) {
          clearInterval(timer);
          submit(true);
        }
      }, 1000);
    }
  } catch (e) {
    toast(e.message, "error");
  } finally {
    loading.value = false;
  }
}

function ensure(qid) {
  if (!responses[qid]) responses[qid] = { response: "", selfScore: undefined, feedback: "" };
  return responses[qid];
}

function pick(question, key) {
  ensure(question.id).response = key;
}

function setSelf(question, ratio) {
  const r = ensure(question.id);
  r.selfScore = ratio;
}

function setFeedback(question, val) {
  ensure(question.id).feedback = val;
}

const clock = computed(() => {
  const m = Math.floor(remain.value / 60);
  const s = remain.value % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
});

async function submit(auto = false) {
  if (saving.value) return;
  if (!auto) {
    const blank = items.value.filter((it) => !String(responses[it.question.id]?.response || "").trim());
    if (blank.length && !window.confirm(`还有 ${blank.length} 题未作答，确定提交？`)) return;
    if (!window.confirm("提交后不可修改，确定交卷？")) return;
  }
  saving.value = true;
  try {
    const payload = items.value.map((it) => {
      const r = responses[it.question.id] || {};
      return {
        questionId: it.question.id,
        response: r.response || "",
        selfScore: r.selfScore,
        feedback: r.feedback || "",
      };
    });
    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    const res = await api.post(`/quiz/sessions/${route.params.id}/submit`, { responses: payload, durationSec });
    report.value = res.report;
    submitted.value = true;
    if (session.value) session.value = { ...session.value, submitted_at: new Date().toISOString() };
    if (timer) clearInterval(timer);
    refreshStats();
    window.scrollTo({ top: 0 });
  } catch (e) {
    toast(e.message, "error");
  } finally {
    saving.value = false;
  }
}

function go(i) {
  idx.value = Math.max(0, Math.min(items.value.length - 1, i));
}

function scoreOf(it) {
  return report.value?.items?.find((x) => x.question.id === it.question.id);
}

function ansRate(v) {
  return Math.round(((v.score || 0) / (v.total || 1)) * 100);
}

onMounted(load);
onBeforeUnmount(() => timer && clearInterval(timer));
</script>

<template>
  <div class="mx-auto w-full max-w-[900px] px-5 py-6 md:px-8">
    <div v-if="loading" class="py-20 text-center text-[12.5px] text-faint">载入中…</div>

    <template v-else-if="session && !submitted">
      <header class="mb-4 flex items-center gap-3">
        <button class="btn !px-2.5 !py-1.5" @click="router.push('/quiz')"><Icon name="chevron" :size="14" class="rotate-180" /></button>
        <div class="flex-1">
          <h2 class="font-serif text-[18px] text-fg">{{ session.title }}</h2>
          <div class="text-[11px] text-faint">
            已答 {{ answeredCount }} / {{ items.length }} · {{ session.mode === "exam" ? "模拟套卷" : "练习" }}
          </div>
        </div>
        <div v-if="session.minutes" class="rounded-md border px-3 py-1.5 font-mono text-[15px]"
          :class="remain < 120 ? 'border-danger/50 text-danger' : 'border-line text-fg'">{{ clock }}</div>
        <button class="btn btn-accent" :disabled="saving" @click="submit(false)">交卷</button>
      </header>

      <!-- 题目导航 -->
      <div class="mb-4 flex flex-wrap gap-1">
        <button
          v-for="(it, i) in items"
          :key="it.question.id"
          class="h-7 w-7 rounded font-mono text-[10.5px] transition"
          :class="i === idx ? 'bg-accent text-white' : isAnswered(it.question) ? 'bg-bamboo/15 text-bamboo' : 'bg-surface2 text-faint hover:text-fg'"
          @click="go(i)"
        >{{ i + 1 }}</button>
      </div>

      <div v-if="q" class="card px-5 py-5 md:px-7">
        <div class="mb-3 flex items-center gap-2">
          <span class="chip !py-0.5 !text-[10px]">{{ TYPES[q.type]?.label || q.type }}</span>
          <span class="text-[11px] text-faint">{{ q.chapterTitle }}</span>
          <span class="ml-auto font-mono text-[10.5px] text-faint">{{ q.points }} 分</span>
        </div>

        <div class="mb-4 whitespace-pre-wrap font-serif text-[15.5px] leading-[1.9] text-fg">{{ q.stem }}</div>

        <!-- 选择 -->
        <div v-if="q.type === 'choice'" class="space-y-2">
          <button
            v-for="(o, i) in q.options"
            :key="i"
            class="flex w-full items-start gap-3 rounded-md border px-3.5 py-2.5 text-left text-[13px] leading-relaxed transition"
            :class="responses[q.id]?.response === optionKey(o, i) ? 'border-accent/70 bg-accent/[0.07]' : 'border-line hover:border-line2'"
            @click="pick(q, optionKey(o, i))"
          >
            <span class="mt-px font-mono text-[11px]" :class="responses[q.id]?.response === optionKey(o, i) ? 'text-accent' : 'text-faint'">{{ optionKey(o, i) }}</span>
            <span class="text-fg">{{ optionText(o) }}</span>
          </button>
        </div>

        <!-- 判断 -->
        <div v-else-if="q.type === 'judge'" class="flex gap-2">
          <button
            v-for="v in ['正确', '错误']"
            :key="v"
            class="btn flex-1 py-2.5"
            :class="responses[q.id]?.response === v ? '!border-accent !text-accent' : ''"
            @click="pick(q, v)"
          >{{ v }}</button>
        </div>

        <!-- 主观 -->
        <div v-else>
          <textarea
            :value="responses[q.id]?.response || ''"
            class="field min-h-[150px] resize-y !text-[13px] leading-relaxed"
            :placeholder="q.type === 'term' ? '写出定义，尽量包含属概念与区别性特征…' : '分点作答，按踩分点组织…'"
            @input="ensure(q.id).response = $event.target.value"
          />
          <div class="mt-3 flex items-center gap-2">
            <button class="btn !py-1.5 text-[12px]" @click="revealRef[q.id] = !revealRef[q.id]">
              <Icon name="eye" :size="13" />{{ revealRef[q.id] ? "收起参考答案" : "对照参考答案" }}
            </button>
            <span class="text-[11px] text-faint">自评：</span>
            <div class="flex gap-1">
              <button
                v-for="r in [{ v: 1, l: '全对' }, { v: 0.75, l: '较好' }, { v: 0.5, l: '一半' }, { v: 0.25, l: '少量' }, { v: 0, l: '未答' }]"
                :key="r.v"
                class="rounded border px-2 py-1 text-[10.5px] transition"
                :class="responses[q.id]?.selfScore === r.v ? 'border-bamboo/60 bg-bamboo/10 text-bamboo' : 'border-line text-faint hover:text-fg'"
                @click="setSelf(q, r.v)"
              >{{ r.l }}</button>
            </div>
          </div>
          <div v-if="revealRef[q.id]" class="mt-3 rounded-md border border-line bg-surface2 p-3.5 text-[12.5px] leading-relaxed">
            <div class="mb-1 text-[10.5px] uppercase tracking-wider text-faint">参考答案</div>
            <div class="whitespace-pre-wrap text-fg">{{ q.answer }}</div>
            <div v-if="q.rubric?.length" class="mt-3">
              <div class="mb-1 text-[10.5px] uppercase tracking-wider text-faint">踩分点</div>
              <ul class="space-y-1 text-muted">
                <li v-for="(r, i) in q.rubric" :key="i" class="flex gap-2"><span class="text-accent">{{ i + 1 }}.</span>{{ r }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between">
        <button class="btn" :disabled="idx === 0" @click="go(idx - 1)"><Icon name="chevron" :size="14" class="rotate-180" />上一题</button>
        <span class="font-mono text-[11px] text-faint">{{ idx + 1 }} / {{ items.length }}</span>
        <button v-if="idx < items.length - 1" class="btn" @click="go(idx + 1)">下一题<Icon name="chevron" :size="14" /></button>
        <button v-else class="btn btn-accent" :disabled="saving" @click="submit(false)">交卷</button>
      </div>
    </template>

    <!-- 报告 -->
    <template v-else-if="report">
      <header class="mb-6">
        <button class="mb-3 text-[12px] text-faint hover:text-accent" @click="router.push('/quiz')">← 返回题库</button>
        <h2 class="font-serif text-[22px] text-fg">{{ session?.title }}</h2>
        <p class="mt-1 text-[12px] text-muted">
          交卷于 {{ fmt.dateTime(session?.submitted_at) }} · 用时 {{ fmt.mins(report.durationSec / 60) }}
        </p>
      </header>

      <div class="grid gap-4 sm:grid-cols-[220px_1fr]">
        <div class="card flex flex-col items-center justify-center py-7">
          <div class="font-serif text-[40px]" :class="report.pct >= 80 ? 'text-bamboo' : report.pct >= 60 ? 'text-warning' : 'text-danger'">{{ report.pct }}<span class="text-[16px]">%</span></div>
          <div class="mt-1 text-[11.5px] text-faint">{{ report.score }} / {{ report.total }} 分</div>
          <div class="mt-4 w-full space-y-1.5 px-5">
            <div v-for="(v, k) in report.byType" :key="k" class="flex items-center justify-between text-[11px]">
              <span class="text-muted">{{ TYPES[k]?.label || k }} ×{{ v.count }}</span>
              <span class="font-mono" :class="v.score / (v.total || 1) >= 0.6 ? 'text-bamboo' : 'text-danger'">{{ ansRate(v) }}%</span>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <div v-for="it in report.items" :key="it.question.id" class="card px-4 py-3">
            <div class="flex items-start gap-3">
              <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]"
                :class="it.correct ? 'bg-bamboo/15 text-bamboo' : 'bg-danger/15 text-danger'">
                <Icon :name="it.correct ? 'check' : 'x'" :size="11" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-[13px] leading-relaxed text-fg">{{ it.question.stem }}</div>
                <div class="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11.5px]">
                  <span class="text-faint">你的答案：<span :class="it.correct ? 'text-bamboo' : 'text-danger'">{{ it.response || "（未答）" }}</span></span>
                  <span v-if="!it.correct" class="text-faint">参考：<span class="text-fg">{{ it.question.answer }}</span></span>
                  <span class="ml-auto font-mono text-[10.5px] text-faint">{{ it.score }} / {{ it.question.points }}</span>
                </div>
                <div v-if="!it.correct && it.question.analysis" class="mt-2 rounded border-l-2 border-accent/40 bg-surface2 py-1.5 pl-2.5 text-[11.5px] leading-relaxed text-muted">
                  {{ it.question.analysis }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 flex gap-2">
        <router-link to="/wrongbook" class="btn"><Icon name="wrong" :size="14" />查看错题本</router-link>
        <router-link to="/quiz" class="btn">再组一卷</router-link>
      </div>
    </template>
  </div>
</template>
