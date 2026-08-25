import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginLess } from "@rsbuild/plugin-less";

// https://rsbuild.dev/guide/basic/configure-rsbuild
export default defineConfig({
  plugins: [pluginReact(), pluginLess()],
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  html: {
    favicon: "src/assets/favicon.svg",
    title: "Sesame Admin",
    meta: {
      robots: "noindex, nofollow",
    },
    template: "src/template.html",
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5150",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
