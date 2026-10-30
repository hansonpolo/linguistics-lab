<script setup>
import { computed } from "vue";

const props = defineProps({
  days: { type: Array, default: () => [] },
  weeks: { type: Number, default: 18 },
});

const cells = computed(() => {
  const map = new Map(props.days.map((d) => [d.date, d.count]));
  const out = [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (props.weeks * 7 - 1));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  for (let w = 0; w < props.weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      if (day > today) {
        col.push({ date: "", count: -1 });
        continue;
      }
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      col.push({ date: key, count: map.get(key) || 0 });
    }
    out.push(col);
  }
  return out;
});

function level(n) {
  if (n <= 0) return "bg-surface2";
  if (n < 5) return "bg-accent/25";
  if (n < 12) return "bg-accent/45";
  if (n < 25) return "bg-accent/70";
  return "bg-accent";
}
</script>

<template>
  <div class="flex gap-[3px] overflow-x-auto pb-1">
    <div v-for="(col, i) in cells" :key="i" class="flex flex-col gap-[3px]">
      <div
        v-for="(cell, j) in col"
        :key="j"
        class="h-[10px] w-[10px] rounded-[2px] transition-colors"
        :class="cell.count < 0 ? 'bg-transparent' : level(cell.count)"
        :title="cell.date ? `${cell.date} · ${cell.count} 次复习` : ''"
      />
    </div>
  </div>
</template>
