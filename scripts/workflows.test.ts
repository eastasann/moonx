import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { YAML } from "bun";

// 04_deployment-procedure.md 2章 and ADR-027: a job that can mint a Google Cloud token
// (id-token: write lets every one of its steps mint one) runs no code of the repository's
// dependencies, and no Bun, since the one deploy account deploys production too. Such a
// job runs gcloud, Docker, curl and PostgreSQL's client, directly or through the
// Makefile's targets that use nothing else.

const ROOT = join(import.meta.dir, "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

/** The make targets a job that can mint a token may run, with the values to dry-run them. */
const TOKEN_TARGETS: Record<string, string[]> = {
  "push-api-image": ["SHA=0123abc", "GCP_PROJECT_ID=check"],
  "deploy-api": ["ENV=staging", "SHA=0123abc", "GCP_PROJECT_ID=check"],
  "db-backup": ["ENV=production", "GCP_PROJECT_ID=check"],
};
/** The actions such a job may use: none runs the repository's code or Bun. */
const TOKEN_ACTIONS = [
  "actions/checkout@",
  "actions/download-artifact@",
  "google-github-actions/auth@",
];
/** The commands that run JavaScript or the repository's packages. */
const PACKAGE_RUNNERS = [
  "bun",
  "bunx",
  "npm",
  "npx",
  "node",
  "pnpm",
  "yarn",
  "deno",
];
/** A command that runs JavaScript, or a file of the repository by its path. */
const RUNS_PACKAGES = new RegExp(
  `\\b(${PACKAGE_RUNNERS.join("|")})\\b|(^|[\\s"'=(])(\\.{1,2}/|(scripts|apps|packages|e2e|docker|infra|\\.github)/)`,
  "m",
);
/** The variables that change which makefile or shell make runs. */
const MAKE_CONTROLS = /^(MAKEFLAGS|MAKEFILES|MFLAGS|SHELL|\.SHELLFLAGS)=/;

interface Step {
  uses?: string;
  run?: string;
  shell?: string;
  with?: Record<string, unknown>;
}

interface Defaults {
  run?: { shell?: string };
}

interface Job {
  permissions?: Record<string, string> | string;
  concurrency?: unknown;
  defaults?: Defaults;
  steps?: Step[];
}

interface Workflow {
  permissions?: Record<string, string> | string;
  concurrency?: unknown;
  defaults?: Defaults;
  jobs?: Record<string, Job>;
}

const workflows = readdirSync(WORKFLOWS)
  .filter((file) => file.endsWith(".yml"))
  .sort()
  .map((file) => ({
    file,
    workflow: YAML.parse(
      readFileSync(join(WORKFLOWS, file), "utf8"),
    ) as Workflow,
  }));

const canMintToken = (permissions: Job["permissions"]) =>
  permissions === "write-all" ||
  (typeof permissions === "object" && permissions["id-token"] === "write");

/** Every job whose steps can mint a Google Cloud token, named `<file>:<job>`. */
const tokenJobs = workflows.flatMap(({ file, workflow }) =>
  Object.entries(workflow.jobs ?? {})
    .filter(([, job]) => canMintToken(job.permissions ?? workflow.permissions))
    .map(([key, job]) => ({ name: `${file}:${key}`, job, workflow })),
);

/**
 * Each `make` of a script with the words before and after it in its command: continued
 * lines joined, commands split at the shell's separators and opened subshells and
 * substitutions, quotes dropped.
 */
function makeCalls(script: string): { before: string[]; after: string[] }[] {
  return script
    .replace(/\\\n/g, " ")
    .split(/\n|;|&&|\|\||\||\$\(|\(|\)|`/)
    .flatMap((command) => {
      const words = command
        .trim()
        .split(/\s+/)
        .map((word) => word.replace(/["']/g, ""));
      const at = words.findIndex((word) => /(^|\/)make$/.test(word));
      return at === -1
        ? []
        : [{ before: words.slice(0, at), after: words.slice(at + 1) }];
    });
}

test("the jobs that can mint a Google Cloud token are the ones 04 2章 names", () => {
  expect(tokenJobs.map(({ name }) => name)).toEqual([
    "build.yml:push",
    "db-backup.yml:backup",
    "deploy.yml:image",
    "deploy.yml:deploy",
  ]);
});

test.each(
  tokenJobs.map(({ name, job, workflow }) => [name, job, workflow] as const),
)("%s runs no Bun and none of the dependencies' code", (_, job, workflow) => {
  // Every run: script goes through bash, not a shell of the job's choosing.
  for (const shell of [
    workflow.defaults?.run?.shell,
    job.defaults?.run?.shell,
    ...(job.steps ?? []).map((step) => step.shell),
  ]) {
    expect([undefined, "bash"]).toContain(shell);
  }
  for (const step of job.steps ?? []) {
    if (step.uses !== undefined) {
      expect(
        TOKEN_ACTIONS.some((action) => step.uses?.startsWith(action)),
      ).toBe(true);
    }
    const script = step.run ?? "";
    expect(script).not.toMatch(RUNS_PACKAGES);
    for (const { before, after: words } of makeCalls(script)) {
      // make alone: no assignment in front of it, which its environment would carry.
      expect(before).toEqual([]);
      // A target, or VAR=value: no options (-C, --file) that would move make elsewhere,
      // and no variable that picks another makefile or shell.
      for (const word of words) expect(word).not.toMatch(MAKE_CONTROLS);
      const targets = words.filter(
        (word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word),
      );
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(Object.keys(TOKEN_TARGETS)).toContain(target);
      }
    }
  }
});

test.each(Object.entries(TOKEN_TARGETS))(
  "make %s runs no Bun and none of the dependencies' code",
  (target, values) => {
    // A dry run prints every command, those of the targets it makes in turn included,
    // and runs what $(shell ...) asks for while reading the recipes: stand-ins that log
    // their names catch that, since the printed commands no longer show it.
    const bin = mkdtempSync(join(tmpdir(), "moonx-workflows-"));
    const log = join(bin, "ran");
    try {
      for (const name of PACKAGE_RUNNERS) {
        writeFileSync(join(bin, name), `#!/bin/sh\necho ${name} >> '${log}'\n`);
        chmodSync(join(bin, name), 0o755);
      }
      const dryRun = Bun.spawnSync(
        ["make", "--dry-run", "--no-print-directory", target, ...values],
        {
          cwd: ROOT,
          env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(dryRun.stderr.toString()).toBe("");
      expect(dryRun.exitCode).toBe(0);
      const commands = dryRun.stdout.toString();
      expect(commands).not.toBe("");
      expect(commands).not.toMatch(RUNS_PACKAGES);
      expect(existsSync(log) ? readFileSync(log, "utf8") : "").toBe("");
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  },
);

test("deploy.yml takes Bun from its release, never from the Actions cache", () => {
  const deploy = workflows.find(({ file }) => file === "deploy.yml")?.workflow;
  const steps = Object.values(deploy?.jobs ?? {})
    .flatMap((job) => job.steps ?? [])
    .filter((step) => step.uses?.startsWith("oven-sh/setup-bun@"));
  expect(steps.length).toBeGreaterThan(0);
  for (const step of steps) expect(step.with?.["no-cache"]).toBe(true);
});

test("promote-check runs Bun's and Node's built-ins alone, and never installs", () => {
  const imports = new Bun.Transpiler({ loader: "ts" })
    .scanImports(
      readFileSync(join(ROOT, "scripts", "promote-check.ts"), "utf8"),
    )
    .map(({ path }) => path);
  for (const path of imports) {
    expect(path).toMatch(/^(bun(:.+)?|node:.+)$/);
  }
  // It runs before make install (ci.yml) and in deploy.yml's check job, which installs
  // nothing: without node_modules Bun would fetch an import it cannot resolve.
  expect(readFileSync(join(ROOT, "Makefile"), "utf8")).toContain(
    "\tbun --no-install scripts/promote-check.ts $(BASE)\n",
  );
});

// make lint tells actionlint to ignore the queue key, which it does not know
// (ADR-022), so no workflow's queue goes unchecked: deploy.yml's own concurrency is
// held whole by scripts/promote.test.ts, and every queue anywhere must be max.
test("every concurrency's keys are known, and its queue is max", () => {
  const concurrencies = workflows.flatMap(({ file, workflow }) => [
    { where: file, concurrency: workflow.concurrency },
    ...Object.entries(workflow.jobs ?? {}).map(([key, job]) => ({
      where: `${file}:${key}`,
      concurrency: job.concurrency,
    })),
  ]);
  for (const { where, concurrency } of concurrencies) {
    if (typeof concurrency !== "object" || concurrency === null) continue;
    for (const key of Object.keys(concurrency)) {
      expect([where, key]).toEqual([
        where,
        expect.stringMatching(/^(group|cancel-in-progress|queue)$/),
      ]);
    }
    if ("queue" in concurrency) {
      expect([where, concurrency.queue]).toEqual([where, "max"]);
    }
  }
});
