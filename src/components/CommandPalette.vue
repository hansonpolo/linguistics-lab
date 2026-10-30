<script setup>
import { ref, watch, onMounted, nextTick, computed } from "vue";
import { useRouter } from "vue-router";
import Icon from "./Icon.vue";
import { api } from "../lib/api.js";

const emit = defineEmits(["close"]);
const router = useRouter();
const q = ref("");
const results = ref({ notes: [], concepts: [], cards: [], questions: [] });
const loading = ref(false);
const cursor = ref(0);
const inputEl = ref(null);
const panelEl = ref(null);

const quick = [
  { label: "今日概览", to: "/", icon: "sun", hint: "学习台" },
  { label: "知识库目录", to: "/library", icon: "library", hint: "12 章 · 24 篇" },
  { label: "开始复习", to: "/review", icon: "review", hint: "FSRS 队列" },
  { label: "组一套卷子", to: "/quiz", icon: "quiz", hint: "自测" },
  { label: "问 AI 学伴", to: "/ai", icon: "ai", hint: "教材口径" },
  { label: "IPA 输入面板", to: "/tools", icon: "volume", hint: "工具箱" },
];

const flat = computed(() => {
  const rows = [];
  for (const n of results.value.notes) rows.push({ kind: "笔记", label: n.title, sub: n.summary, to: `/library/${n.id}`, icon: "book" });
  for (const c of results.value.concepts) rows.push({ kind: "概念", label: c.name, sub: c.definition, to: `/graph?focus=${c.id}`, icon: "graph" });
  for (const c of results.value.cards) rows.push({ kind: "卡片", label: c.front, sub: c.back, to: `/cards?q=${encodeURIComponent(c.front)}`, icon: "layers" });
  for (const x of results.value.questions) rows.push({ kind: "题目", label: x.stem, sub: x.type, to: `/quiz?q=${encodeURIComponent(x.stem)}`, icon: "quiz" });
  return rows;
});

let timer = null;
watch(q, (v) => {
  cursor.value = 0;
  clearTimeout(timer);
  if (!v.trim()) {
    results.value = { notes: [], concepts: [], cards: [], questions: [] };
    return;
  }
  loading.value = true;
  timer = setTimeout(async () => {
    try {
      results.value = await api.get(`/search?q=${encodeURIComponent(v.trim())}`);
    } catch {
      results.value = { notes: [], concepts: [], cards: [], questions: [] };
    } finally {
      loading.value = false;
    }
  }, 180);
});

function open(row) {
  if (!row) return;
  emit("close");
  router.push(row.to);
}

function onKeydown(e) {
  const rows = q.value.trim() ? flat.value : quick;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    cursor.value = (cursor.value + 1) % rows.length;
    scrollIntoView();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    cursor.value = (cursor.value - 1 + rows.length) % rows.length;
    scrollIntoView();
  } else if (e.key === "Enter") {
    const row = rows[cursor.value];
    if (row) {
      emit("close");
      router.push(row.to);
    }
  } else if (e.key === "Escape") {
    emit("close");
  }
}

function scrollIntoView() {
  nextTick(() => {
    panelEl.value?.querySelector(".is-cursor")?.scrollIntoView({ block: "nearest" });
  });
}

onMounted(() => {
  inputEl.value?.focus();
});
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-sm" @click.self="emit('close')">
    <div
      ref="panelEl"
      class="w-full max-w-xl overflow-hidden rounded-xl border border-line2 bg-surface shadow-2xl animate-pop"
      @keydown="onKeydown"
    >
      <div class="flex items-center gap-3 border-b border-line px-4">
        <Icon name="search" :size="17" class="text-faint" />
        <input
          ref="inputEl"
          v-model="q"
          class="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-faint"
          placeholder="搜索笔记、概念、卡片、题目…"
        />
        <span v-if="loading" class="text-[11px] text-faint">检索中</span>
        <span class="kbd">esc</span>
      </div>

      <div class="max-h-[58vh] overflow-y-auto p-2">
        <template v-if="!q.trim()">
          <div class="px-3 pb-1 pt-2 text-[10.5px] uppercase tracking-[0.18em] text-faint">快捷跳转</div>
          <button
            v-for="(item, i) in quick"
            :key="item.to"
            class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors"
            :class="i === cursor ? 'bg-surface2 text-fg' : 'text-muted hover:bg-surface2/60'"
            @click="open(item)"
            @mouseenter="cursor = i"
          >
            <Icon :name="item.icon" :size="16" class="text-faint" />
            <span class="flex-1 text-[13.5px]">{{ item.label }}</span>
            <span class="text-[11px] text-faint">{{ item.hint }}</span>
          </button>
        </template>

        <template v-else-if="!flat.length && !loading">
          <div class="px-3 py-10 text-center text-[13px] text-faint">没有找到与「{{ q }}」相关的内容</div>
        </template>

        <template v-else>
          <button
            v-for="(row, i) in flat"
            :key="row.to + i"
            class="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors"
            :class="i === cursor ? 'bg-surface2' : 'hover:bg-surface2/60'"
            @click="open(row)"
            @mouseenter="cursor = i"
          >
            <Icon :name="row.icon" :size="15" class="mt-0.5 shrink-0 text-faint" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] text-fg">{{ row.label }}</span>
              <span class="mt-0.5 block truncate text-[11.5px] text-faint">{{ row.sub }}</span>
            </span>
            <span class="chip mt-0.5 shrink-0 !text-[10px]">{{ row.kind }}</span>
          </button>
        </template>
      </div>

      <div class="flex items-center justify-between border-t border-line px-4 py-2 text-[10.5px] text-faint">
        <span class="inline-flex items-center gap-3">
          <span><span class="kbd">↑</span> <span class="kbd">↓</span> 选择</span>
          <span><span class="kbd">↵</span> 打开</span>
        </span>
        <span>{{ flat.length ? flat.length + " 条结果" : "全库搜索" }}</span>
      </div>
    </div>
  </div>
</template>
