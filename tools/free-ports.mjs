/**
 * Frees the ports the e2e servers use, before Playwright tries to bind them.
 *
 * The suite deliberately sets `reuseExistingServer: false` — reusing whatever already
 * answers on the port is how a whole run once went green against a stale bundle. The
 * cost of that correctness is that ANY orphaned preview server (a killed run, a crashed
 * worker, a background job that outlived its shell) blocks the next run with
 * "http://127.0.0.1:4173 is already used" until someone hunts down the process.
 *
 * That happened repeatedly and was cleaned up by hand every time, which is precisely the
 * sort of manual chore that should be code. Runs automatically via the `pretest` script.
 *
 * Uses execFileSync with argument arrays throughout — no shell. PIDs here are parsed out
 * of another program's output, and interpolating those into a shell string is how a
 * malformed parse turns into arbitrary command execution.
 */
import { execFileSync } from "node:child_process";

const PORTS = [4173, 4174];
const isWindows = process.platform === "win32";

function run(file, args) {
  try {
    return execFileSync(file, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // Both netstat and lsof exit non-zero when they match nothing.
    return "";
  }
}

/** PIDs listening on a port. Only ever returns strings of digits. */
function listenersOn(port) {
  const pids = new Set();

  if (isWindows) {
    // Filter in JS rather than piping through findstr, so no shell is needed.
    for (const line of run("netstat", ["-ano", "-p", "tcp"]).split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const cols = line.trim().split(/\s+/);
      const local = cols[1] ?? "";
      if (!local.endsWith(`:${port}`)) continue;
      const pid = cols[cols.length - 1];
      if (/^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
  } else {
    for (const pid of run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]).split(/\s+/)) {
      if (/^\d+$/.test(pid)) pids.add(pid);
    }
  }

  return [...pids];
}

let freed = 0;
for (const port of PORTS) {
  for (const pid of listenersOn(port)) {
    try {
      if (isWindows) execFileSync("taskkill", ["/PID", pid, "/F"], { stdio: "ignore" });
      else execFileSync("kill", ["-9", pid], { stdio: "ignore" });
      console.log(`freed port ${port} (pid ${pid})`);
      freed++;
    } catch {
      // Not ours to kill, or already gone. Playwright will report the real problem.
      console.warn(`could not free port ${port} (pid ${pid}) — continuing`);
    }
  }
}

if (freed === 0) console.log(`ports ${PORTS.join(", ")} already free`);
