const BASE = "/api";

async function request(path, { method = "GET", body, raw = false } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `请求失败（${res.status}）`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: "POST", body }),
  put: (p, body) => request(p, { method: "PUT", body }),
  del: (p) => request(p, { method: "DELETE" }),
  raw: (p) => request(p, { raw: true }),
};

export const fmt = {
  date(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(+d)) return "—";
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },
  dateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  },
  relative(iso) {
    if (!iso) return "从未";
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
    return fmt.date(iso);
  },
  mins(sec) {
    if (!sec) return "0";
    const m = Math.round(sec / 60);
    return m < 1 ? `${sec}s` : `${m} 分钟`;
  },
  pct(v) {
    return `${Math.round((v || 0) * 100)}%`;
  },
};

export function toast(message, type = "info") {
  window.dispatchEvent(new CustomEvent("lingua-toast", { detail: { message, type } }));
}

export function confirmDialog(message) {
  return Promise.resolve(window.confirm(message));
}

export function download(filename, content, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
