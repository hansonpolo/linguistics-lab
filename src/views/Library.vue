<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import { api, toast } from "../lib/api.js";
import { store } from "../lib/store.js";

const router = useRouter();
const q = ref("");
const activeChapter = ref("");
const activeTag = ref("");
const view = ref("chapter"); // chapter | flat
const notes = ref([]);
const loading = ref(false);
const showNew = ref(false);
const draft = ref({ title: "", chapter: "c01", summary: "", content: "" });
const saving = ref(false);

const chapters = computed(() => store.chapters || []);
const noteList = computed(() => notes.value.length ? notes.value : store.notes);

const filtered = computed(() => {
  let list = noteList.value || [];
  if (activeChapter.value) list = list.filter((n) => n.chapter === activeChapter.value);
  if (activeTag.value) list = list.filter((n) => (n.tags || []).includes(activeTag.value));
  if (q.value.trim()) {
    const k = q.value.trim().toLowerCase();
    list = list.filter(
      (n) => n.title.toLowerCase().includes(k) || (n.summary || "").toLowerCase().includes(k)
    );
  }
  return list;
});

const groups = computed(() => {
  const map = new Map();
  for (const c of chapters.value) map.set(c.id, { chapter: c, notes: [] });
  for (const n of filtered.value) {
    if (!map.has(n.chapter)) map.set(n.chapter, { chapter: { id: n.chapter, title: n.chapter, ord: 99 }, notes: [] });
    map.get(n.chapter).notes.push(n);
  }
  return [...map.values()].filter((g) => g.notes.length || (!q.value && !activeTag.value));
});

const topTags = computed(() => (store.tags || []).slice(0, 12));

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (activeChapter.value) params.set("chapter", activeChapter.value);
    if (activeTag.value) params.set("tag", activeTag.value);
    if (q.value.trim()) params.set("q", q.value.trim());
    const res = await api.get(`/notes?${params}`);
    notes.value = res.notes;
  } catch (e) {
    toast(e.message, "error");
  } finally {
    loading.value = false;
  }
}

function pickChapter(id) {
  activeChapter.value = activeChapter.value === id ? "" : id;
  notes.value = [];
  load();
}

function pickTag(t) {
  activeTag.value = activeTag.value === t ? "" : t;
  notes.value = [];
  load();
}

async function createNote() {
  if (!draft.value.title.trim()) return toast("先写一个标题", "error");
  saving.value = true;
  try {
    const res = await api.post("/notes", draft.value);
    const created = res.note || res;
    toast("笔记已创建");
    showNew.value = false;
    router.push(`/library/${created.id}`);
  } catch (e) {
    toast(e.message, "error");
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto w-full max-w-[1180px] px-5 py-7 md:px-8">
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <div class="relative">
        <Icon name="search" :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input v-model="q" class="field w-[230px] pl-8" placeholder="在目录中查找…" @input="load" />
      </div>
      <div class="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
        <button
          class="rounded px-2.5 py-1 text-[11.5px]"
          :class="view === 'chapter' ? 'bg-accsoft text-accent' : 'text-muted'"
          @click="view = 'chapter'"
        >按章</button>
        <button
          class="rounded px-2.5 py-1 text-[11.5px]"
          :class="view === 'flat' ? 'bg-accsoft text-accent' : 'text-muted'"
          @click="view = 'flat'"
        >平铺</button>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <span class="text-[11.5px] text-faint">{{ filtered.length }} 篇 · {{ chapters.reduce((a, c) => a + (c.noteCount || 0), 0) }} 篇总计</span>
        <button class="btn btn-sm" @click="showNew = true"><Icon name="plus" :size="14" />新建</button>
      </div>
    </div>

    <div class="mb-6 flex flex-wrap gap-1.5">
      <button class="chip" :class="!activeTag ? 'chip-accent' : ''" @click="pickTag('')">全部标签</button>
      <button
        v-for="t in topTags"
        :key="t.name"
        class="chip"
        :class="activeTag === t.name ? 'chip-accent' : ''"
        @click="pickTag(t.name)"
      >
        {{ t.name }}<span class="opacity-50">{{ t.count }}</span>
      </button>
    </div>

    <div class="grid gap-7 lg:grid-cols-[196px_1fr]">
      <!-- 章节索引 -->
      <aside class="hidden lg:block">
        <div class="eyebrow mb-3">卷一 · 十二</div>
        <div class="space-y-0.5">
          <button
            class="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-[12.5px] transition"
            :class="!activeChapter ? 'bg-accsoft text-accent' : 'text-muted hover:bg-surface2 hover:text-fg'"
            @click="pickChapter('')"
          >
            <span class="font-mono text-[10px] opacity-50">00</span>全部章节
          </button>
          <button
            v-for="c in chapters"
            :key="c.id"
            class="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-[12.5px] transition"
            :class="activeChapter === c.id ? 'bg-accsoft text-accent' : 'text-muted hover:bg-surface2 hover:text-fg'"
            @click="pickChapter(c.id)"
          >
            <span class="font-mono text-[10px] opacity-50">{{ String(c.ord).padStart(2, "0") }}</span>
            <span class="flex-1 leading-snug">{{ c.title }}</span>
            <span class="font-mono text-[10px] opacity-40">{{ c.noteCount }}</span>
          </button>
        </div>
      </aside>

      <div class="min-w-0">
        <div v-if="loading" class="py-20 text-center text-sm text-faint">正在检索…</div>
        <template v-else-if="view === 'chapter'">
          <section v-for="g in groups" :key="g.chapter.id" class="mb-9">
            <div class="mb-3 flex items-baseline gap-3 border-b border-line pb-2">
              <span class="font-mono text-[10px] uppercase tracking-widest text-faint">{{ g.chapter.id }}</span>
              <h3 class="font-serif text-[16px] font-semibold text-fg">{{ g.chapter.title }}</h3>
              <span class="ml-auto text-[10.5px] text-faint">{{ g.notes.length }} 篇</span>
            </div>
            <div class="grid gap-2.5">
              <button
                v-for="n in g.notes"
                :key="n.id"
                class="group flex items-start gap-4 rounded-lg border border-transparent px-3 py-3 text-left transition hover:border-line hover:bg-surface"
                @click="router.push(`/library/${n.id}`)"
              >
                <span class="mt-0.5 w-7 shrink-0 font-mono text-[10.5px] text-faint">{{ n.id }}</span>
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-baseline gap-2">
                    <span class="font-serif text-[15px] text-fg group-hover:text-accent">{{ n.title }}</span>
                    <span v-if="n.pinned" class="chip chip-accent !py-0.5 !text-[9.5px]">置顶</span>
                  </span>
                  <span class="mt-1 block line-clamp-2 text-[12px] leading-relaxed text-muted">{{ n.summary }}</span>
                  <span class="mt-2 flex flex-wrap items-center gap-1.5">
                    <span v-for="t in (n.tags || []).slice(0, 4)" :key="t" class="chip !py-0.5 !text-[10px]">{{ t }}</span>
                    <span class="ml-1 text-[10.5px] text-faint">· {{ n.cardCount }} 张卡片</span>
                  </span>
                </span>
                <Icon name="chevron" :size="15" class="mt-1 shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
              </button>
            </div>
          </section>
        </template>
        <div v-else class="grid gap-2.5 sm:grid-cols-2">
          <button
            v-for="n in filtered"
            :key="n.id"
            class="card p-4 text-left transition hover:border-line2"
            @click="router.push(`/library/${n.id}`)"
          >
            <div class="mb-1.5 flex items-center gap-2">
              <span class="font-mono text-[10px] uppercase text-faint">{{ n.chapter }}</span>
              <span class="ml-auto text-[10.5px] text-faint">{{ n.cardCount }} 卡</span>
            </div>
            <div class="font-serif text-[14.5px] text-fg">{{ n.title }}</div>
            <div class="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">{{ n.summary }}</div>
          </button>
        </div>
      </div>
    </div>

    <!-- 新建笔记 -->
    <div v-if="showNew" class="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" @click.self="showNew = false">
      <div class="w-full max-w-2xl rounded-xl border border-line2 bg-surface p-6 shadow-2xl animate-pop">
        <div class="mb-5 flex items-center justify-between">
          <h3 class="font-serif text-lg text-fg">新建笔记</h3>
          <button class="btn-ghost btn btn-sm" @click="showNew = false"><Icon name="x" :size="16" /></button>
        </div>
        <div class="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div>
            <label class="label">标题</label>
            <input v-model="draft.title" class="field" placeholder="例如：音位的对立与互补" />
          </div>
          <div>
            <label class="label">所属章节</label>
            <select v-model="draft.chapter" class="field">
              <option v-for="c in chapters" :key="c.id" :value="c.id">{{ c.ord }} · {{ c.title }}</option>
            </select>
          </div>
        </div>
        <div class="mt-4">
          <label class="label">摘要（一句话）</label>
          <input v-model="draft.summary" class="field" placeholder="用一句话说明这篇笔记解决什么问题" />
        </div>
        <div class="mt-4">
          <label class="label">正文 · 支持 Markdown、$公式$、[^1] 脚注、[[n05]] 互链、[[概念:音位]]</label>
          <textarea v-model="draft.content" rows="10" class="field font-mono text-[12.5px] leading-relaxed" placeholder="## 一、定义&#10;…" />
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn" @click="showNew = false">取消</button>
          <button class="btn btn-accent" :disabled="saving" @click="createNote">创建并打开</button>
        </div>
      </div>
    </div>
  </div>
</template>
