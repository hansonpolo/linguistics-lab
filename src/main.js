import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";
import { applyTheme } from "./lib/store.js";
import "./style.css";

const app = createApp(App);
app.use(router);
app.mount("#app");

let stored = "dark";
try {
  stored = localStorage.getItem("lingua-theme") || "dark";
} catch {}
applyTheme(stored === "light" ? "light" : "dark");

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
