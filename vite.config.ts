import aurelia from "@aurelia/vite-plugin";

import { visualizer } from "rollup-plugin-visualizer";
import * as rollupPluginutils from "rollup-pluginutils";
import { defineConfig, type PluginOption } from "vite";

import { resumeApi } from "./resume-api-plugin";
import { resumeJsonLd } from "./resume-jsonld-plugin";
/**
 * This is required by the rollup build which will otherwise barf
 * on this statement in the ts:
 *
 *    `import template from "my-view.html"' for use of `template` in the `customElement` decorator.
 *
 * One can either change that to:
 *
 *    `import template from "my-view.html?raw"`
 *
 * or use rawHtml() below to do it globally for you.
 */
const rawHtml = () => {
  const filter = rollupPluginutils.createFilter("**/*.ts", undefined);
  return {
    name: "raw",
    transform: function transform(code: string, id: string) {
      if (!filter(id)) return;
      if (code.includes("__au2ViewDef")) return;
      code = code.replaceAll(/(import .* from .*)\.html/g, "$1.html?raw");
      return { code };
    },
  };
};

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("jquery")) {
            return "jquery";
          } else if (id.includes("@aurelia")) {
            return "aurelia";
          } else if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    open: !process.env.CI,
    port: 9000,
  },
  esbuild: {
    target: "es2022",
  },
  plugins: [
    aurelia({
      hmr: true,
      /**
       * The plugin's own dev-detection reads `mode` off the user config object, where it is
       * undefined for a plain `vite build` -- so it defaults to the development export
       * condition and bundles Aurelia's dev builds (with full error message text) into
       * production. Pass the real mode explicitly instead.
       */
      useDev: mode !== "production",
    }),
    rawHtml(),
    resumeApi(),
    resumeJsonLd(),
    visualizer({
      emitFile: true,
      gzipSize: true,
      filename: "stats.html",
      /**
       * visualizer's types bind to the hoisted rollup 3 (pulled in transitively by
       * @rollup/pluginutils and @rollup/plugin-inject); Vite 7 carries its own rollup 4.
       * Same plugin shape, different type trees.
       */
    }) as PluginOption,
  ],
  resolve: {
    alias: [
      {
        // this is required for the SCSS modules
        find: /^~(.*)$/,
        replacement: "$1",
      },
    ],
  },
}));
