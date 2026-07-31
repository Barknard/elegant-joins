import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

/**
 * Register the offline shell.
 *
 * `import.meta.env.BASE_URL` is /elegant-joins/ on GitHub Pages and / in dev. It also
 * sets the worker's scope — a worker registered at the base can only control pages
 * beneath it, which is exactly the boundary we want.
 *
 * Skipped in dev: a caching worker sitting in front of Vite's HMR makes edits look like
 * they aren't taking effect, which is a miserable thing to debug.
 */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((err) => console.warn("Service worker registration failed:", err));
  });
}
