<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from "vue";
import { useRoute } from "vue-router";
import Icon from "../components/Icon.vue";
import { api, toast } from "../lib/api.js";
import { store } from "../lib/store.js";

const route = useRoute();
const canvas = ref(null);
const wrap = ref(null);
const loading = ref(true);
const nodes = ref([]);
const edges = ref([]);
const hover = ref(null);
const selected = ref(null);
const detail = ref(null);
const chapter = ref("");
const typeFilter = ref({ contains: true, opposes: true, influences: true, related: true });
const showLabels = ref(true);

const REL = {
  contains: { label: "包含", color: "#7aa894" },
  opposes: { label: "对立", color: "#d0785a" },
  influences: { label: "影响", color: "#8ba3cf" },
  related: { label: "相关", color: "#7c8794" },
};

let ctx = null;
let raf = 0;
let dpr = 1;
let W = 800;
let H = 600;
let transform = { x: 0, y: 0, k: 1 };
let dragging = null;
let panning = null;
let moved = false;

const filteredEdges = computed(() =>
  edges.value.filter((e) => {
    if (!typeFilter.value[e.type]) return false;
    if (chapter.value) {
      const a = nodes.value.find((n) => n.id === e.from_id);
      const b = nodes.value.find((n) => n.id === e.to_id);
      return a?.chapter === chapter.value || b?.chapter === chapter.value;
    }
    return true;
  })
);

const visibleNodes = computed(() =>
  chapter.value ? nodes.value.filter((n) => n.chapter === chapter.value) : nodes.value
);

const chapters = computed(() => store.chapters || []);

function resize() {
  const el = wrap.value;
  if (!el || !canvas.value) return;
  dpr = window.devicePixelRatio || 1;
  W = el.clientWidth;
  H = el.clientHeight;
  canvas.value.width = W * dpr;
  canvas.value.height = H * dpr;
  canvas.value.style.width = W + "px";
  canvas.value.style.height = H + "px";
  ctx = canvas.value.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initPositions() {
  for (const n of nodes.value) {
    n.x = W / 2 + (Math.random() - 0.5) * W * 0.55;
    n.y = H / 2 + (Math.random() - 0.5) * H * 0.55;
    n.vx = 0;
    n.vy = 0;
  }
  const focus = route.query.focus;
  if (focus) {
    const n = nodes.value.find((x) => x.id === focus);
    if (n) selected.value = n;
  }
}

function step() {
  const ns = nodes.value;
  const es = filteredEdges.value;
  const alpha = 0.4;
  for (let i = 0; i < ns.length; i++) {
    const a = ns[i];
    for (let j = i + 1; j < ns.length; j++) {
      const b = ns[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy || 0.01;
      const d = Math.sqrt(d2);
      const force = 2400 / d2;
      dx /= d;
      dy /= d;
      a.vx -= dx * force * alpha;
      a.vy -= dy * force * alpha;
      b.vx += dx * force * alpha;
      b.vy += dy * force * alpha;
    }
  }
  for (const e of es) {
    const a = ns.find((n) => n.id === e.from_id);
    const b = ns.find((n) => n.id === e.to_id);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const target = 150;
    const f = (d - target) * 0.0035;
    a.vx += (dx / d) * f * alpha;
    a.vy += (dy / d) * f * alpha;
    b.vx -= (dx / d) * f * alpha;
    b.vy -= (dy / d) * f * alpha;
  }
  const cx = W / 2;
  const cy = H / 2;
  for (const n of ns) {
    n.vx += (cx - n.x) * 0.0012;
    n.vy += (cy - n.y) * 0.0012;
    n.vx *= 0.85;
    n.vy *= 0.85;
    n.x += n.vx;
    n.y += n.vy;
    const pad = 40;
    n.x = Math.max(pad, Math.min(W - pad, n.x));
    n.y = Math.max(pad, Math.min(H - pad, n.y));
  }
}

function draw() {
  if (!ctx) return;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  const active = selected.value?.id || hover.value?.id;
  for (const e of filteredEdges.value) {
    const a = nodes.value.find((n) => n.id === e.from_id);
    const b = nodes.value.find((n) => n.id === e.to_id);
    if (!a || !b) continue;
    const rel = REL[e.type] || REL.related;
    const on = active && (a.id === active || b.id === active);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = rel.color;
    ctx.globalAlpha = on ? 0.85 : 0.22;
    ctx.lineWidth = on ? 1.6 : 0.9;
    if (e.type === "opposes") ctx.setLineDash([4, 3]);
    else if (e.type === "influences") ctx.setLineDash([1.5, 3]);
    else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (on) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = rel.color;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(rel.label, mx, my - 4);
    }
  }
  ctx.globalAlpha = 1;

  for (const n of visibleNodes.value) {
    const isSel = selected.value?.id === n.id;
    const isHov = hover.value?.id === n.id;
    const r = 5 + Math.min(6, (n.degree || 0) * 0.9);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + (isSel ? 4 : isHov ? 2 : 0), 0, Math.PI * 2);
    ctx.fillStyle = isSel ? "#d0785a" : isHov ? "rgba(208,120,90,.75)" : "rgba(140,160,180,.55)";
    ctx.fill();
    if (isSel) {
      ctx.strokeStyle = "#d0785a";
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (showLabels.value || isSel || isHov) {
      ctx.font = `${isSel ? "600 13px" : "12px"} "Noto Serif SC", serif`;
      ctx.fillStyle = isSel ? "#e8b9a7" : hover.value?.id === n.id ? "#dde3e8" : "rgba(222,228,233,.75)";
      ctx.textAlign = "center";
      ctx.fillText(n.name, n.x, n.y + r + 14);
    }
  }
  ctx.restore();
}

function loop() {
  if (!dragging) step();
  draw();
  raf = requestAnimationFrame(loop);
}

function nodeAt(px, py) {
  const x = (px - transform.x) / transform.k;
  const y = (py - transform.y) / transform.k;
  let best = null;
  let bestD = 22;
  for (const n of visibleNodes.value) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function onMove(e) {
  const rect = canvas.value.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  if (dragging) {
    dragging.x = (px - transform.x) / transform.k;
    dragging.y = (py - transform.y) / transform.k;
    dragging.vx = 0;
    dragging.vy = 0;
    moved = true;
    return;
  }
  if (panning) {
    transform.x = panning.tx + (px - panning.px);
    transform.y = panning.ty + (py - panning.py);
    return;
  }
  const n = nodeAt(px, py);
  hover.value = n;
  canvas.value.style.cursor = n ? "pointer" : "grab";
}

function onDown(e) {
  const rect = canvas.value.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const n = nodeAt(px, py);
  moved = false;
  if (n) {
    dragging = n;
  } else {
    panning = { px, py, tx: transform.x, ty: transform.y };
  }
}

async function onUp() {
  if (dragging && !moved) {
    select(dragging);
  }
  dragging = null;
  panning = null;
}

async function select(n) {
  selected.value = n;
  try {
    const data = await api.get(`/concepts/${n.id}`);
    detail.value = { ...data.concept, relations: data.relations, notes: data.notes };
  } catch {
    detail.value = null;
  }
}

function onWheel(e) {
  e.preventDefault();
  const rect = canvas.value.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.12 : 0.89;
  const k2 = Math.max(0.4, Math.min(2.6, transform.k * factor));
  transform.x = px - ((px - transform.x) / transform.k) * k2;
  transform.y = py - ((py - transform.y) / transform.k) * k2;
  transform.k = k2;
}

function reset() {
  transform = { x: 0, y: 0, k: 1 };
  initPositions();
}

watch(chapter, () => {
  selected.value = null;
  detail.value = null;
});

onMounted(async () => {
  try {
    const data = await api.get("/graph");
    nodes.value = data.nodes;
    edges.value = data.edges;
    resize();
    initPositions();
    window.addEventListener("resize", resize);
    loop();
    if (route.query.focus) {
      const n = nodes.value.find((x) => x.id === route.query.focus);
      if (n) select(n);
    }
  } catch (e) {
    toast(e.message, "error");
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener("resize", resize);
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 md:px-7">
      <span class="eyebrow mr-1">关系型</span>
      <button
        v-for="(v, k) in REL"
        :key="k"
        class="chip"
        :class="typeFilter[k] ? 'chip-accent' : 'opacity-45'"
        @click="typeFilter[k] = !typeFilter[k]"
      >
        <span class="h-1.5 w-1.5 rounded-full" :style="{ background: v.color }" />{{ v.label }}
      </button>
      <div class="mx-1 h-4 w-px bg-line" />
      <select v-model="chapter" class="field w-auto py-1 text-[11.5px]">
        <option value="">全部章节</option>
        <option v-for="c in chapters" :key="c.id" :value="c.id">{{ c.ord }} · {{ c.title }}</option>
      </select>
      <button class="chip" :class="showLabels ? 'chip-accent' : ''" @click="showLabels = !showLabels">标签</button>
      <div class="ml-auto flex items-center gap-2 text-[11px] text-faint">
        <span>{{ visibleNodes.length }} 概念 · {{ filteredEdges.length }} 关系</span>
        <button class="btn btn-sm" @click="reset"><Icon name="refresh" :size="13" />重置</button>
      </div>
    </div>

    <div class="relative flex-1">
      <div ref="wrap" class="graph-canvas absolute inset-0">
        <canvas
          ref="canvas"
          class="block h-full w-full"
          @mousemove="onMove"
          @mousedown="onDown"
          @mouseup="onUp"
          @mouseleave="onUp"
          @wheel="onWheel"
        />
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center text-sm text-faint">正在铺展关系网…</div>

        <div class="pointer-events-none absolute bottom-4 left-4 rounded-md border border-line bg-surface/80 px-3 py-2 text-[10.5px] leading-relaxed text-faint backdrop-blur">
          <div>拖动节点可调位置 · 滚轮缩放 · 拖动画布平移</div>
          <div class="mt-1">实线 包含 · 虚线 对立 · 点线 影响</div>
        </div>
      </div>

      <!-- 概念详情 -->
      <transition name="fade">
        <div
          v-if="selected"
          class="absolute inset-y-0 right-0 w-full max-w-[360px] overflow-y-auto border-l border-line bg-surface/95 p-6 backdrop-blur-md"
        >
          <div class="mb-5 flex items-start justify-between">
            <div>
              <div class="eyebrow mb-1">概念节点</div>
              <h3 class="font-serif text-[21px] text-fg">{{ selected.name }}</h3>
            </div>
            <button class="btn-ghost btn btn-sm" @click="selected = null; detail = null"><Icon name="x" :size="15" /></button>
          </div>
          <template v-if="detail">
            <p class="text-[13px] leading-relaxed text-muted">{{ detail.definition }}</p>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <span v-if="detail.school" class="chip">{{ detail.school }}</span>
              <span v-if="detail.era" class="chip">{{ detail.era }}</span>
            </div>
            <div v-if="detail.relations?.length" class="mt-6">
              <div class="eyebrow mb-2">直接关系</div>
              <div class="space-y-1.5">
                <button
                  v-for="(r, i) in detail.relations"
                  :key="i"
                  class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-surface2"
                  @click="select({ id: r.id, name: r.name, degree: 2 })"
                >
                  <span class="chip !py-0.5 !text-[9.5px]">{{ REL[r.type]?.label || r.type }}</span>
                  <span class="text-fg">{{ r.name }}</span>
                </button>
              </div>
            </div>
            <div v-if="detail.notes?.length" class="mt-6">
              <div class="eyebrow mb-2">出现在笔记</div>
              <div class="space-y-1">
                <router-link
                  v-for="n in detail.notes"
                  :key="n.id"
                  :to="`/library/${n.id}`"
                  class="block rounded px-2 py-1.5 text-[12px] text-muted hover:bg-surface2 hover:text-accent"
                >{{ n.title }}</router-link>
              </div>
            </div>
          </template>
          <div v-else class="text-[12px] text-faint">加载概念详情…</div>
        </div>
      </transition>
    </div>
  </div>
</template>
