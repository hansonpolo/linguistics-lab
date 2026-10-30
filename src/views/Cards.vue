<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import { api, toast, confirmDialog, download } from "../lib/api.js";
import { store } from "../lib/store.js";

const route = useRoute();
const router = useRouter();
const cards = ref([]);
const loading = ref(true);
const q = ref(String(route.query.q || ""));
const typeFilter = ref("");
const chapterFilter = ref("");
const statusFilter = ref("all");
const editing = ref(null);
const showEditor = ref(false);
const showImport = ref(false);
const importText = ref("");
const importNote = ref("");
const importing = ref(false);

const TYPES = {
  basic: { label: "问答", hint: "名词解释/简答" },
  cloze: { label: "填空", hint: "用 {{c1::…}} 标记" },
  contrast: { label: "辨析", hint: "成对概念比较" },
  image: { label: "图片", hint: "图像记忆" },
};

const noteOptions = computed(() => store.notes || []);

const stats = computed(() => {
  const s = { total: cards.value.length, due: 0, fresh: 0, learning: 0, mature: 0, lapsed: 0 };
  for (const c of cards.value) {
    if (c.state === 0) s.fresh++;
    if (new Date(c.due).getTime() <= Date.now()) s.due++;
    if (c.state === 1 || c.state === 3) s.learning++;
    if (c.stability >= 21) s.mature++;
    if (c.lapses > 0) s.lapsed++;
  }
  return s;
});

const filtered = computed(() => {
  let list = cards.value;
  if (typeFilter.value) list = list.filter((c) => c.type === typeFilter.value);
  if (chapterFilter.value) {
    const ids = new Set((store.notes || []).filter((n) => n.chapter === chapterFilter.value).map((n) => n.id));
    list = list.filter((c) => ids.has(c.note_id));
  }
  if (statusFilter.value === "due") list = list.filter((c) => new Date(c.due).getTime() <= Date.now());
  if (statusFilter.value === "new") list = list.filter((c) => c.state === 0);
  if (statusFilter.value === "lapsed") list = list.filter((c) => c.lapses > 0);
  if (statusFilter.value === "suspended") list = list.filter((c) => c.suspended);
  if (q.value.trim()) {
    const k = q.value.toLowerCase();
    list = list.filter((c) => (c.front + c.back).toLowerCase().includes(k));
  }
  return list;
});

function emptyDraft() {
  return {
    id: null,
    type: "basic",
    front: "",
    back: "",
    tags: [],
    note_id: route.query.note || "",
    image: "",
  };
}

function openNew() {
  editing.value = emptyDraft();
  if (route.query.front) {
    editing.value.front = String(route.query.front);
    editing.value.type = "basic";
  }
  showEditor.value = true;
}

function openEdit(card) {
  editing.value = { ...card, tags: card.tags || [] };
  showEditor.value = true;
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get("/cards");
    cards.value = res.cards || res;
  } catch (e) {
    toast(e.message, "error");
  } finally {
    loading.value = false;
  }
}

async function saveCard() {
  if (!editing.value.front.trim()) return toast("正面不能为空", "error");
  try {
    if (editing.value.id) {
      await api.put(`/cards/${editing.value.id}`, editing.value);
      toast("卡片已更新");
    } else {
      await api.post("/cards", editing.value);
      toast("卡片已加入队列");
    }
    showEditor.value = false;
    await load();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function toggleSuspend(card) {
  try {
    await api.put(`/cards/${card.id}`, { suspended: !card.suspended });
    await load();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function removeCard(card) {
  if (!(await confirmDialog("删除这张卡片及其复习记录？"))) return;
  try {
    await api.del(`/cards/${card.id}`);
    await load();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function resetCard(card) {
  try {
    await api.post(`/cards/${card.id}/reset`);
    toast("已重置为新卡");
    await load();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function doImport() {
  if (!importText.value.trim()) return toast("没有内容", "error");
  importing.value = true;
  try {
    const isJson = importText.value.trim().startsWith("[") || importText.value.trim().startsWith("{");
    const res = await api.post("/import/cards", {
      data: importText.value,
      format: isJson ? "json" : "csv",
      noteId: importNote.value || null,
    });
    toast(`已导入 ${res.imported} 张卡片`);
    showImport.value = false;
    importText.value = "";
    await load();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    importing.value = false;
  }
}

async function exportCsv() {
  const res = await api.raw("/export/cards.csv");
  const text = await res.text();
  download("lingua-cards.csv", text, "text/csv;charset=utf-8");
}

function onFile(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => (importText.value = String(r.result));
  r.readAsText(f, "utf-8");
}

onMounted(load);
</script>

<template>
  <div class="mx-auto w-full max-w-[1180px] px-5 py-7 md:px-8">
    <!-- 统计条 -->
    <div class="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5">
      <div class="bg-surface px-4 py-3">
        <div class="eyebrow">卡片总数</div>
        <div class="mt-1 font-serif text-[22px]">{{ stats.total }}</div>
      </div>
      <div class="bg-surface px-4 py-3">
        <div class="eyebrow">今日到期</div>
        <div class="mt-1 font-serif text-[22px] text-accent">{{ stats.due }}</div>
      </div>
      <div class="bg-surface px-4 py-3">
        <div class="eyebrow">新卡</div>
        <div class="mt-1 font-serif text-[22px]">{{ stats.fresh }}</div>
      </div>
      <div class="bg-surface px-4 py-3">
        <div class="eyebrow">学习中</div>
        <div class="mt-1 font-serif text-[22px]">{{ stats.learning }}</div>
      </div>
      <div class="bg-surface px-4 py-3">
        <div class="eyebrow">已稳固</div>
        <div class="mt-1 font-serif text-[22px] text-bamboo">{{ stats.mature }}</div>
      </div>
    </div>

    <div class="mb-5 flex flex-wrap items-center gap-2">
      <div class="relative">
        <Icon name="search" :size="13" class="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input v-model="q" class="field w-[200px] py-1.5 pl-8 text-[12.5px]" placeholder="找卡片…" />
      </div>
      <select v-model="typeFilter" class="field w-auto py-1.5 text-[12px]">
        <option value="">全部类型</option>
        <option v-for="(v, k) in TYPES" :key="k" :value="k">{{ v.label }}</option>
      </select>
      <select v-model="chapterFilter" class="field w-auto py-1.5 text-[12px]">
        <option value="">全部章节</option>
        <option v-for="c in store.chapters" :key="c.id" :value="c.id">{{ c.ord }} · {{ c.title }}</option>
      </select>
      <div class="flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5">
        <button
          v-for="s in [['all','全部'],['due','到期'],['new','新卡'],['lapsed','易忘'],['suspended','暂停']]"
          :key="s[0]"
          class="rounded px-2 py-1 text-[11.5px]"
          :class="statusFilter === s[0] ? 'bg-accsoft text-accent' : 'text-muted'"
          @click="statusFilter = s[0]"
        >{{ s[1] }}</button>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <button class="btn btn-sm" @click="showImport = true"><Icon name="upload" :size="13" />导入</button>
        <button class="btn btn-sm" @click="exportCsv"><Icon name="download" :size="13" />CSV</button>
        <button class="btn btn-sm" @click="router.push('/review')"><Icon name="play" :size="13" />复习</button>
        <button class="btn btn-sm btn-accent" @click="openNew"><Icon name="plus" :size="13" />新卡</button>
      </div>
    </div>

    <div v-if="loading" class="py-20 text-center text-sm text-faint">正在读取卡片…</div>
    <div v-else-if="!filtered.length" class="card px-6 py-16 text-center">
      <div class="font-serif text-[15px] text-muted">这个筛选下还没有卡片</div>
      <button class="btn btn-sm mt-4" @click="openNew">创建第一张</button>
    </div>
    <div v-else class="card divide-y divide-line">
      <div v-for="c in filtered" :key="c.id" class="group flex items-start gap-4 px-4 py-3">
        <span class="mt-0.5 chip shrink-0 !py-0.5 !text-[10px]" :class="c.type === 'cloze' ? 'chip-accent' : ''">
          {{ TYPES[c.type]?.label || c.type }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-[13px] leading-snug text-fg">{{ c.front }}</div>
          <div class="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">{{ c.back }}</div>
          <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px] text-faint">
            <span>{{ store.noteIndex[c.note_id] || "未关联" }}</span>
            <span class="h-2.5 w-px bg-line" />
            <span>稳定度 {{ (c.stability || 0).toFixed(1) }}d</span>
            <span v-if="c.lapses" class="text-danger">遗忘 {{ c.lapses }}</span>
            <span v-if="c.suspended" class="text-warning">已暂停</span>
            <span class="ml-auto opacity-0 transition group-hover:opacity-100">
              <button class="mr-2 hover:text-accent" @click="openEdit(c)">编辑</button>
              <button class="mr-2 hover:text-warning" @click="toggleSuspend(c)">{{ c.suspended ? "恢复" : "暂停" }}</button>
              <button class="mr-2 hover:text-indigo" @click="resetCard(c)">重置</button>
              <button class="hover:text-danger" @click="removeCard(c)">删除</button>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑卡片 -->
    <div v-if="showEditor" class="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" @click.self="showEditor = false">
      <div class="w-full max-w-xl rounded-xl border border-line2 bg-surface p-6 shadow-2xl animate-pop">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-serif text-lg">{{ editing.id ? "编辑卡片" : "新建卡片" }}</h3>
          <button class="btn-ghost btn btn-sm" @click="showEditor = false"><Icon name="x" :size="16" /></button>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">类型</label>
            <select v-model="editing.type" class="field">
              <option v-for="(v, k) in TYPES" :key="k" :value="k">{{ v.label }} · {{ v.hint }}</option>
            </select>
          </div>
          <div>
            <label class="label">关联笔记</label>
            <select v-model="editing.note_id" class="field">
              <option value="">不关联</option>
              <option v-for="n in noteOptions" :key="n.id" :value="n.id">{{ n.title }}</option>
            </select>
          </div>
        </div>
        <div class="mt-3">
          <label class="label">正面 · 问题</label>
          <textarea v-model="editing.front" rows="3" class="field" :placeholder="editing.type === 'cloze' ? '语言符号的{{c1::任意性}}指能指与所指没有自然联系' : '什么是音位变体？'" />
        </div>
        <div class="mt-3">
          <label class="label">背面 · 答案</label>
          <textarea v-model="editing.back" rows="4" class="field" />
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">标签（逗号分隔）</label>
            <input v-model="editing.tagsText" class="field" placeholder="语音, 易混" @input="editing.tags = editing.tagsText.split(/[,，]/).map(s => s.trim()).filter(Boolean)" />
          </div>
          <div>
            <label class="label">图片地址（可选）</label>
            <input v-model="editing.image" class="field" placeholder="https://…" />
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn" @click="showEditor = false">取消</button>
          <button class="btn btn-accent" @click="saveCard">保存</button>
        </div>
      </div>
    </div>

    <!-- 导入 -->
    <div v-if="showImport" class="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" @click.self="showImport = false">
      <div class="w-full max-w-xl rounded-xl border border-line2 bg-surface p-6 shadow-2xl animate-pop">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-serif text-lg">导入卡片</h3>
          <button class="btn-ghost btn btn-sm" @click="showImport = false"><Icon name="x" :size="16" /></button>
        </div>
        <p class="mb-3 text-[12px] leading-relaxed text-muted">
          支持 CSV（<code class="font-mono">正面,背面,标签</code>，中英文表头均可）与 JSON 数组。
          Anki 请用「导出 → 纯文本/CSV」得到两列后粘贴于此；每行一张。
        </p>
        <input type="file" accept=".csv,.txt,.json" class="field mb-3 text-[12px]" @change="onFile" />
        <select v-model="importNote" class="field mb-3 text-[12px]">
          <option value="">不关联笔记</option>
          <option v-for="n in noteOptions" :key="n.id" :value="n.id">{{ n.title }}</option>
        </select>
        <textarea v-model="importText" rows="8" class="field font-mono text-[12px]" placeholder="什么是音位？,&quot;语言中能区别意义的最小语音单位&quot;,语音" />
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn" @click="showImport = false">取消</button>
          <button class="btn btn-accent" :disabled="importing" @click="doImport">导入</button>
        </div>
      </div>
    </div>
  </div>
</template>
