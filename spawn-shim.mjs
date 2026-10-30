// 在受限沙箱中，子进程创建（spawn/exec）会被拒绝。
// Vite 在 Windows 上会通过 exec("net use") 探测网络驱动器映射；
// 这里把 exec 降级为“无映射”的空实现，避免构建因 EPERM 中断。
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

const noop = () => ({ on() {}, kill() {}, stdout: null, stderr: null });
cp.exec = function exec(_cmd, ...rest) {
  const cb = rest[rest.length - 1];
  if (typeof cb === "function") queueMicrotask(() => cb(new Error("spawn blocked")));
  return noop();
};
cp.execFile = cp.exec;
cp.spawn = function spawn() {
  const child = noop();
  child.on = (ev, fn) => { if (ev === "error") queueMicrotask(() => fn(new Error("spawn blocked"))); return child; };
  return child;
};
syncBuiltinESMExports();
