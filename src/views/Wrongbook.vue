<script setup>
import { ref, computed, onMounted } from "vue";
import Icon from "../components/Icon.vue";
import { api, toast, fmt } from "../lib/api.js";
import { store } from "../lib/store.js";

const tab = ref("open"); // open | done | all
const items = ref([]);
const unresolved = ref(0);
const loading = ref(false);

const TYPES = { choice: "选择", judge: "判断", term: "名词解释", short: "简答", material: "材料分析" };

const filtered = computed(() => items.value);

async function load() {
  loading.value = true;
  try {
    const qs = tab.value === "open" ? "?resolved=0" : tab.value === "done" ? "?resolved=1" : "";
    const res = await api.get(`/wrongbook${qs}`);
    items.value = res.items || [];
    unresolved.value = res.unresolved || 0;
  } catch (e) {
    toast(e.message, "error");
  } finally {
    loading.value = false;
  }
}

async function resolve(it) {
  try {
    await api.post(`/wrongbook/${it.id}/resolve`, { resolved: 1 });
    toast("已标记为掌握");
    load();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function reopen(it) {
  try {
    await api.post(`/wrongbook/${it.id}/resolve`, { resolved: 0 });
    load();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function remove(it) {
  if (!window.confirm("从错题本中删除这条记录？")) return;
  try {
    await api.del(`/wrongbook/${it.id}`);
    load();
  } catch (e) {
    toast(e.message, "error");
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto w-full max-w-[900px] px-5 py-6 md:px-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="eyebrow mb-1.5">错题与难点</div>
        <h2 class="font-serif text-[24px] text-fg">错题本</h2>
        <p class="mt-1 text-[12.5px] text-muted">
          错题自动绑定所属知识点与笔记。未解决 <span class="text-accent">{{ unresolved }}</span> 条。
        </p>
      </div>
      <router-link to="/quiz" class="btn"><Icon name="quiz" :size="14" />去组卷</router-link>
    </header>

    <div class="mb-5 flex gap-1 border-b border-line">
      <button
        v-for="t in [{ k: 'open', l: '待攻克' }, { k: 'done', l: '已掌握' }, { k: 'all', l: '全部' }]"
        :key="t.k"
        class="relative -mb-px px-4 py-2 text-[13px] transition"
        :class="tab === t.k ? 'text-fg' : 'text-muted hover:text-fg'"
        @click="tab = t.k; load()"
      >
        {{ t.l }}
        <span v-if="tab === t.k" class="absolute inset-x-2 -bottom-px h-[2px] rounded bg-accent" />
      </button>
    </div>

    <div v-if="filtered.length" class="space-y-2">
      <div v-for="it in filtered" :key="it.id" class="card px-4 py-3.5">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 chip !py-0.5 !text-[10px]" :class="it.kind === 'card' ? '!text-bamboo' : ''">
            {{ it.kind === "card" ? "闪卡" : TYPES[it.type] || "题目" }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-[13.5px] leading-relaxed text-fg">{{ it.stem || "（题目已删除）" }}</div>
            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
              <span v-if="it.chapterTitle">{{ it.chapterTitle }}</span>
              <router-link v-if="it.note_id" :to="`/library/${it.note_id}`" class="text-bamboo/90 hover:text-bamboo">
                <Icon name="link" :size="11" class="mr-0.5 inline" />{{ it.noteTitle || it.note_id }}
              </router-link>
              <span>错 {{ it.wrong_count }} 次</span>
              <span>{{ fmt.relative(it.last_wrong_at) }}</span>
            </div>
            <div v-if="it.answer" class="mt-2 rounded border-l-2 border-line2 bg-surface2 py-1.5 pl-2.5 text-[11.5px] leading-relaxed text-muted">
              <span class="text-faint">参考答案：</span>{{ it.answer }}
            </div>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <button v-if="!it.resolved" class="btn !px-2.5 !py-1 text-[11px]" @click="resolve(it)">
              <Icon name="check" :size="12" />已掌握
            </button>
            <button v-else class="btn !px-2.5 !py-1 text-[11px]" @click="reopen(it)">重新标记</button>
            <button class="text-[10.5px] text-faint hover:text-danger" @click="remove(it)">
              <Icon name="trash" :size="12" class="inline" />删除
            </button>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="!loading" class="card px-4 py-16 text-center">
      <Icon name="check" :size="22" class="mx-auto mb-2 text-bamboo/60" />
      <div class="text-[13px] text-muted">{{ tab === "open" ? "没有待攻克的错题" : "暂无记录" }}</div>
      <p class="mt-1 text-[11.5px] text-faint">答错的题会自动进入这里，并绑定对应笔记与卡片。</p>
    </div>
  </div>
</template>
