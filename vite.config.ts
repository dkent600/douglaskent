import aurelia from "@aurelia/vite-plugin";

import { visualizer } from "rollup-plugin-visualizer";
import * as rollupPluginutils from "rollup-pluginutils";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

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

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("jquery")) {
            return "jquery";
            // jQuery: ["jQuery"],
            // aurelia: ["@aurelia"],
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
    }),
    nodePolyfills(),
    rawHtml(),
    visualizer({
      emitFile: true,
      gzipSize: true,
      filename: "stats.html",
    }) as Plugin,
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
});
