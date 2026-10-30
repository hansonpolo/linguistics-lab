import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", name: "today", component: () => import("./views/Today.vue"), meta: { title: "今日", sub: "学习台" } },
  { path: "/library", name: "library", component: () => import("./views/Library.vue"), meta: { title: "知识库", sub: "章节 · 笔记 · 概念" } },
  { path: "/library/:id", name: "note", component: () => import("./views/NoteReader.vue"), meta: { title: "笔记", sub: "精读" } },
  { path: "/graph", name: "graph", component: () => import("./views/Graph.vue"), meta: { title: "知识图谱", sub: "概念的谱系" } },
  { path: "/cards", name: "cards", component: () => import("./views/Cards.vue"), meta: { title: "闪卡", sub: "FSRS 间隔重复" } },
  { path: "/review", name: "review", component: () => import("./views/Review.vue"), meta: { title: "复习", sub: "今日队列" } },
  { path: "/quiz", name: "quiz", component: () => import("./views/Quiz.vue"), meta: { title: "自测", sub: "组卷 · 题库" } },
  { path: "/quiz/session/:id", name: "quiz-session", component: () => import("./views/QuizSession.vue"), meta: { title: "答题", sub: "计时模拟" } },
  { path: "/wrongbook", name: "wrongbook", component: () => import("./views/Wrongbook.vue"), meta: { title: "错题本", sub: "薄弱点复盘" } },
  { path: "/ai", name: "ai", component: () => import("./views/Ai.vue"), meta: { title: "AI 学伴", sub: "教材口径 · 分区作答" } },
  { path: "/tools", name: "tools", component: () => import("./views/Tools.vue"), meta: { title: "工具箱", sub: "IPA · 著录 · 备份" } },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.hash) return { el: to.hash, top: 96, behavior: "smooth" };
    return { top: 0 };
  },
});
