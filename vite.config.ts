import aurelia from "@aurelia/vite-plugin";

import { visualizer } from "rollup-plugin-visualizer";
import * as rollupPluginutils from "rollup-pluginutils";
import { defineConfig, type PluginOption } from "vite";

import { resumeApi } from "./resume-api-plugin";
import { resumeDocx } from "./resume-docx-plugin";
import { resumeJsonLd } from "./resume-jsonld-plugin";
import { resumeTxt } from "./resume-txt-plugin";
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
        /**
         * jQuery, Popper and the shim that publishes them as globals share a chunk, and
         * that chunk must not depend on `vendor`: `vendor` holds the jQuery plugins
         * (bootstrap-material-design, arrive) that read those globals as they evaluate,
         * and an imported chunk always runs before the body of the chunk importing it.
         */
        manualChunks: (id) => {
          if (
            id.includes("node_modules/jquery") ||
            id.includes("node_modules/popper.js") ||
            id.includes("src/jquery-global")
          ) {
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
    resumeTxt(),
    resumeDocx(),
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
