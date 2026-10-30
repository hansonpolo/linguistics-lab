<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import Icon from "../components/Icon.vue";
import { api, toast, download } from "../lib/api.js";
import { store, refreshSettings, refreshStats, applyTheme } from "../lib/store.js";

const tab = ref("ipa");

/* ---------- IPA ---------- */
const groups = [
  {
    label: "辅音",
    items: "p b t d k ɡ ʔ m n ŋ f v s z ʃ ʒ x h ts tʃ dʒ ɕ ʑ ɳ ɭ ɹ j w l r".split(" "),
  },
  { label: "元音", items: "i y ɨ ʉ ɯ u ɪ ʏ ʊ e ø ɘ ɵ ɤ o ə ɛ œ ɜ ɞ ʌ ɔ æ ɐ a ɶ ɑ ɒ".split(" ") },
  { label: "声调", items: ["˥", "˦", "˧", "˨", "˩", "˥˩", "˧˥", "˨˩˦"] },
  { label: "附加符号", items: ["ˈ", "ˌ", "ː", "ˑ", "ʰ", "ʷ", "ˀ", "̥", "̤", "̃", "̩", "̯"] },
];
const ipaText = ref("/pʰin⁵⁵ ɕi̯ɑʊ̯²¹⁴/");
const ipaRef = ref(null);

function insert(sym) {
  const el = ipaRef.value;
  if (!el) return (ipaText.value += sym);
  const s = el.selectionStart ?? ipaText.value.length;
  const e = el.selectionEnd ?? ipaText.value.length;
  ipaText.value = ipaText.value.slice(0, s) + sym + ipaText.value.slice(e);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(s + sym.length, s + sym.length);
  });
}

async function copyIpa() {
  try {
    await navigator.clipboard.writeText(ipaText.value);
    toast("已复制");
  } catch {
    toast("复制失败，请手动选择", "error");
  }
}

/* ---------- 参考文献 ---------- */
const REF_TYPES = [
  { k: "book", l: "专著 [M]" }, { k: "journal", l: "期刊 [J]" }, { k: "thesis", l: "学位论文 [D]" },
  { k: "chapter", l: "析出文献 [C]" }, { k: "web", l: "电子资源 [EB/OL]" },
  { k: "newspaper", l: "报纸 [N]" }, { k: "report", l: "报告 [R]" },
];
const refForm = reactive({
  type: "book", authors: "索绪尔", title: "普通语言学教程", translator: "高名凯",
  place: "北京", publisher: "商务印书馆", year: "1980", edition: "", pages: "",
  journal: "", volume: "", issue: "", school: "", url: "", accessed: "", date: "", newspaper: "",
});
const refResults = ref([]);
const formatting = ref(false);

async function formatRef() {
  if (!refForm.title.trim()) return toast("请填写题名", "error");
  formatting.value = true;
  try {
    const res = await api.post("/tools/refs", { ...refForm });
    refResults.value = res.items;
  } catch (e) {
    toast(e.message, "error");
  } finally {
    formatting.value = false;
  }
}

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    toast("已复制");
  } catch {
    toast("复制失败", "error");
  }
}

/* ---------- 设置 ---------- */
const form = reactive({
  retention: 0.9, new_per_day: 20, review_per_day: 120, daily_goal: 30,
  exam_minutes: 60, ai_base_url: "", ai_model: "", ai_key: "",
});
const saving = ref(false);
const about = ref(null);
const importing = ref(false);
const fileInput = ref(null);

function syncForm() {
  const s = store.settings || {};
  for (const k in form) if (s[k] !== undefined) form[k] = s[k];
  form.ai_key = "";
}

async function saveSettings() {
  saving.value = true;
  try {
    const payload = { ...form };
    if (!payload.ai_key) delete payload.ai_key;
    await api.put("/settings", payload);
    await refreshSettings();
    syncForm();
    toast("设置已保存");
  } catch (e) {
    toast(e.message, "error");
  } finally {
    saving.value = false;
  }
}

/* ---------- 数据 ---------- */
function exportJson(scope) {
  download(`/api/export?scope=${scope}`, `lingua-${scope}-${Date.now()}.json`);
}

function exportCsv() {
  download("/api/export/cards.csv", "lingua-cards.csv");
}

function downloadDb() {
  download("/api/backup/file", `lingua-backup-${Date.now()}.db`);
}

async function onFile(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  importing.value = true;
  try {
    const text = await f.text();
    const data = JSON.parse(text);
    const res = await api.post("/import/backup", data);
    toast(`导入完成：${Object.entries(res.stats || {}).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    refreshStats();
  } catch (err) {
    toast("导入失败：" + err.message, "error");
  } finally {
    importing.value = false;
    if (fileInput.value) fileInput.value.value = "";
  }
}

onMounted(async () => {
  syncForm();
  try {
    about.value = await api.get("/about");
  } catch {
    /* ignore */
  }
});
</script>

<template>
  <div class="mx-auto w-full max-w-[960px] px-5 py-6 md:px-8">
    <header class="mb-5">
      <div class="eyebrow mb-1.5">工具台</div>
      <h2 class="font-serif text-[24px] text-fg">语言学工具</h2>
      <p class="mt-1 text-[12.5px] text-muted">IPA 输入、参考文献著录、偏好设置与本地数据管理。</p>
    </header>

    <div class="mb-5 flex flex-wrap gap-1 border-b border-line">
      <button
        v-for="t in [{ k: 'ipa', l: 'IPA 输入' }, { k: 'refs', l: '参考文献' }, { k: 'settings', l: '设置' }, { k: 'data', l: '数据' }]"
        :key="t.k"
        class="relative -mb-px px-4 py-2 text-[13px] transition"
        :class="tab === t.k ? 'text-fg' : 'text-muted hover:text-fg'"
        @click="tab = t.k"
      >
        {{ t.l }}
        <span v-if="tab === t.k" class="absolute inset-x-2 -bottom-px h-[2px] rounded bg-accent" />
      </button>
    </div>

    <!-- IPA -->
    <template v-if="tab === 'ipa'">
      <div class="card p-4">
        <label class="label">编辑区</label>
        <textarea ref="ipaRef" v-model="ipaText" class="field min-h-[76px] !font-ipa !text-[17px] leading-relaxed" />
        <div class="mt-2 flex gap-2">
          <button class="btn !py-1.5 text-[12px]" @click="copyIpa"><Icon name="copy" :size="13" />复制</button>
          <button class="btn !py-1.5 text-[12px]" @click="ipaText = ''">清空</button>
          <span class="ml-auto self-center text-[10.5px] text-faint">点击下方符号插入到光标处</span>
        </div>
      </div>

      <div v-for="g in groups" :key="g.label" class="mt-4">
        <div class="eyebrow mb-2">{{ g.label }}</div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in g.items"
            :key="s"
            class="ipa-cell"
            @click="insert(s)"
          >{{ s }}</button>
        </div>
      </div>

      <div class="card mt-5 px-4 py-3 text-[11.5px] leading-relaxed text-muted">
        <span class="text-faint">示例：</span>严式标音 <span class="font-ipa">[pʰin⁵⁵ ɕi̯ɑʊ̯²¹⁴]</span>；
        宽式标音 <span class="font-ipa">/pin ɕiɑu/</span>。声调符号标注在音节末尾，轻声可标 ˑ 或省略。
      </div>
    </template>

    <!-- 参考文献 -->
    <template v-else-if="tab === 'refs'">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="card space-y-3 p-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">文献类型</label>
              <select v-model="refForm.type" class="field">
                <option v-for="t in REF_TYPES" :key="t.k" :value="t.k">{{ t.l }}</option>
              </select>
            </div>
            <div>
              <label class="label">年份</label>
              <input v-model="refForm.year" class="field" placeholder="1980" />
            </div>
          </div>
          <div>
            <label class="label">作者（多个用；分隔，超过三人自动「等」）</label>
            <input v-model="refForm.authors" class="field" placeholder="叶蜚声；徐通锵" />
          </div>
          <div>
            <label class="label">题名</label>
            <input v-model="refForm.title" class="field" placeholder="语言学纲要" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">出版地</label>
              <input v-model="refForm.place" class="field" placeholder="北京" />
            </div>
            <div>
              <label class="label">{{ refForm.type === "thesis" ? "学位授予单位" : "出版者" }}</label>
              <input v-model="refForm.publisher" class="field" placeholder="北京大学出版社" />
            </div>
          </div>
          <div v-if="refForm.type === 'journal'" class="grid grid-cols-3 gap-2">
            <div class="col-span-3">
              <label class="label">刊名</label>
              <input v-model="refForm.journal" class="field" placeholder="中国语文" />
            </div>
            <div><label class="label">卷</label><input v-model="refForm.volume" class="field" /></div>
            <div><label class="label">期</label><input v-model="refForm.issue" class="field" /></div>
            <div><label class="label">页码</label><input v-model="refForm.pages" class="field" /></div>
          </div>
          <div v-else class="grid grid-cols-2 gap-3">
            <div><label class="label">版次</label><input v-model="refForm.edition" class="field" placeholder="3" /></div>
            <div><label class="label">页码</label><input v-model="refForm.pages" class="field" placeholder="12-28" /></div>
          </div>
          <div v-if="refForm.type === 'book'" class="grid grid-cols-2 gap-3">
            <div><label class="label">译者</label><input v-model="refForm.translator" class="field" placeholder="高名凯" /></div>
            <div><label class="label">出版年</label><input v-model="refForm.year" class="field" /></div>
          </div>
          <div v-if="refForm.type === 'web'" class="grid grid-cols-2 gap-3">
            <div class="col-span-2"><label class="label">URL</label><input v-model="refForm.url" class="field" placeholder="https://…" /></div>
            <div><label class="label">发布日期</label><input v-model="refForm.date" class="field" placeholder="2024-03-01" /></div>
            <div><label class="label">引用日期</label><input v-model="refForm.accessed" class="field" placeholder="2026-10-30" /></div>
          </div>
          <div class="flex gap-2 pt-1">
            <button class="btn btn-accent" :disabled="formatting" @click="formatRef">生成著录</button>
            <button class="btn" @click="Object.assign(refForm, { title: '', authors: '', journal: '', volume: '', issue: '', pages: '' })">重置</button>
          </div>
        </div>

        <div class="space-y-3">
          <div v-for="(r, i) in refResults" :key="i" class="card px-4 py-3">
            <div class="mb-1 flex items-center gap-2">
              <span class="font-mono text-[10px] text-faint">[{{ r.index }}]</span>
              <span class="chip !py-0 !text-[9.5px]">GB/T 7714-2015</span>
              <button class="ml-auto text-faint hover:text-accent" @click="copyText(r.text)"><Icon name="copy" :size="12" /></button>
            </div>
            <p class="text-[12.5px] leading-relaxed text-fg">{{ r.text }}</p>
          </div>
          <div v-if="!refResults.length" class="card px-4 py-12 text-center text-[12px] text-faint">
            填写左侧信息，生成符合国标的研究生课程论文参考文献
          </div>
          <div class="card px-4 py-3 text-[11px] leading-relaxed text-faint">
            GB/T 7714-2015 顺序编码制：专著 [M]、期刊 [J]、析出文献 [C]、学位论文 [D]、电子资源 [EB/OL]；
            三位以上作者只列前三位并加「等」。
          </div>
        </div>
      </div>
    </template>

    <!-- 设置 -->
    <template v-else-if="tab === 'settings'">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="card space-y-4 p-4">
          <div class="eyebrow">复习参数</div>
          <div>
            <label class="label">目标保留率 {{ Math.round(form.retention * 100) }}%</label>
            <input v-model.number="form.retention" type="range" min="0.8" max="0.97" step="0.01" class="w-full accent-[var(--accent)]" />
            <p class="mt-1 text-[10.5px] text-faint">越高越稳，但复习量随之增加；推荐 0.90。</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label">每日新卡上限</label><input v-model.number="form.new_per_day" type="number" min="0" max="200" class="field" /></div>
            <div><label class="label">每日复习上限</label><input v-model.number="form.review_per_day" type="number" min="0" max="999" class="field" /></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label">每日学习目标（分钟）</label><input v-model.number="form.daily_goal" type="number" min="5" max="300" class="field" /></div>
            <div><label class="label">模拟套卷默认时长</label><input v-model.number="form.exam_minutes" type="number" min="10" max="180" class="field" /></div>
          </div>
          <div class="border-t border-line pt-4">
            <div class="eyebrow mb-2">外观</div>
            <div class="flex gap-2">
              <button class="btn flex-1" :class="store.theme === 'dark' ? '!border-accent !text-accent' : ''" @click="applyTheme('dark')">夜读</button>
              <button class="btn flex-1" :class="store.theme === 'light' ? '!border-accent !text-accent' : ''" @click="applyTheme('light')">纸本</button>
            </div>
          </div>
        </div>

        <div class="card space-y-4 p-4">
          <div class="eyebrow">AI 接口（可选）</div>
          <p class="text-[11.5px] leading-relaxed text-muted">
            留空则使用本地检索式回答。填入 OpenAI 兼容接口后，助手会带上站内资料请求模型，失败自动回退。
            密钥仅存本地数据库，接口不回传明文。
          </p>
          <div><label class="label">Base URL</label><input v-model="form.ai_base_url" class="field" placeholder="https://api.openai.com/v1" /></div>
          <div><label class="label">模型</label><input v-model="form.ai_model" class="field" placeholder="gpt-4o-mini" /></div>
          <div>
            <label class="label">API Key <span v-if="store.settings?.ai_key_set" class="text-bamboo">（已设置）</span></label>
            <input v-model="form.ai_key" type="password" class="field" placeholder="留空则不修改" />
          </div>
          <div class="border-t border-line pt-3">
            <button class="btn btn-accent w-full" :disabled="saving" @click="saveSettings">保存设置</button>
          </div>
        </div>
      </div>
    </template>

    <!-- 数据 -->
    <template v-else>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="card p-4">
          <div class="eyebrow mb-3">导出</div>
          <div class="space-y-2">
            <button class="btn w-full justify-start" @click="exportJson('all')"><Icon name="download" :size="14" />完整备份（JSON，含复习记录）</button>
            <button class="btn w-full justify-start" @click="exportJson('notes')"><Icon name="download" :size="14" />仅笔记与章节</button>
            <button class="btn w-full justify-start" @click="exportJson('cards')"><Icon name="download" :size="14" />仅闪卡</button>
            <button class="btn w-full justify-start" @click="exportCsv"><Icon name="download" :size="14" />闪卡 CSV（Anki 可导入）</button>
            <button class="btn w-full justify-start" @click="downloadDb"><Icon name="download" :size="14" />SQLite 原始库文件</button>
          </div>
        </div>

        <div class="card p-4">
          <div class="eyebrow mb-3">导入</div>
          <p class="text-[11.5px] leading-relaxed text-muted">
            导入本站导出的 JSON 备份会合并同 ID 的章节、笔记、闪卡与题目；复习记录不会被覆盖。
          </p>
          <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onFile" />
          <button class="btn mt-3 w-full" :disabled="importing" @click="fileInput?.click()">
            <Icon name="upload" :size="14" />{{ importing ? "导入中…" : "选择 JSON 备份文件" }}
          </button>
          <div class="mt-4 border-t border-line pt-3">
            <div class="eyebrow mb-2">本地存储</div>
            <dl class="space-y-1.5 text-[11.5px]">
              <div class="flex justify-between gap-3"><dt class="text-faint">数据目录</dt><dd class="truncate text-muted">{{ about?.dataDir || "—" }}</dd></div>
              <div class="flex justify-between"><dt class="text-faint">Node</dt><dd class="font-mono text-muted">{{ about?.node || "—" }}</dd></div>
              <div class="flex justify-between"><dt class="text-faint">已运行</dt><dd class="font-mono text-muted">{{ about?.uptime ? about.uptime + " 秒" : "—" }}</dd></div>
            </dl>
            <p class="mt-2 text-[10.5px] leading-relaxed text-faint">
              所有数据保存在本机 SQLite 文件中，不上传任何服务器。建议定期下载完整备份。
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
