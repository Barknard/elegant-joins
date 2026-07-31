/**
 * Stages the Pages build the way GitHub actually serves it.
 *
 * The deployed site lives at /elegant-joins/, not at the root. The main e2e suite runs
 * at the root, so it structurally cannot catch anything that depends on the base path —
 * and the first deploy shipped a client-side router that never matched /elegant-joins/,
 * showing every visitor a 404 page while every test was green.
 *
 * Copying dist into <staging>/elegant-joins/ and serving <staging> at the root
 * reproduces the real URL shape with a plain static server.
 *
 * Run after the Pages build:  node tools/stage-pages-preview.mjs dist-pages
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const staging = join(root, ".pages-preview");
const target = join(staging, "elegant-joins");

rmSync(staging, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
// Source dir comes in as an argument: `cross-env` only sets env for the command
// it wraps, so a VITE_OUT read here would be undefined in a `&&` chain and we
// would silently stage the root-base build instead.
const source = process.argv[2] ?? "dist";
cpSync(join(root, source), target, { recursive: true });

console.log(`staged ${source} -> ${target} (serve .pages-preview at the root)`);
