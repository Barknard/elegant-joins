import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/**
 * GitHub Pages serves this repo from /elegant-joins/, so every asset URL needs that
 * prefix. Vite's `base` handles the bundled assets; anything referenced by a literal
 * path in HTML or CSS must be written relative (./x) rather than absolute (/x).
 *
 * Local dev and the Playwright suite serve from the root instead. That is selected with
 * `VITE_BASE=root` rather than `VITE_BASE=/`, because Git Bash on Windows rewrites a
 * bare `/` argument into a Windows path (the app ends up served from
 * /Program%20Files/Git/). A word can't be mistaken for a path.
 */
const base = process.env.VITE_BASE === "root" ? "/" : (process.env.VITE_BASE ?? "/elegant-joins/");

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    // The xlsx and flow libraries are large; splitting them keeps the initial parse
    // small so the canvas paints before the spreadsheet reader is even needed.
    rollupOptions: {
      output: {
        manualChunks: {
          xlsx: ["xlsx"],
          flow: ["@xyflow/react"],
        },
      },
    },
  },
  server: { port: 5173 },
});
