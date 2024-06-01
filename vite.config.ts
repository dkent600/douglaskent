import au2 from '@aurelia/vite-plugin';

import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, Plugin } from 'vite';
import sassGlobImports from 'vite-plugin-sass-glob-import';
import * as rollupPluginutils from "rollup-pluginutils";

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
  server: {
    port: 9000,
    strictPort: true,
  },
  esbuild: {
    target: "es2022"
  },
  build: {
    rollupOptions: {
      plugins: [nodePolyfills() as Plugin],
    },
    minify: 'terser',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    target: 'es2022',
  },
  plugins: [
    au2({hmr: true, enableConventions: true }),
    rawHtml(),
    visualizer({
      emitFile: true,
      gzipSize: true,
      filename: 'stats.html',
    }) as Plugin,
    sassGlobImports(),
  ],
  define: {
    'process.env': process.env,
  },
  // envPrefix: 'KOL',
  resolve: {
    alias:
    [
    // {
    //   find: /^stream$/,
    //   replacement: 'stream-browserify'
    // },
    // {
    //   find: /^zlib$/,
    //   replacement: 'browserify-zlib'
    // },
    // {
    //   find: /^util$/,
    //   replacement: 'util'
    // },
    // {
    //   find: /^http$/,
    //   replacement: 'http-browserify'
    // },
    // {
    //   find: /^https$/,
    //   replacement: 'https-browserify'
    // },
    // {
    //   find: /^Buffer$/,
    //   replacement: 'buffer'
    // },
    {
      // this is required for the SCSS modules
      find: /^~(.*)$/,
      replacement: '$1',
    }],
  //  {
  //   stream: 'stream-browserify',
  //   zlib: 'browserify-zlib',
  //   util: 'util',
  //   http: 'http-browserify',
  //   https: 'https-browserify',
  //   Buffer: 'buffer',
  // }
},

  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
      // Enable esbuild polyfill plugins
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
          process: false,
        }),
      ],
    },
  },
});
