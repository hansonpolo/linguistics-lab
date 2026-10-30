<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { renderMarkdown } from "../lib/markdown.js";
import { noteTitle } from "../lib/store.js";

const props = defineProps({
  content: { type: String, default: "" },
  class: { type: String, default: "" },
});
const emit = defineEmits(["concept", "quote"]);
const router = useRouter();

const html = computed(() =>
  renderMarkdown(props.content || "", { noteTitle })
);

function onClick(e) {
  const concept = e.target.closest("[data-concept]");
  if (concept) {
    e.preventDefault();
    emit("concept", concept.dataset.concept);
    return;
  }
  const link = e.target.closest("a[data-note]");
  if (link) {
    e.preventDefault();
    router.push(`/library/${link.dataset.note}`);
  }
}

function onMouseup() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const text = sel.toString().trim();
  if (text.length < 6 || text.length > 600) return;
  emit("quote", text);
}
</script>

<template>
  <div class="prose-lingua" :class="props.class" @click="onClick" @mouseup="onMouseup" v-html="html" />
</template>
