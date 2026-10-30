<script setup>
import { computed } from "vue";

const props = defineProps({
  value: { type: Number, default: 0 },
  size: { type: Number, default: 120 },
  stroke: { type: Number, default: 7 },
  label: { type: String, default: "" },
  sub: { type: String, default: "" },
  color: { type: String, default: "var(--accent)" },
});

const r = computed(() => (props.size - props.stroke) / 2);
const c = computed(() => 2 * Math.PI * r.value);
const dash = computed(() => `${Math.max(0, Math.min(1, props.value)) * c.value} ${c.value}`);
</script>

<template>
  <div class="relative inline-flex items-center justify-center" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :width="size" :height="size" class="-rotate-90">
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="var(--line)" :stroke-width="stroke" />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="r"
        fill="none"
        :stroke="color"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="dash"
        class="transition-all duration-700"
      />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="font-serif text-[22px] leading-none text-fg">{{ Math.round(value * 100) }}<span class="text-[12px] text-muted">%</span></span>
      <span v-if="label" class="mt-1 text-[10.5px] tracking-wide text-faint">{{ label }}</span>
      <span v-if="sub" class="text-[10px] text-faint">{{ sub }}</span>
    </div>
  </div>
</template>
