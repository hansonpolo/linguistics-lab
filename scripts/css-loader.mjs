// 测试环境专用：把 .css 导入替换为空模块（Node 不认识 CSS）。
export async function load(url, context, next) {
  if (url.endsWith(".css")) {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }
  return next(url, context);
}
