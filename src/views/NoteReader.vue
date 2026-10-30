<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import MarkdownView from "../components/MarkdownView.vue";
import { api, toast, confirmDialog, fmt } from "../lib/api.js";
import { extractHeadings } from "../lib/markdown.js";
import { store, noteTitle, refreshStats } from "../lib/store.js";

const route = useRoute();
const router = useRouter();
const note = ref(null);
const loading = ref(true);
const error = ref("");
const editing = ref(false);
const draft = ref({ title: "", summary: "", content: "", tags: "" });
const saving = ref(false);
const selection = ref("");
const showAnno = ref(false);
const annoText = ref("");
const annoNote = ref("");
const annoTags = ref("");
const concept = ref(null);
const conceptOpen = ref(false);
const tocOpen = ref(false);
const activeHeading = ref("");

const headings = computed(() => (note.value ? extractHeadings(note.value.content) : []));
const wordCount = computed(() => {
  if (!note.value) return 0;
  return (note.value.content || "").replace(/[#>*`\-\[\]()]/g, "").replace(/\s/g, "").length;
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await api.get(`/notes/${route.params.id}`);
    // 接口返回 { note, backlinks, outlinks, concepts, cards, annotations, prev, next }
    note.value = {
      ...(data.note || data),
      backlinks: data.backlinks || [],
      outlinks: data.outlinks || [],
      concepts: data.concepts || [],
      cards: data.cards || [],
      annotations: data.annotations || [],
      prev: data.prev || null,
      next: data.next || null,
    };
    draft.value = {
      title: note.value.title,
      summary: note.value.summary,
      content: note.value.content,
      tags: (note.value.tags || []).join(", "),
    };
    store.noteIndex[note.value.id] = note.value.title;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
  nextTick(() => document.querySelector("main")?.scrollTo({ top: 0 }));
}

async function save() {
  saving.value = true;
  try {
    await api.put(`/notes/${note.value.id}`, {
      ...draft.value,
      tags: draft.value.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    });
    toast("已保存");
    editing.value = false;
    await load();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!(await confirmDialog("确定删除这篇笔记？相关链接与批注也会移除。"))) return;
  try {
    await api.del(`/notes/${note.value.id}`);
    toast("已删除");
    router.replace("/library");
  } catch (e) {
    toast(e.message, "error");
  }
}

function onQuote(text) {
  selection.value = text;
}

function openAnno() {
  annoText.value = selection.value;
  annoNote.value = "";
  annoTags.value = "";
  showAnno.value = true;
}

async function saveAnno() {
  try {
    await api.post(`/notes/${note.value.id}/annotations`, {
      quote: annoText.value,
      note: annoNote.value,
      tags: annoTags.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    });
    toast("摘录已归档");
    showAnno.value = false;
    selection.value = "";
    await load();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function delAnno(id) {
  try {
    await api.del(`/annotations/${id}`);
    await load();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function openConcept(name) {
  try {
    const list = await api.get("/concepts");
    const hit = (list.concepts || []).find((c) => c.name === name);
    if (hit) {
      const data = await api.get(`/concepts/${hit.id}`);
      concept.value = { ...data.concept, relations: data.relations || [], notes: data.notes || [] };
    } else {
      concept.value = null;
    }
    conceptOpen.value = true;
  } catch (e) {
    toast(e.message, "error");
  }
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  tocOpen.value = false;
}

function addCardFromSelection() {
  if (!selection.value) return toast("先在正文中选中一句话", "error");
  router.push({ path: "/cards", query: { new: "1", front: selection.value, note: note.value.id } });
}

watch(() => route.params.id, load);
onMounted(load);
</script>

<template>
  <div v-if="loading" class="py-24 text-center text-sm text-faint">正在展开笔记…</div>
  <div v-else-if="error" class="mx-auto max-w-md py-24 text-center">
    <p class="text-sm text-danger">{{ error }}</p>
    <button class="btn mt-5" @click="router.push('/library')">返回目录</button>
  </div>

  <div v-else class="mx-auto w-full max-w-[1180px] px-5 py-6 md:px-8">
    <!-- 面包屑与操作 -->
    <div class="no-print mb-6 flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
      <router-link to="/library" class="hover:text-accent">知识库</router-link>
      <span>/</span>
      <span>{{ note.chapterTitle }}</span>
      <span class="mx-1">·</span>
      <span class="font-mono">{{ note.id }}</span>
      <div class="ml-auto flex items-center gap-1">
        <button class="btn-ghost btn btn-sm" @click="tocOpen = !tocOpen"><Icon name="list" :size="14" />目录</button>
        <button class="btn-ghost btn btn-sm" @click="addCardFromSelection"><Icon name="plus" :size="14" />做卡</button>
        <button class="btn-ghost btn btn-sm" @click="editing = !editing"><Icon name="edit" :size="14" />{{ editing ? "预览" : "编辑" }}</button>
        <button class="btn-ghost btn btn-sm" @click="remove"><Icon name="trash" :size="14" /></button>
      </div>
    </div>

    <div class="grid gap-10 xl:grid-cols-[minmax(0,1fr)_270px]">
      <article class="min-w-0">
        <!-- 标题区 -->
        <header class="mb-8 border-b border-line pb-6">
          <div class="eyebrow mb-2">{{ note.chapterTitle }} · {{ note.chapter }}</div>
          <h1 class="font-serif text-[27px] font-semibold leading-snug tracking-wide text-fg md:text-[32px]">{{ note.title }}</h1>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">{{ note.summary }}</p>
          <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-faint">
            <span>{{ wordCount }} 字</span>
            <span>更新于 {{ fmt.relative(note.updated_at) }}</span>
            <span v-if="note.cards?.length">{{ note.cards.length }} 张闪卡</span>
            <span class="flex flex-wrap gap-1.5">
              <span v-for="t in note.tags" :key="t" class="chip !py-0.5 !text-[10px]">#{{ t }}</span>
            </span>
          </div>
        </header>

        <!-- 编辑 -->
        <div v-if="editing" class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="label">标题</label><input v-model="draft.title" class="field" /></div>
            <div><label class="label">标签（逗号分隔）</label><input v-model="draft.tags" class="field" /></div>
          </div>
          <div><label class="label">摘要</label><input v-model="draft.summary" class="field" /></div>
          <div>
            <label class="label">正文 · Markdown / KaTeX / 脚注 / [[互链]] / [[概念:X]]</label>
            <textarea v-model="draft.content" rows="26" class="field font-mono text-[12.5px] leading-relaxed" />
          </div>
          <div class="flex gap-2">
            <button class="btn btn-accent" :disabled="saving" @click="save">保存</button>
            <button class="btn" @click="editing = false">取消</button>
          </div>
        </div>

        <!-- 正文 -->
        <MarkdownView v-else :content="note.content" @concept="openConcept" @quote="onQuote" />

        <!-- 文献与来源 -->
        <footer class="mt-12 border-t border-line pt-6">
          <div class="eyebrow mb-3">参考文献 · GB/T 7714-2015</div>
          <ol class="space-y-2">
            <li v-for="(r, i) in note.refs" :key="i" class="flex gap-3 text-[12px] leading-relaxed text-muted">
              <span class="font-mono text-[10px] text-faint">[{{ i + 1 }}]</span>
              <span>{{ r }}</span>
            </li>
          </ol>
          <div class="mt-4 flex flex-wrap gap-1.5">
            <span v-for="b in note.books" :key="b" class="chip">{{ b }}</span>
          </div>
        </footer>

        <!-- 上下篇 -->
        <nav class="mt-10 flex items-stretch gap-3">
          <button
            class="card flex flex-1 items-center gap-3 px-4 py-3 text-left transition hover:border-line2 disabled:opacity-40"
            :disabled="!note.prev"
            @click="note.prev && router.push(`/library/${note.prev.id}`)"
          >
            <Icon name="left" :size="15" class="text-faint" />
            <span class="min-w-0">
              <span class="eyebrow block">上一篇</span>
              <span class="block truncate text-[12.5px] text-fg">{{ note.prev?.title || "已经是第一篇" }}</span>
            </span>
          </button>
          <button
            class="card flex flex-1 items-center justify-end gap-3 px-4 py-3 text-right transition hover:border-line2 disabled:opacity-40"
            :disabled="!note.next"
            @click="note.next && router.push(`/library/${note.next.id}`)"
          >
            <span class="min-w-0">
              <span class="eyebrow block">下一篇</span>
              <span class="block truncate text-[12.5px] text-fg">{{ note.next?.title || "已是最后一篇" }}</span>
            </span>
            <Icon name="right" :size="15" class="text-faint" />
          </button>
        </nav>
      </article>

      <!-- 旁栏 -->
      <aside class="no-print hidden space-y-7 xl:block">
        <div v-if="headings.length" class="border-l border-line pl-4">
          <div class="eyebrow mb-2">本篇目录</div>
          <button
            v-for="h in headings"
            :key="h.id"
            class="block w-full py-1 text-left text-[11.5px] leading-snug transition"
            :class="h.level > 2 ? 'pl-3 text-faint' : 'text-muted'"
            @click="scrollTo(h.id)"
          >
            {{ h.text }}
          </button>
        </div>

        <div v-if="note.concepts?.length">
          <div class="eyebrow mb-2">牵涉概念</div>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="c in note.concepts" :key="c.id" class="chip hover:border-accent/40 hover:text-accent" @click="openConcept(c.name)">
              {{ c.name }}
            </button>
          </div>
        </div>

        <div v-if="note.backlinks?.length">
          <div class="eyebrow mb-2">反向链接 · {{ note.backlinks.length }}</div>
          <button
            v-for="b in note.backlinks"
            :key="b.id"
            class="mb-1.5 flex w-full items-baseline gap-2 text-left text-[11.5px] text-muted hover:text-accent"
            @click="router.push(`/library/${b.id}`)"
          >
            <Icon name="link" :size="12" class="shrink-0" />
            <span class="leading-snug">{{ b.title }}</span>
          </button>
        </div>

        <div v-if="note.cards?.length">
          <div class="eyebrow mb-2">关联闪卡 · {{ note.cards.length }}</div>
          <div class="space-y-1.5">
            <div v-for="c in note.cards.slice(0, 5)" :key="c.id" class="rounded-md border border-line bg-surface px-2.5 py-2">
              <div class="line-clamp-2 text-[11px] leading-snug text-muted">{{ c.front }}</div>
            </div>
          </div>
          <button class="btn btn-sm mt-2 w-full" @click="router.push('/review')">去复习</button>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <div class="eyebrow">摘录批注 · {{ note.annotations?.length || 0 }}</div>
            <button class="text-[10.5px] text-faint hover:text-accent" @click="showAnno = true">+ 添加</button>
          </div>
          <div class="mt-2 space-y-2">
            <div v-for="a in note.annotations" :key="a.id" class="group rounded-md border border-line bg-surface p-2.5">
              <p class="border-l-2 border-accent/60 pl-2 font-serif text-[11.5px] leading-relaxed text-muted">{{ a.quote }}</p>
              <p v-if="a.note" class="mt-1.5 text-[11px] text-fg">{{ a.note }}</p>
              <div class="mt-1.5 flex items-center gap-1">
                <span v-for="t in (a.tags || [])" :key="t" class="text-[9.5px] text-faint">#{{ t }}</span>
                <button class="ml-auto text-faint opacity-0 transition group-hover:opacity-100" @click="delAnno(a.id)">
                  <Icon name="x" :size="11" />
                </button>
              </div>
            </div>
            <p v-if="!note.annotations?.length" class="text-[11px] leading-relaxed text-faint">
              选中正文任意句子，即可归档为摘录。
            </p>
          </div>
        </div>
      </aside>
    </div>

    <!-- 选中浮动条 -->
    <div
      v-if="selection && !editing"
      class="no-print fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line2 bg-surface px-4 py-2 shadow-lift animate-rise"
    >
      <span class="max-w-[260px] truncate text-[11.5px] text-muted">「{{ selection }}」</span>
      <button class="btn btn-sm btn-accent !rounded-full" @click="openAnno"><Icon name="quote" :size="13" />摘录</button>
      <button class="btn btn-sm !rounded-full" @click="addCardFromSelection"><Icon name="plus" :size="13" />制卡</button>
      <button class="text-faint hover:text-fg" @click="selection = ''"><Icon name="x" :size="14" /></button>
    </div>

    <!-- 摘录弹窗 -->
    <div v-if="showAnno" class="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" @click.self="showAnno = false">
      <div class="w-full max-w-lg rounded-xl border border-line2 bg-surface p-6 shadow-2xl animate-pop">
        <h3 class="mb-4 font-serif text-lg text-fg">归档摘录</h3>
        <label class="label">原文</label>
        <textarea v-model="annoText" rows="3" class="field font-serif" />
        <div class="mt-4">
          <label class="label">批注</label>
          <textarea v-model="annoNote" rows="3" class="field" placeholder="你的理解、疑问，或与另一本书的对照" />
        </div>
        <div class="mt-4">
          <label class="label">标签</label>
          <input v-model="annoTags" class="field" placeholder="音位学, 争议点" />
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn" @click="showAnno = false">取消</button>
          <button class="btn btn-accent" @click="saveAnno">保存</button>
        </div>
      </div>
    </div>

    <!-- 目录抽屉（窄屏） -->
    <div v-if="tocOpen" class="fixed inset-0 z-40 flex justify-end bg-black/40 xl:hidden" @click.self="tocOpen = false">
      <div class="h-full w-[280px] overflow-y-auto border-l border-line bg-surface p-5">
        <div class="mb-3 flex items-center justify-between">
          <span class="eyebrow">本篇目录</span>
          <button @click="tocOpen = false"><Icon name="x" :size="16" /></button>
        </div>
        <button
          v-for="h in headings"
          :key="h.id"
          class="block w-full py-1.5 text-left text-[12.5px] text-muted"
          :class="h.level > 2 ? 'pl-3' : ''"
          @click="scrollTo(h.id)"
        >{{ h.text }}</button>
      </div>
    </div>

    <!-- 概念抽屉 -->
    <div v-if="conceptOpen" class="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm" @click.self="conceptOpen = false">
      <div class="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-6 animate-rise">
        <div class="mb-4 flex items-start justify-between">
          <div>
            <div class="eyebrow mb-1">概念</div>
            <h3 class="font-serif text-[22px] text-fg">{{ concept?.name || "未收录" }}</h3>
          </div>
          <button class="btn-ghost btn btn-sm" @click="conceptOpen = false"><Icon name="x" :size="16" /></button>
        </div>
        <template v-if="concept">
          <p class="text-[13.5px] leading-relaxed text-muted">{{ concept.definition }}</p>
          <div class="mt-4 flex flex-wrap gap-1.5">
            <span v-if="concept.school" class="chip">{{ concept.school }}</span>
            <span v-if="concept.era" class="chip">{{ concept.era }}</span>
            <span class="chip">第 {{ concept.chapter }} 章</span>
          </div>
          <div v-if="concept.aliases?.length" class="mt-4">
            <div class="eyebrow mb-1.5">别名</div>
            <div class="text-[12.5px] text-muted">{{ concept.aliases.join("、") }}</div>
          </div>
          <div v-if="concept.relations?.length" class="mt-6">
            <div class="eyebrow mb-2">概念关系</div>
            <div class="space-y-1.5">
              <div v-for="(r, i) in concept.relations" :key="i" class="flex items-center gap-2 text-[12px]">
                <span class="chip !py-0.5 !text-[9.5px]">{{ { contains: "包含", opposes: "对立", influences: "影响", related: "相关" }[r.type] || r.type }}</span>
                <button class="text-accent hover:underline" @click="openConcept(r.name)">{{ r.name }}</button>
              </div>
            </div>
          </div>
        </template>
        <p v-else class="text-[13px] text-muted">概念库尚未收录此条目，关联笔记如下。</p>
        <div v-if="note?.concepts?.length" class="mt-6">
          <div class="eyebrow mb-2">本篇相关</div>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="c in note.concepts" :key="c.id" class="chip hover:text-accent" @click="openConcept(c.name)">{{ c.name }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
