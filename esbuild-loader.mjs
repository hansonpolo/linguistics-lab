import { pathToFileURL } from "node:url";

const shim = new URL("./esbuild-shim.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "esbuild") return { url: shim, shortCircuit: true };
  return next(specifier, context);
}
