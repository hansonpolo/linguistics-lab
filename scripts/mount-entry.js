// 仅在渲染自检时使用的挂载入口（真正的前端入口是 src/main.js）。
import { createApp } from "vue";
import App from "../src/App.vue";
import { router } from "../src/router.js";
import { applyTheme } from "../src/lib/store.js";
import "../src/style.css";

window.__vueErrors = [];
const app = createApp(App);
app.config.errorHandler = (err) => window.__vueErrors.push(String((err && err.stack) || err));
app.use(router);
applyTheme("dark");
router.isReady().then(() => app.mount("#app"));
