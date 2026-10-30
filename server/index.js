import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "./db.js";
import { knowledge } from "./routes/knowledge.js";
import { review } from "./routes/review.js";
import { quiz } from "./routes/quiz.js";
import { ai } from "./routes/ai.js";
import { tools } from "./routes/tools.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20mb" }));
app.use(express.text({ type: "text/csv", limit: "20mb" }));

app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    const t = Date.now();
    process.stdout.write(`  ${req.method} ${req.originalUrl}\n`);
    void t;
  }
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api", knowledge);
app.use("/api", review);
app.use("/api", quiz);
app.use("/api", ai);
app.use("/api", tools);

const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  app.get("/", (_req, res) =>
    res.status(200).send("API 已启动（开发模式）。请运行 npm run dev 或 npm run build 后访问前端。")
  );
}

app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ error: err?.message || "服务器内部错误" });
});

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`\n  语言学概论 · 学习台  →  http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}\n`);
});
