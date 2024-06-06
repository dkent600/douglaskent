import aurelia from "@aurelia/vite-plugin";

import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
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
