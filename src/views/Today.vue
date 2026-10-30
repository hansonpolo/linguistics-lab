<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import Heatmap from "../components/Heatmap.vue";
import StatRing from "../components/StatRing.vue";
import { store, noteTitle } from "../lib/store.js";

const router = useRouter();
const stats = computed(() => store.stats || {});
const today = computed(() => stats.value.today || store.today || {});
const counts = computed(() => stats.value.counts || {});

const now = new Date();
const dateLine = computed(() => {
  const w = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${w}`;
});
const greet = computed(() => {
  const h = now.getHours();
  if (h < 6) return "夜深了，读到哪一页？";
  if (h < 11) return "早安，从一段语音开始。";
  if (h < 14) return "午间小读，看看今天的队列。";
  if (h < 18) return "下午好，继续昨天的符号。";
  if (h < 22) return "晚上好，把今天的账还清。";
  return "夜里安静，适合辨析概念。";
});

const due = computed(() => stats.value.dueNow ?? store.counts?.due ?? 0);
const weekReviews = computed(() => {
  const h = stats.value.heatmap || [];
  return h.slice(-7).reduce((a, b) => a + b.count, 0);
});
const mastered = computed(() => counts.value.mastery || 0);
const retention = computed(() => stats.value.retention30 ?? 0);
const minutes = computed(() => stats.value.totalMinutes || 0);

const recentNotes = computed(() => {
  const list = [...(store.notes || [])];
  return list.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 4);
});

const forecast = computed(() => (stats.value.forecast || []).slice(0, 14));
const maxForecast = computed(() => Math.max(1, ...forecast.value.map((f) => f.count)));
const weakest = computed(() => stats.value.weakest || []);
const chapterMastery = computed(() => (stats.value.chapterMastery || []).slice(0, 6));

const dayLabel = (d) => {
  const dt = new Date(`${d}T12:00:00+08:00`);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
};
</script>

<template>
  <div class="mx-auto w-full max-w-[1180px] px-5 py-8 md:px-8 md:py-10">
    <!-- 日期与问候 -->
    <div class="mb-8">
      <div class="mb-3 flex items-center gap-3">
        <span class="eyebrow">{{ dateLine }}</span>
        <span class="h-px flex-1 bg-line" />
        <span class="text-[11px] text-faint">本地 · 单用户</span>
      </div>
      <h2 class="font-serif text-[26px] font-medium leading-snug tracking-wide text-fg md:text-[31px]">
        {{ greet }}
      </h2>
      <p class="mt-2 text-[13px] text-muted">
        今天队列里
        <span class="font-mono text-accent">{{ due }}</span>
        张卡片待处理，已复习
        <span class="font-mono">{{ today.reviews || 0 }}</span>
        次。最近七天共
        <span class="font-mono">{{ weekReviews }}</span>
        次。
      </p>
    </div>

    <!-- 主行动卡 -->
    <div class="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div
        class="relative overflow-hidden rounded-xl border border-line bg-surface p-6 md:p-7"
      >
        <div class="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/[0.07] blur-2xl" />
        <div class="relative">
          <div class="eyebrow mb-3">今日专注</div>
          <div class="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <div class="font-serif text-[56px] leading-none text-accent">{{ due }}</div>
              <div class="mt-1 text-[12px] text-muted">张卡片到期</div>
            </div>
            <div class="mb-1 space-y-1.5 text-[12.5px] text-muted">
              <div class="flex items-center gap-2">
                <span class="h-1.5 w-1.5 rounded-full bg-bamboo" />新卡 {{ counts.new ?? 0 }} 张
              </div>
              <div class="flex items-center gap-2">
                <span class="h-1.5 w-1.5 rounded-full bg-indigo" />复习中 {{ (counts.review ?? 0) + (counts.learning ?? 0) }} 张
              </div>
              <div class="flex items-center gap-2">
                <span class="h-1.5 w-1.5 rounded-full bg-accent/60" />待重学 {{ counts.relearning ?? 0 }} 张
              </div>
            </div>
          </div>
          <div class="mt-7 flex flex-wrap items-center gap-3">
            <button class="btn btn-accent px-5 py-2.5" @click="router.push('/review')">
              <Icon name="play" :size="15" />开始今日复习
            </button>
            <button class="btn" @click="router.push('/quiz')">
              <Icon name="quiz" :size="15" />组一套小测
            </button>
            <span class="ml-auto hidden text-[11px] text-faint sm:block">
              每天 {{ store.settings?.new_per_day || 20 }} 张新卡 · 保留率 {{ Math.round((store.settings?.retention || 0.9) * 100) }}%
            </span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="card flex flex-col items-center justify-center p-3">
          <StatRing :value="mastered / 100" :size="96" :stroke="6" label="掌握率" />
        </div>
        <div class="card flex flex-col items-center justify-center p-3">
          <StatRing :value="(retention || 0) / 100" :size="96" :stroke="6" label="30 日保持" color="var(--bamboo)" />
        </div>
        <div class="card px-4 py-3">
          <div class="eyebrow">连续打卡</div>
          <div class="mt-1 flex items-baseline gap-1">
            <span class="font-serif text-[26px] text-fg">{{ stats.streak || 0 }}</span>
            <span class="text-[11px] text-faint">天</span>
            <Icon name="flame" :size="15" class="ml-auto text-accent" :class="(stats.streak || 0) ? '' : 'opacity-30'" />
          </div>
        </div>
        <div class="card px-4 py-3">
          <div class="eyebrow">累计时长</div>
          <div class="mt-1 flex items-baseline gap-1">
            <span class="font-serif text-[26px] text-fg">{{ Math.round(minutes / 60) }}</span>
            <span class="text-[11px] text-faint">小时</span>
            <Icon name="clock" :size="14" class="ml-auto text-faint" />
          </div>
        </div>
      </div>
    </div>

    <!-- 主体两栏 -->
    <div class="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
      <div class="min-w-0 space-y-8">
        <!-- 继续阅读 -->
        <section>
          <div class="mb-3 flex items-baseline justify-between">
            <h3 class="font-serif text-[17px] font-semibold text-fg">继续阅读</h3>
            <router-link to="/library" class="text-[11.5px] text-muted hover:text-accent">全部目录 →</router-link>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <button
              v-for="n in recentNotes"
              :key="n.id"
              class="group card p-4 text-left transition hover:border-line2 hover:bg-surface2/50"
              @click="router.push(`/library/${n.id}`)"
            >
              <div class="mb-2 flex items-center gap-2">
                <span class="eyebrow">{{ n.chapterTitle }}</span>
                <span class="ml-auto text-[10.5px] text-faint">{{ n.cardCount }} 卡</span>
              </div>
              <div class="font-serif text-[15px] leading-snug text-fg group-hover:text-accent">{{ n.title }}</div>
              <div class="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted">{{ n.summary }}</div>
            </button>
          </div>
        </section>

        <!-- 章节掌握 -->
        <section>
          <div class="mb-3 flex items-baseline justify-between">
            <h3 class="font-serif text-[17px] font-semibold text-fg">章节推进</h3>
            <router-link to="/review" class="text-[11.5px] text-muted hover:text-accent">复习队列 →</router-link>
          </div>
          <div class="card divide-y divide-line">
            <div v-for="c in chapterMastery" :key="c.id" class="flex items-center gap-4 px-4 py-2.5">
              <span class="w-8 shrink-0 font-mono text-[10.5px] uppercase text-faint">{{ c.id }}</span>
              <span class="w-40 shrink-0 truncate text-[12.5px] text-fg">{{ c.title }}</span>
              <div class="h-[3px] flex-1 overflow-hidden rounded-full bg-surface2">
                <div class="h-full rounded-full bg-accent/60" :style="{ width: c.mastery + '%' }" />
              </div>
              <span class="w-10 shrink-0 text-right font-mono text-[11px] text-muted">{{ c.mastery }}%</span>
            </div>
          </div>
        </section>
      </div>

      <div class="min-w-0 space-y-8">
        <!-- 热力图 -->
        <section>
          <div class="mb-3 flex items-baseline justify-between">
            <h3 class="font-serif text-[17px] font-semibold text-fg">复习节律</h3>
            <span class="text-[10.5px] text-faint">近半年</span>
          </div>
          <div class="card p-4">
            <Heatmap :days="stats.heatmap || []" :weeks="18" />
            <div class="mt-3 flex items-center justify-between text-[10.5px] text-faint">
              <span>少</span>
              <div class="flex gap-1">
                <span class="h-[9px] w-[9px] rounded-[2px] bg-surface2" />
                <span class="h-[9px] w-[9px] rounded-[2px] bg-accent/25" />
                <span class="h-[9px] w-[9px] rounded-[2px] bg-accent/45" />
                <span class="h-[9px] w-[9px] rounded-[2px] bg-accent/70" />
                <span class="h-[9px] w-[9px] rounded-[2px] bg-accent" />
              </div>
              <span>多</span>
            </div>
          </div>
        </section>

        <!-- 未来负载 -->
        <section>
          <div class="mb-3 flex items-baseline justify-between">
            <h3 class="font-serif text-[17px] font-semibold text-fg">未来两周</h3>
            <span class="text-[10.5px] text-faint">预计到期</span>
          </div>
          <div class="card flex h-[92px] items-end gap-[5px] px-4 pb-3 pt-4">
            <div v-for="f in forecast" :key="f.date" class="group flex flex-1 flex-col items-center gap-1">
              <span class="text-[9px] text-faint opacity-0 transition group-hover:opacity-100">{{ f.count }}</span>
              <div class="w-full rounded-sm bg-indigo/40 transition group-hover:bg-indigo/70" :style="{ height: Math.max(2, (f.count / maxForecast) * 44) + 'px' }" />
              <span class="text-[8.5px] text-faint">{{ dayLabel(f.date).split('/')[1] }}</span>
            </div>
          </div>
        </section>

        <!-- 薄弱卡片 -->
        <section>
          <div class="mb-3 flex items-baseline justify-between">
            <h3 class="font-serif text-[17px] font-semibold text-fg">易忘卡片</h3>
            <span class="text-[10.5px] text-faint">遗忘次数最多</span>
          </div>
          <div v-if="weakest.length" class="space-y-2">
            <div v-for="c in weakest" :key="c.id" class="card px-3.5 py-2.5">
              <div class="line-clamp-1 text-[12px] text-fg">{{ c.front }}</div>
              <div class="mt-1 flex items-center gap-2 text-[10.5px] text-faint">
                <span>遗忘 {{ c.lapses }} 次</span>
                <span class="h-2.5 w-px bg-line" />
                <span class="truncate">{{ noteTitle(c.note_id) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="card px-4 py-6 text-center text-[12px] text-faint">还没有遗忘记录，保持下去。</div>
        </section>
      </div>
    </div>
  </div>
</template>
