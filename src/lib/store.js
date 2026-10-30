import { reactive, computed } from "vue";
import { api } from "./api.js";

export const store = reactive({
  ready: false,
  chapters: [],
  counts: null,
  today: null,
  stats: null,
  tags: [],
  ai: null,
  notes: [],
  noteIndex: {},
  settings: {},
  theme: "dark",
});

export function applyTheme(t) {
  store.theme = t;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#12161c" : "#f6f2e9");
  try {
    localStorage.setItem("lingua-theme", t);
  } catch {}
}

export function toggleTheme() {
  applyTheme(store.theme === "dark" ? "light" : "dark");
}

export async function bootstrap(force = false) {
  if (store.ready && !force) return store;
  const data = await api.get("/bootstrap");
  store.chapters = data.chapters || [];
  store.counts = data.counts || null;
  store.today = data.today || null;
  store.tags = data.tags || [];
  store.notes = data.notes || [];
  store.noteIndex = Object.fromEntries(store.notes.map((n) => [n.id, n.title]));
  store.ready = true;
  refreshStats().catch(() => {});
  return store;
}

export async function refreshStats() {
  try {
    store.stats = await api.get("/stats");
  } catch {}
}

export async function refreshSettings() {
  try {
    const { settings } = await api.get("/settings");
    store.settings = settings;
  } catch {}
}

export const noteTitle = (id) => store.noteIndex[id] || id;

export function chapterOf(id) {
  return store.chapters.find((c) => c.id === id) || null;
}

export const chapterMap = computed(() =>
  Object.fromEntries(store.chapters.map((c) => [c.id, c]))
);
