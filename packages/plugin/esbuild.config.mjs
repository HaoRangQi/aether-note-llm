// esbuild config for the Obsidian plugin. Mirrors the upstream template at:
//   https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/esbuild.config.mjs
// Whenever Obsidian publishes a new built-in CodeMirror module, append it to
// the `external` array below to keep bundles small.
import esbuild from "esbuild";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const opts = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
};

if (prod) {
  await esbuild.build(opts);
} else {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
}
