<script setup>
import { onMounted, computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "./components/Icon.vue";
import CommandPalette from "./components/CommandPalette.vue";
import { store, bootstrap, toggleTheme, refreshStats } from "./lib/store.js";

const route = useRoute();
const router = useRouter();
const palette = ref(false);
const drawer = ref(false);
const toasts = ref([]);
const booting = ref(true);
const bootError = ref("");

const nav = [
  { group: "学习", items: [{ to: "/", icon: "sun", label: "今日", exact: true }] },
  {
    group: "知识",
    items: [
      { to: "/library", icon: "library", label: "知识库" },
      { to: "/graph", icon: "graph", label: "知识图谱" },
    ],
  },
  {
    group: "记忆",
    items: [
      { to: "/cards", icon: "layers", label: "闪卡" },
      { to: "/review", icon: "review", label: "复习队列" },
      { to: "/quiz", icon: "quiz", label: "自测" },
      { to: "/wrongbook", icon: "wrong", label: "错题本" },
    ],
  },
  {
    group: "助手",
    items: [
      { to: "/ai", icon: "ai", label: "AI 学伴" },
      { to: "/tools", icon: "tools", label: "工具箱" },
    ],
  },
];

const isActive = (item) =>
  item.exact ? route.path === item.to : route.path === item.to || route.path.startsWith(item.to + "/");

const streak = computed(() => store.stats?.streak || 0);
const goal = computed(() => {
  const done = (store.stats?.today?.reviews || 0) + (store.stats?.today?.questions || 0);
  const target = Number(store.settings?.daily_goal || 30);
  return { done, target, pct: Math.min(100, Math.round((done / target) * 100)) };
});
const due = computed(() => store.stats?.dueNow ?? store.counts?.due ?? 0);

function go(to) {
  drawer.value = false;
  router.push(to);
}

function onKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    palette.value = !palette.value;
  }
  if (e.key === "Escape") palette.value = false;
}

onMounted(async () => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("lingua-toast", (e) => {
    const id = Math.random().toString(36).slice(2);
    toasts.value.push({ id, ...e.detail });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 3200);
  });
  try {
    await bootstrap();
    await refreshStats();
  } catch (e) {
    bootError.value = e.message || "无法连接本地服务";
  } finally {
    booting.value = false;
  }
});
</script>

<template>
  <div class="grain flex h-screen overflow-hidden">
    <!-- 侧栏 -->
    <aside
      class="no-print fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-line bg-surface/95 backdrop-blur transition-transform md:static md:z-auto md:translate-x-0 md:bg-surface/60"
      :class="drawer ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex items-center gap-3 px-5 pb-6 pt-6">
        <div class="flex h-10 w-10 items-center justify-center rounded-md bg-accent/12 ring-1 ring-accent/30">
          <span class="font-serif text-[19px] font-semibold text-accent">言</span>
        </div>
        <div class="leading-tight">
          <div class="font-serif text-[19px] tracking-wide text-fg">语<span class="px-[3px] text-accent">·</span>言</div>
          <div class="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-faint">语言学学习台</div>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 pb-4">
        <div v-for="g in nav" :key="g.group" class="mb-5">
          <div class="mb-1.5 px-3 text-[10.5px] uppercase tracking-[0.2em] text-faint">{{ g.group }}</div>
          <button
            v-for="item in g.items"
            :key="item.to"
            class="group relative mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px] transition-colors"
            :class="isActive(item) ? 'bg-accsoft text-accent' : 'text-muted hover:bg-surface2 hover:text-fg'"
            @click="go(item.to)"
          >
            <span
              v-if="isActive(item)"
              class="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent"
            />
            <Icon :name="item.icon" :size="16.5" />
            <span class="flex-1">{{ item.label }}</span>
            <span v-if="item.to === '/review' && due > 0" class="font-mono text-[11px] text-accent">{{ due }}</span>
          </button>
        </div>
      </nav>

      <div class="border-t border-line px-4 py-4">
        <div class="mb-2 flex items-center justify-between text-[11.5px] text-muted">
          <span class="inline-flex items-center gap-1.5">
            <Icon name="flame" :size="14" :class="streak > 0 ? 'text-accent' : 'text-faint'" />
            连续 {{ streak }} 天
          </span>
          <span class="font-mono text-faint">{{ goal.done }}/{{ goal.target }}</span>
        </div>
        <div class="h-1 overflow-hidden rounded-full bg-surface2">
          <div class="h-full rounded-full bg-accent/70 transition-all" :style="{ width: goal.pct + '%' }" />
        </div>
        <div class="mt-4 flex items-center justify-between">
          <button class="btn-ghost btn btn-sm" @click="toggleTheme">
            <Icon :name="store.theme === 'dark' ? 'sun' : 'moon'" :size="15" />
            {{ store.theme === "dark" ? "纸本" : "夜读" }}
          </button>
          <button class="btn-ghost btn btn-sm" title="设置" @click="go('/tools')">
            <Icon name="settings" :size="15" />
          </button>
        </div>
      </div>
    </aside>

    <div v-if="drawer" class="fixed inset-0 z-30 bg-black/50 md:hidden" @click="drawer = false" />

    <!-- 主区 -->
    <div class="relative z-10 flex min-w-0 flex-1 flex-col">
      <header
        class="no-print sticky top-0 z-20 flex h-[58px] shrink-0 items-center gap-3 border-b border-line bg-app/85 px-4 backdrop-blur-md md:px-7"
      >
        <button class="btn-ghost btn btn-sm md:hidden" @click="drawer = true">
          <Icon name="menu" :size="18" />
        </button>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2.5">
            <h1 class="truncate font-serif text-[16.5px] font-semibold tracking-wide text-fg">
              {{ route.meta.title || "学习台" }}
            </h1>
            <span class="hidden truncate text-[11.5px] text-faint sm:inline">{{ route.meta.sub }}</span>
          </div>
        </div>

        <button
          class="hidden items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] text-faint transition hover:border-line2 hover:text-muted sm:flex"
          @click="palette = true"
        >
          <Icon name="search" :size="14" />
          <span>搜索笔记、概念、卡片…</span>
          <span class="kbd ml-6">⌘K</span>
        </button>
        <button class="btn btn-sm" @click="palette = true" aria-label="搜索"><Icon name="search" :size="16" /></button>
      </header>

      <main class="flex-1 overflow-y-auto">
        <div v-if="booting" class="flex h-full items-center justify-center">
          <div class="flex items-center gap-3 text-muted">
            <Icon name="loader" :size="18" class="animate-spin" />
            <span class="text-sm">正在装载本地语料…</span>
          </div>
        </div>
        <div v-else-if="bootError" class="mx-auto max-w-md px-6 py-24 text-center">
          <div class="mb-3 font-serif text-lg text-fg">无法连接本地服务</div>
          <p class="mb-4 text-sm text-muted">{{ bootError }}</p>
          <p class="text-xs text-faint">请确认后端已在 127.0.0.1:8787 运行：<code class="font-mono">npm run dev</code></p>
          <button class="btn btn-accent mt-6" @click="location.reload()">重试</button>
        </div>
        <router-view v-else v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>

    <CommandPalette v-if="palette" @close="palette = false" />

    <div class="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="animate-rise rounded-md border px-3.5 py-2.5 text-[12.5px] shadow-lift"
        :class="
          t.type === 'error'
            ? 'border-danger/40 bg-danger/10 text-danger'
            : 'border-line bg-surface text-fg'
        "
      >
        {{ t.message }}
      </div>
    </div>
  </div>
</template>
