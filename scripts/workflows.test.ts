import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { YAML } from "bun";

// 04_deployment-procedure.md 2章 and ADR-027: a job that can mint a Google Cloud token
// (id-token: write lets every one of its steps mint one) runs no code of the repository's
// dependencies, and no Bun, since the one deploy account deploys production too. Such a
// job runs gcloud, Docker, curl, Git, awk and PostgreSQL's client, directly or through the
// Makefile's targets that use nothing else; the SHA's dependencies run only in the
// container of make deploy-migrate, which gets nothing that mints a token.

const ROOT = join(import.meta.dir, "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

/** The make targets a job that can mint a token may run, with the values to dry-run them. */
const TOKEN_TARGETS: Record<string, string[]> = {
  "push-api-image": ["SHA=0123abc", "GCP_PROJECT_ID=check"],
  "deploy-api": ["ENV=staging", "SHA=0123abc", "GCP_PROJECT_ID=check"],
  "deploy-record": [
    "ENV=production",
    `SHA=${"0".repeat(40)}`,
    `WRITE=${"1".repeat(40)}`,
    "KIND=migrating",
    "GCP_PROJECT_ID=check",
  ],
  "db-backup": ["ENV=production", "GCP_PROJECT_ID=check"],
  "deploy-migrate": ["SOURCE=/checkout", `SHA=${"0".repeat(40)}`],
};
/**
 * Where make deploy-migrate's command hands over to its container: the image and the
 * SHA's make install and make db-migrate after it run there, not on the runner (the
 * deploy-migrate tests below hold what the container gets).
 */
const CONTAINER_COMMAND = '"$image" sh -c';
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
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  shell?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  "working-directory"?: string;
  "continue-on-error"?: unknown;
}

interface Defaults {
  run?: { shell?: string; "working-directory"?: string };
}

interface Job {
  env?: Record<string, string>;
  needs?: string | string[];
  if?: string;
  environment?: unknown;
  permissions?: Record<string, string> | string;
  concurrency?: unknown;
  defaults?: Defaults;
  steps?: Step[];
  "continue-on-error"?: unknown;
}

interface Workflow {
  env?: Record<string, string>;
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
  // make finds its Makefile in the folder a step runs in: only a checkout of this
  // repository, at the commit the workflow runs for, may be that folder, and it must come
  // before the step.
  expect(workflow.defaults?.run?.["working-directory"]).toBeUndefined();
  expect(job.defaults?.run?.["working-directory"]).toBeUndefined();
  const steps = job.steps ?? [];
  steps.forEach((step, index) => {
    const folder = step["working-directory"];
    if (folder === undefined) return;
    expect(
      steps
        .slice(0, index)
        .some(
          (earlier) =>
            earlier.uses?.startsWith("actions/checkout@") &&
            earlier.with?.path === folder &&
            earlier.with?.ref === undefined &&
            earlier.with?.repository === undefined,
        ),
    ).toBe(true);
  });
  for (const step of steps) {
    if (step.uses !== undefined) {
      expect(
        TOKEN_ACTIONS.some((action) => step.uses?.startsWith(action)),
      ).toBe(true);
      // Named, though the list above already leaves them out: no Bun and no cache of the
      // dependencies (or of a Bun that their code could have replaced) on the runner.
      expect(step.uses).not.toMatch(
        /^(oven-sh\/setup-bun|actions\/cache|actions\/setup-node)@/,
      );
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
      expect(targets).not.toContain("install");
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
      const printed = dryRun.stdout.toString();
      expect(printed).not.toBe("");
      // deploy-migrate's container runs the SHA's make install: only what comes before it
      // runs on the runner, where the name of Bun's image is what Docker pulls, not a
      // command.
      const handover = printed.indexOf(CONTAINER_COMMAND);
      if (target === "deploy-migrate") expect(handover).toBeGreaterThan(0);
      else expect(handover).toBe(-1);
      // What follows is the container's command alone: one single-quoted word that ends
      // the recipe, so nothing after it runs on the runner.
      if (handover !== -1) {
        expect(printed.slice(handover + CONTAINER_COMMAND.length)).toMatch(
          /^ \\\n\s*'[^']*'\n$/,
        );
      }
      const commands = (
        handover === -1 ? printed : printed.slice(0, handover)
      ).replaceAll("oven/bun:", "oven/image:");
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

// ci.yml uploads what a failed make test-e2e leaves, traces included (04 2章): that holds
// no secret only while the workflow passes its steps no secret, variable or token of the
// repository, and its checkout keeps none of the default token it fetches with.
test("ci.yml names no secret, variable or token, and its checkout keeps none", () => {
  const ci = workflows.find(({ file }) => file === "ci.yml")?.workflow;
  expect(ci).toBeDefined();
  expect(JSON.stringify(ci)).not.toMatch(/\b(secrets|vars)\b|github\.token/);
  const checkouts = Object.values(ci?.jobs ?? {})
    .flatMap((job) => job.steps ?? [])
    .filter((step) => step.uses?.startsWith("actions/checkout@"));
  expect(checkouts.length).toBeGreaterThan(0);
  for (const step of checkouts) {
    expect(step.with?.["persist-credentials"]).toBe(false);
  }
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
// held whole by the deploy.yml test below, and every queue anywhere must be max.
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

const DEPLOY = workflows.find(({ file }) => file === "deploy.yml")?.workflow;
// biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression
const TARGET = "${{ needs.check.outputs.target }}";
const CURRENT = "steps.current.outputs.current == 'true'";
const runsMake = (step: Step, target: string) =>
  makeCalls(step.run ?? "").some(({ after }) => after.includes(target));
const records = (step: Step, kind: string) =>
  new RegExp(
    `^make deploy-record ENV="\\$TARGET" SHA="\\$SHA" WRITE="\\$GITHUB_SHA" KIND=${kind}$`,
  ).test(step.run?.trim() ?? "");

// 04_deployment-procedure.md 2章「production の承認」: GitHub asks for an approval per job
// that uses the environment, so one job does: a production promotion is approved once,
// and a re-run of that job waits for the approval again.
test("deploy.yml deploys in one job of the environment, after the checks, one at a time", () => {
  const jobs = Object.entries(DEPLOY?.jobs ?? {});
  expect(
    jobs.filter(([, job]) => job.environment !== undefined).map(([key]) => key),
  ).toEqual(["deploy"]);
  const deploy = DEPLOY?.jobs?.deploy;
  expect(deploy?.environment).toBe(TARGET);
  // The image check comes before the approval; nothing lets the job start without it.
  expect([deploy?.needs ?? []].flat()).toEqual(
    expect.arrayContaining(["check", "image"]),
  );
  expect(deploy?.if).toBeUndefined();
  // actionlint is told to ignore queue:, which it does not know (ADR-022).
  expect(deploy?.concurrency).toEqual({
    group: `deploy-${TARGET}`,
    queue: "max",
  });
  for (const [, job] of jobs) {
    expect(job["continue-on-error"]).toBeUndefined();
    for (const step of job.steps ?? []) {
      expect(step["continue-on-error"]).toBeUndefined();
    }
  }
  // Only the deploy job migrates, deploys and records.
  for (const [key, job] of jobs) {
    if (key === "deploy") continue;
    for (const step of job.steps ?? []) {
      for (const target of [
        "deploy-record",
        "deploy-migrate",
        "db-migrate",
        "deploy-api",
      ]) {
        expect([key, runsMake(step, target)]).toEqual([key, false]);
      }
    }
  }
});

// ADR-016 and 04 2章「デプロイの記録」: after the approval and the reading of main, the
// migrating record, the migrations, the deployment, its check and the deployed record, each
// only once the one before it succeeded.
test("deploy.yml's deploy job records the migrations right before they start, and the deployment last", () => {
  const steps = DEPLOY?.jobs?.deploy?.steps ?? [];
  const at = (test: (step: Step) => boolean) => {
    const found = steps.filter(test);
    expect(found).toHaveLength(1);
    return steps.indexOf(found[0] as Step);
  };
  const current = at((step) => step.id === "current");
  const sha = at(
    (step) =>
      step.uses?.startsWith("actions/checkout@") === true &&
      step.with?.path === undefined,
  );
  const own = at(
    (step) =>
      step.uses?.startsWith("actions/checkout@") === true &&
      step.with?.path === "write",
  );
  const auth = at(
    (step) => step.uses?.startsWith("google-github-actions/auth@") === true,
  );
  const migrating = at((step) => records(step, "migrating"));
  const migrate = at((step) => runsMake(step, "deploy-migrate"));
  const deploy = at((step) => runsMake(step, "deploy-api"));
  const check = at((step) => step.name === "Check the deployment");
  const deployed = at((step) => records(step, "deployed"));

  expect(current).toBe(0);
  // The SHA's checkout at the top cleans its folder, write/ included, so this commit's
  // own checkout comes after it; the credentials file of the auth step after both.
  expect(sha).toBeLessThan(own);
  expect(own).toBeLessThan(auth);
  expect([auth, migrating, migrate, deploy, check, deployed]).toEqual([
    auth,
    auth + 1,
    auth + 2,
    auth + 3,
    auth + 4,
    auth + 5,
  ]);
  // The last step, so the job succeeds only with the deployed record.
  expect(deployed).toBe(steps.length - 1);
  // A later promotion on main skips everything after the reading of main.
  for (const step of steps.slice(current + 1)) expect(step.if).toBe(CURRENT);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression
  expect(steps[sha]?.with?.ref).toBe("${{ env.SHA }}");
  // The records and the migrations' container come from this commit's Makefile, never the
  // SHA's, which may be an older version: the checkout with no ref:.
  for (const index of [migrating, migrate, deployed]) {
    expect(steps[index]?.["working-directory"]).toBe("write");
  }
  expect(steps[own]?.with?.ref).toBeUndefined();
  expect(steps[migrate]?.run?.trim()).toBe(
    'make deploy-migrate SOURCE="$GITHUB_WORKSPACE" SHA="$SHA"',
  );
  // The environment's secret reaches the migrations' step alone: none in the workflow's or
  // the job's env, which every step gets, in any form (secrets.NAME, secrets['NAME'],
  // toJSON(secrets)).
  for (const env of [DEPLOY?.env, DEPLOY?.jobs?.deploy?.env]) {
    expect(JSON.stringify(env ?? {})).not.toMatch(/\bsecrets\b/);
  }
  steps.forEach((step, index) => {
    const secrets = JSON.stringify(step).match(/\bsecrets\b/g) ?? [];
    expect([index, secrets.length]).toEqual([index, index === migrate ? 1 : 0]);
  });
  expect(steps[migrate]?.env).toEqual({
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression
    DATABASE_URL_DIRECT: "${{ secrets.DATABASE_URL_DIRECT }}",
  });
});

describe("make deploy-migrate", () => {
  const PINNED = `oven/bun:1.4.2-slim@sha256:${"ab".repeat(32)}`;
  const SECRETS = {
    DATABASE_URL_DIRECT: "postgres://owner:db-secret@db.example/moonx",
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.example/mint?audience=x",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc-request-secret",
    ACTIONS_RUNTIME_TOKEN: "runtime-secret",
    GITHUB_TOKEN: "github-secret",
  };

  /**
   * Runs make deploy-migrate on a checkout of one commit, with google-github-actions/auth's
   * credentials file beside it and its variables set, and a fake docker that keeps what
   * it was given. Run from an empty folder, so no .env is read.
   */
  function run(dockerfile: string, sha?: string, env = SECRETS) {
    const dir = mkdtempSync(join(tmpdir(), "moonx-deploy-migrate-"));
    const checkout = join(dir, "checkout");
    const bin = join(dir, "bin");
    const kept = join(dir, "kept");
    try {
      for (const path of [checkout, bin, kept, join(checkout, "apps", "api")]) {
        mkdirSync(path, { recursive: true });
      }
      const git = (...args: string[]) => {
        const result = Bun.spawnSync(["git", ...args], {
          cwd: checkout,
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(result.exitCode).toBe(0);
        return result.stdout.toString().trim();
      };
      writeFileSync(join(checkout, "apps", "api", "Dockerfile"), dockerfile);
      writeFileSync(join(checkout, "Makefile"), "install:\n\ttrue\n");
      git("init", "--quiet");
      git("add", ".");
      git(
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "commit",
        "--quiet",
        "-m",
        "c",
      );
      const commit = git("rev-parse", "HEAD");
      // What the job's folder holds besides the commit: the credentials file, and a change
      // to a committed file.
      const credentials = join(checkout, "gha-creds-0123456789abcdef.json");
      writeFileSync(credentials, '{"type":"external_account"}');
      writeFileSync(join(checkout, "Makefile"), "install:\n\tchanged\n");
      writeFileSync(
        join(bin, "docker"),
        `#!/bin/sh\nfor arg in "$@"; do printf '%s\\n' "$arg"; done > '${kept}/argv'\ncat > '${kept}/stdin.tar'\n`,
      );
      chmodSync(join(bin, "docker"), 0o755);
      // Nothing of the runner's may run JavaScript: the container's command is docker's.
      for (const name of PACKAGE_RUNNERS) {
        writeFileSync(
          join(bin, name),
          `#!/bin/sh\necho ${name} >> '${kept}/ran'\n`,
        );
        chmodSync(join(bin, name), 0o755);
      }
      const result = Bun.spawnSync(
        [
          "make",
          "--no-print-directory",
          "-f",
          join(ROOT, "Makefile"),
          "deploy-migrate",
          `SOURCE=${checkout}`,
          `SHA=${sha ?? commit}`,
        ],
        {
          cwd: dir,
          env: {
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            HOME: dir,
            ...env,
            GOOGLE_APPLICATION_CREDENTIALS: credentials,
            CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: credentials,
            GOOGLE_GHA_CREDS_PATH: credentials,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const argv = existsSync(join(kept, "argv"))
        ? readFileSync(join(kept, "argv"), "utf8").split("\n").slice(0, -1)
        : undefined;
      const files = existsSync(join(kept, "stdin.tar"))
        ? Bun.spawnSync(["tar", "-t", "-f", join(kept, "stdin.tar")])
            .stdout.toString()
            .split("\n")
            .filter((line) => line !== "" && !line.endsWith("/"))
            .sort()
        : undefined;
      const makefile = existsSync(join(kept, "stdin.tar"))
        ? Bun.spawnSync([
            "tar",
            "-x",
            "-O",
            "-f",
            join(kept, "stdin.tar"),
            "Makefile",
          ]).stdout.toString()
        : undefined;
      return {
        exitCode: result.exitCode,
        stderr: result.stderr.toString(),
        ran: existsSync(join(kept, "ran"))
          ? readFileSync(join(kept, "ran"), "utf8")
          : "",
        argv,
        files,
        makefile,
        credentials,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("gives the container DATABASE_URL_DIRECT by name and the commit's files, nothing of the job", () => {
    const result = run(
      `# the API image\nFROM ${PINNED} AS dependencies\nRUN true\nFROM oven/bun:9.9.9-slim@sha256:${"cd".repeat(32)}\n`,
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    const [script, ...rest] = (result.argv ?? []).slice(8);
    // No --volume, --mount, --env-file, --network or --privileged: the variable is the one
    // thing of the job's the container gets, and only its name is on the command line.
    expect(result.argv?.slice(0, 8)).toEqual([
      "run",
      "--rm",
      "--interactive",
      "--env",
      "DATABASE_URL_DIRECT",
      PINNED,
      "sh",
      "-c",
    ]);
    expect(rest).toEqual([]);
    expect(result.ran).toBe("");
    // The SHA's own targets, in that order, inside the container; the database's address
    // is kept from apt and the dependencies' install.
    expect(script).toMatch(
      /env -u DATABASE_URL_DIRECT sh -c "[^"]*&& make install"; cd \/work; make db-migrate$/,
    );
    for (const value of [...Object.values(SECRETS), result.credentials]) {
      expect(result.argv?.join("\n")).not.toContain(value);
    }
    // The commit's files: not the credentials file beside them, not the folder's changes.
    expect(result.files).toEqual(["Makefile", "apps/api/Dockerfile"]);
    expect(result.makefile).toBe("install:\n\ttrue\n");
  });

  test.each([
    ["a Bun image without a digest", "FROM oven/bun:1.4.2-slim\n"],
    ["another image", `FROM node:24@sha256:${"ab".repeat(32)}\n`],
    ["no FROM", "RUN true\n"],
  ])(
    "stops before Docker when the Dockerfile starts from %s",
    (_, dockerfile) => {
      const result = run(dockerfile);
      expect(result.exitCode).not.toBe(0);
      expect(result.argv).toBeUndefined();
    },
  );

  test("stops before Docker without a full SHA, running nothing in it", () => {
    const marker = join(mkdtempSync(join(tmpdir(), "moonx-sha-")), "ran");
    try {
      // A backtick and $$ reach the shell through make, unlike a bare $(...).
      for (const sha of [
        "HEAD",
        `\`touch ${marker}\``,
        `$$(touch ${marker})`,
      ]) {
        const result = run(`FROM ${PINNED}\n`, sha);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("SHA must be a full commit SHA");
        expect(result.argv).toBeUndefined();
      }
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dirname(marker), { recursive: true, force: true });
    }
  });

  test("stops before Docker without DATABASE_URL_DIRECT", () => {
    const result = run(`FROM ${PINNED}\n`, undefined, {
      ...SECRETS,
      DATABASE_URL_DIRECT: "",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("DATABASE_URL_DIRECT is required");
    expect(result.argv).toBeUndefined();
  });
});
// ADR-016: a SHA's image is pushed once. A re-run of build.yml's push job finds the tag in
// Artifact Registry and pushes nothing, so the image make promote finds is the one the
// first run built and tested.
describe("make push-api-image", () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567";
  // The wrapper below must not find itself on PATH.
  const CURL = Bun.which("curl") ?? "";
  const TOKEN = "push-check-token";
  let status = 404;
  const requests: { path: string; authorization: string | null }[] = [];
  const registry = Bun.serve({
    port: 0,
    fetch(request) {
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get("authorization"),
      });
      return Response.json({}, { status });
    },
  });

  /** Spawned without blocking: the fake Artifact Registry answers in this process. */
  async function push(sha = SHA) {
    expect(CURL).not.toBe("");
    const dir = mkdtempSync(join(tmpdir(), "moonx-push-"));
    const bin = join(dir, "bin");
    try {
      mkdirSync(bin);
      writeFileSync(
        join(bin, "gcloud"),
        `#!/bin/sh\necho "gcloud $*" >> '${dir}/calls'\n[ "$1 $2" = "auth print-access-token" ] && echo ${TOKEN}\nexit 0\n`,
      );
      writeFileSync(
        join(bin, "docker"),
        `#!/bin/sh\necho "docker $*" >> '${dir}/calls'\n`,
      );
      for (const name of PACKAGE_RUNNERS) {
        writeFileSync(
          join(bin, name),
          `#!/bin/sh\necho "${name}" >> '${dir}/calls'\n`,
        );
      }
      // The real curl, after keeping its arguments, which every user of the machine can read.
      writeFileSync(
        join(bin, "curl"),
        `#!/bin/sh\nprintf '%s\\n' "$@" >> '${dir}/curl'\nexec '${CURL}' "$@"\n`,
      );
      for (const name of ["gcloud", "docker", "curl", ...PACKAGE_RUNNERS]) {
        chmodSync(join(bin, name), 0o755);
      }
      const child = Bun.spawn(
        [
          "make",
          "--no-print-directory",
          "-f",
          join(ROOT, "Makefile"),
          "push-api-image",
          `SHA=${sha}`,
          "GCP_PROJECT_ID=moonx-test",
          `ARTIFACT_REGISTRY_URL=${registry.url.origin}`,
        ],
        {
          cwd: dir,
          env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: dir },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const calls = existsSync(join(dir, "calls"))
        ? readFileSync(join(dir, "calls"), "utf8").split("\n").slice(0, -1)
        : [];
      const curl = existsSync(join(dir, "curl"))
        ? readFileSync(join(dir, "curl"), "utf8")
        : undefined;
      return { exitCode, stdout, stderr, calls, curl };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("pushes when Artifact Registry has no tag for the SHA, asking with the token in a header", async () => {
    status = 404;
    requests.length = 0;
    const result = await push();
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([
      {
        path: `/v1/projects/moonx-test/locations/asia-southeast1/repositories/moonx/packages/api/tags/${SHA}`,
        authorization: `Bearer ${TOKEN}`,
      },
    ]);
    const image = `asia-southeast1-docker.pkg.dev/moonx-test/moonx/api:${SHA}`;
    expect(result.calls).toEqual([
      "gcloud auth print-access-token",
      "docker load --input=.data/api-image.tar",
      `docker tag moonx-api:${SHA} ${image}`,
      "gcloud auth configure-docker asia-southeast1-docker.pkg.dev --quiet",
      `docker push ${image}`,
    ]);
    expect(result.curl).toBeDefined();
    expect(result.curl).not.toContain(TOKEN);
    expect(result.stdout).not.toContain(TOKEN);
  });

  test.each([
    [200, "is in Artifact Registry already"],
    [403, "Artifact Registry answered 403"],
    [500, "Artifact Registry answered 500"],
  ])(
    "pushes nothing when Artifact Registry answers %i",
    async (answer, message) => {
      status = answer;
      const result = await push();
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(message);
      expect(result.calls).toEqual(["gcloud auth print-access-token"]);
    },
  );

  test("asks nothing and pushes nothing without a full SHA, running nothing in it", async () => {
    status = 404;
    requests.length = 0;
    const marker = join(mkdtempSync(join(tmpdir(), "moonx-push-sha-")), "ran");
    try {
      for (const sha of [
        "HEAD",
        `\`touch ${marker}\``,
        `$$(touch ${marker})`,
      ]) {
        const result = await push(sha);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("SHA must be a full commit SHA");
        expect(result.calls).toEqual([]);
      }
      expect(requests).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dirname(marker), { recursive: true, force: true });
    }
  });
});
