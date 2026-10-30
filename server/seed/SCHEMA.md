# 种子数据 Schema（唯一契约）

所有文件均为 **UTF-8、无 BOM、纯 JSON**（不要 Markdown 代码围栏，不要注释，不要尾随逗号）。
写入前请用 `node -e "JSON.parse(require('fs').readFileSync('<path>','utf8'));console.log('ok')"` 自检。

## 1. chapters.json

```json
[
  {
    "id": "c01",
    "parent": null,
    "title": "导论：语言学的对象与方法",
    "order": 1,
    "summary": "一句话概述本章。",
    "tags": ["导论"]
  }
]
```

- `id` 固定为 `c01`…`c12`，`parent` 为上级章节 id 或 `null`。
- 章节 id 与标题固定（见任务书），不得改名。

## 2. notes-part1.json / notes-part2.json

```json
{
  "notes": [
    {
      "id": "n01",
      "chapter": "c01",
      "title": "语言学的对象与任务",
      "summary": "60-100 字摘要。",
      "content": "Markdown 正文……",
      "tags": ["语言学的对象"],
      "books": ["叶蜚声、徐通锵《语言学纲要》"],
      "refs": ["叶蜚声, 徐通锵. 语言学纲要[M]. 修订本. 北京: 北京大学出版社, 2010."]
    }
  ]
}
```

正文 Markdown 约定：

- 行内公式/音标用 `$...$`，独立公式或音系表用 `$$...$$`（KaTeX 语法）。
- 脚注：`脚注内容[^1]`，文末 `[^1]: 说明文字`。
- 笔记互链：`[[n05]]` 或 `[[n05|音位]]`。
- 概念链接：`[[概念:音位]]`（概念名必须出现在 concepts.json 中）。
- 结构建议：`## 一、……` 小节、`> 原著摘录` 引用块、`| 表 |` 表格、`- ` 要点列表。每篇 900–1800 字，信息密度高，避免空话。

## 3. concepts.json

```json
{
  "concepts": [
    {
      "id": "k01",
      "name": "语言符号的任意性",
      "chapter": "c03",
      "definition": "40-120 字定义。",
      "school": "结构主义",
      "era": "1916",
      "aliases": ["任意性"],
      "relations": [
        { "to": "k02", "type": "opposes" },
        { "to": "k03", "type": "contains" }
      ]
    }
  ]
}
```

- `type` 仅限：`contains`（包含/上位）、`opposes`（对立/易混）、`influences`（师承/影响）、`related`（相关）。
- 关系单向书写即可，系统自动生成反向边。
- 共 30±4 个概念，覆盖 c01–c12；`school` 取「结构主义 / 生成语法 / 功能主义 / 社会语言学 / 认知语言学 / 历史比较语言学 / 中国传统语文学 / 普通语言学」。

## 4. cards.json

```json
{
  "cards": [
    {
      "id": "f001",
      "note": "n05",
      "type": "basic",
      "front": "什么是语言符号的任意性？",
      "back": "能指与所指的结合是**不可论证**的……",
      "tags": ["符号", "任意性"]
    }
  ]
}
```

- `type`：`basic`（名词解释/问答）、`cloze`（挖空，front 中写 `{{c1::答案}}`）、`contrast`（辨析对比，front 写清 A vs B）、`image`（front 可引用 `image` 字段的 URL 或留空）。
- `back` 支持 Markdown 与 `$...$`。
- 60 张，覆盖 n01–n24，其中 cloze ≥ 15、contrast ≥ 10。

## 5. questions.json

```json
{
  "questions": [
    {
      "id": "q001",
      "chapter": "c04",
      "type": "choice",
      "stem": "题干……",
      "options": [{ "key": "A", "text": "……" }, { "key": "B", "text": "……" }, { "key": "C", "text": "……" }, { "key": "D", "text": "……" }],
      "answer": "B",
      "rubric": [],
      "analysis": "解析，说明为何选 B、其余为何错。",
      "difficulty": 2,
      "tags": ["音位"],
      "source": "自编·依据《语言学纲要》第四章"
    }
  ]
}
```

- `type`：`choice`（单选，answer 为选项 key）、`judge`（answer 为 `"正确"` 或 `"错误"`）、`term`（名词解释）、`short`（简答）、`material`（材料分析）。
- 非选择题 `options` 为 `[]`，`answer` 为参考答案全文，`rubric` 为 3–5 条踩分点。
- 40 题：choice 16、judge 8、term 6、short 6、material 4，覆盖 n01–n24。
