// 手动播种 / 重置种子数据：node server/seed.js --force
import { reseed, db, DATA_DIR } from "./db.js";

const force = process.argv.includes("--force");
const did = reseed({ force });

if (!did) {
  console.log("数据库中已有数据，跳过播种。加 --force 可清空后重新播种。");
} else {
  const n = (t) => db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  console.log(`✓ 播种完成 (${DATA_DIR})`);
  console.log(`  章节 ${n("chapters")} · 笔记 ${n("notes")} · 概念 ${n("concepts")} · 卡片 ${n("cards")} · 题目 ${n("questions")}`);
}
