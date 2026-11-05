import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { YAML } from "bun";

// Each test runs promote, which spawns git dozens of times: slow runners need more than 5 s.
setDefaultTimeout(30_000);

const STAGING = "deploy/staging/version";
const PRODUCTION = "deploy/production/version";
const MIGRATIONS = "packages/db/migrations";
const PROJECT = "moonx-test";
const IMAGE = `asia-southeast1-docker.pkg.dev/${PROJECT}/moonx/api`;
const RECORDS = `gs://${PROJECT}-moonx-deploys`;
const TOKEN = "record-check-token";
const PR_URL = "https://github.com/example/moonx/pull/42";
const UNDEPLOYED_NOTE = (file: string) =>
  `この PR の \`deploy.yml\` が検査で止まった・承認されなかった・失敗したときは、\`${file}\` が出ていない版を指したままになる。正しい SHA で新しい昇格の PR を出して直す（\`make promote\`。04_deployment-procedure.md 2章）。`;
const ROLLBACK_REASON =
  "<!-- 戻す理由と、出す版が直前の版でないときは 5.1 の 3 で確かめた結果を書く（04_deployment-procedure.md 5.1 の 4） -->";

// gh and gcloud stand-ins: each logs its argv to calls.log and answers from the files the
// test writes under $FAKE_DIR. gh answers only what promote asks about pull requests; any
// other call (a workflow run's record among them) is a regression.
const FAKE_GH = `#!/usr/bin/env bash
{ printf 'gh'; printf '\\t%s' "$@"; printf '\\n'; } >> "$FAKE_DIR/calls.log"
# Real gh colours and indents its JSON when these force a terminal.
if [ "\${CLICOLOR_FORCE-}" = 1 ] || [ -n "\${GH_FORCE_TTY+set}" ]; then
  echo "fake gh: coloured output forced" >&2; exit 3
fi
option() {
  local name=$1 previous= arg
  shift
  for arg in "$@"; do
    case "$arg" in "$name="*) printf '%s' "\${arg#"$name="}"; return ;; esac
    if [ "$previous" = "$name" ]; then printf '%s' "$arg"; return; fi
    previous=$arg
  done
}
case "$1 $2" in
"pr list")
  head=$(option --head "$@")
  file="$FAKE_DIR/gh/pr-list-\${head//\\//_}.json"
  if [ -f "$file" ]; then cat "$file"; else echo '[]'; fi ;;
"pr create")
  if [ -f "$FAKE_DIR/gh/pr-create-fails" ]; then echo "GraphQL: could not create" >&2; exit 1; fi
  option --title "$@" > "$FAKE_DIR/pr-title"
  cp "$(option --body-file "$@")" "$FAKE_DIR/pr-body"
  echo "${PR_URL}" ;;
*)
  echo "fake gh: unexpected $*" >&2; exit 2 ;;
esac
`;

// The records' listing answers from gcloud/records-<env>, one object name per line, or
// fails with gcloud/records-<env>.stderr. A prefix with no object lists nothing and
// succeeds, as gcloud storage objects list does.
const FAKE_GCLOUD = `#!/usr/bin/env bash
{ printf 'gcloud'; printf '\\t%s' "$@"; printf '\\n'; } >> "$FAKE_DIR/calls.log"
if [ "$*" = "auth print-access-token" ]; then
  echo ${TOKEN}; exit 0
elif [ "$1 $2 $3 $4" = "artifacts docker images describe" ]; then
  if [ -f "$FAKE_DIR/gcloud/image-\${5##*:}" ]; then echo "sha256:0123"; exit 0; fi
  echo "ERROR: (gcloud.artifacts.docker.images.describe) Image not found: $5" >&2; exit 1
elif [ "$1 $2 $3" = "storage objects list" ]; then
  case "$#:$4 $5 $6" in
  "6:${RECORDS}/staging/** --exhaustive --format=value(name)") env=staging ;;
  "6:${RECORDS}/production/** --exhaustive --format=value(name)") env=production ;;
  *) echo "fake gcloud: unexpected $*" >&2; exit 2 ;;
  esac
  if [ -f "$FAKE_DIR/gcloud/records-$env.stderr" ]; then cat "$FAKE_DIR/gcloud/records-$env.stderr" >&2; exit 1; fi
  if [ -f "$FAKE_DIR/gcloud/records-$env" ]; then cat "$FAKE_DIR/gcloud/records-$env"; fi
  exit 0
elif [ "$1 $2 $3" = "run services describe" ]; then
  if [ -f "$FAKE_DIR/gcloud/service-$4.json" ]; then cat "$FAKE_DIR/gcloud/service-$4.json"; exit 0; fi
  if [ -f "$FAKE_DIR/gcloud/service-$4.stderr" ]; then cat "$FAKE_DIR/gcloud/service-$4.stderr" >&2; exit 1; fi
  echo "ERROR: (gcloud.run.services.describe) Cannot find service [$4]" >&2; exit 1
elif [ "$1 $2 $3" = "run revisions describe" ]; then
  if [ -f "$FAKE_DIR/gcloud/revision-$4" ]; then cat "$FAKE_DIR/gcloud/revision-$4"; exit 0; fi
  echo "ERROR: (gcloud.run.revisions.describe) Cannot find revision [$4]" >&2; exit 1
fi
echo "fake gcloud: unexpected $*" >&2; exit 2
`;

// One folder per test: the bare origin, the developer's clone, the fakes and their answers,
// and an empty HOME so no global Git configuration applies.
let root: string;
let work: string;
let origin: string;
let fake: string;

const env = () => ({
  PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
  HOME: join(root, "home"),
  TMPDIR: join(root, "tmp"),
  GIT_CONFIG_NOSYSTEM: "1",
  FAKE_DIR: fake,
});

function use(folder: string) {
  root = folder;
  work = join(root, "work");
  origin = join(root, "origin.git");
  fake = join(root, "fake");
}

function spawnIn(dir: string, command: string[]) {
  const result = Bun.spawnSync(command, {
    cwd: dir,
    env: env(),
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function gitIn(dir: string, ...args: string[]): string {
  const result = spawnIn(dir, ["git", ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

const git = (...args: string[]) => gitIn(work, ...args);

function write(path: string, content: string) {
  mkdirSync(dirname(join(work, path)), { recursive: true });
  writeFileSync(join(work, path), content);
}

function commit(message: string): string {
  git("add", "-A");
  git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

const publish = () => git("push", "-q", "origin", "main");

const short = (sha: string) => sha.slice(0, 7);
const abbrev = (sha: string) => git("rev-parse", "--short", sha);

/** A journal shaped like drizzle-kit's, with one row per tag. */
function journal(tags: string[]): string {
  return `${JSON.stringify(
    {
      version: "7",
      dialect: "postgresql",
      entries: tags.map((tag, idx) => ({
        idx,
        version: "7",
        when: 1000 * (idx + 1),
        tag,
        breakpoints: true,
      })),
    },
    null,
    2,
  )}\n`;
}

function addMigration(tags: string[]) {
  const tag = tags.at(-1) ?? "";
  write(`${MIGRATIONS}/${tag}.sql`, `CREATE TABLE "${tag}" ();\n`);
  write(`${MIGRATIONS}/meta/_journal.json`, journal(tags));
}

function fixture(path: string, content: string) {
  mkdirSync(dirname(join(fake, path)), { recursive: true });
  writeFileSync(join(fake, path), content);
}

type Target = "staging" | "production";

/** What deploy.yml records for a write: before its migrate job may start, and once deployed. */
type Kind = "migrating" | "deployed";

/** Both records: deploy.yml migrated the write's SHA and deployed it. */
const DEPLOYED: Kind[] = ["migrating", "deployed"];

let second = 0;

/**
 * Adds deploy.yml's records of `write`, which wrote `sha` to the target's version file, to
 * what gcloud lists, named as make deploy-record names them.
 */
function record(target: Target, sha: string, write: string, kinds: Kind[]) {
  const file = join(fake, "gcloud", `records-${target}`);
  const listed = existsSync(file) ? readFileSync(file, "utf8") : "";
  const names = kinds.map((kind) => {
    const time = new Date(Date.UTC(2026, 10, 1, 0, 0, ++second))
      .toISOString()
      .replace(/:|\.\d+/g, "");
    return `${target}/${sha}/${write}/${time}-${kind}\n`;
  });
  fixture(`gcloud/records-${target}`, listed + names.join(""));
}

/** Removes every record of `write` from what gcloud lists for the target. */
function forget(target: Target, write: string) {
  const file = join(fake, "gcloud", `records-${target}`);
  fixture(
    `gcloud/records-${target}`,
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line !== "" && !line.includes(`/${write}/`))
      .map((line) => `${line}\n`)
      .join(""),
  );
}

/**
 * A merged promotion pull request: main's commit writing `sha`, with the records deploy.yml
 * wrote for it (deployed unless given).
 */
function land(target: Target, sha: string, kinds: Kind[] = DEPLOYED): string {
  write(`deploy/${target}/version`, `${sha}\n`);
  const written = commit(`chore(deploy): promote ${target} to ${short(sha)}`);
  record(target, sha, written, kinds);
  return written;
}

// main: c0 c1(0000_one) s1 c2(0001_two) c3(0002_three) c4 s2, where s1 and s2 write c1 and
// then c2 to deploy/staging/version and production has no version yet. Every c has an
// image; deploy.yml deployed s1 and s2. Git is slow to start, so this is built once and
// each test works on a copy.
let template: string;
let c0: string;
let c1: string;
let c2: string;
let c3: string;
let c4: string;
let s1: string;
let s2: string;

beforeAll(() => {
  template = mkdtempSync(join(tmpdir(), "moonx-promote-"));
  use(template);
  for (const folder of ["bin", "home", "tmp", "fake"]) {
    mkdirSync(join(root, folder));
  }
  writeFileSync(join(root, "bin", "gh"), FAKE_GH);
  writeFileSync(join(root, "bin", "gcloud"), FAKE_GCLOUD);
  // make deploy-record's curl, which logs its arguments: the token must not be one of them.
  const curl = Bun.which("curl");
  if (curl === null) throw new Error("No curl on PATH");
  writeFileSync(
    join(root, "bin", "curl"),
    `#!/usr/bin/env bash\n{ printf 'curl'; printf '\\t%s' "$@"; printf '\\n'; } >> "$FAKE_DIR/calls.log"\nexec '${curl}' "$@"\n`,
  );
  for (const tool of ["gh", "gcloud", "curl"]) {
    chmodSync(join(root, "bin", tool), 0o755);
  }
  gitIn(root, "init", "-q", "--bare", "-b", "main", origin);
  gitIn(root, "init", "-q", "-b", "main", work);
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  git("remote", "add", "origin", origin);

  write("README.md", "moonx\n");
  c0 = commit("chore: start");
  addMigration(["0000_one"]);
  c1 = commit("feat: one");
  s1 = land("staging", c1);
  addMigration(["0000_one", "0001_two"]);
  c2 = commit("feat: two");
  addMigration(["0000_one", "0001_two", "0002_three"]);
  c3 = commit("feat: three");
  write("src/four.ts", "export const four = 4;\n");
  c4 = commit("fix: four");
  s2 = land("staging", c2);
  git("push", "-q", "-u", "origin", "main");
  for (const sha of [c0, c1, c2, c3, c4]) {
    fixture(`gcloud/image-${sha}`, "");
  }
});

afterAll(() => {
  rmSync(template, { recursive: true, force: true });
});

beforeEach(() => {
  use(mkdtempSync(join(tmpdir(), "moonx-promote-")));
  cpSync(template, root, { recursive: true });
  git("remote", "set-url", "origin", origin);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function promoteWith(environment: Record<string, string>, ...args: string[]) {
  const result = Bun.spawnSync(
    ["bun", join(import.meta.dir, "promote.ts"), ...args],
    {
      cwd: work,
      env: { ...env(), ...environment },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

// make promote passes the project the Makefile resolved.
const run = (...args: string[]) =>
  promoteWith({ GCP_PROJECT_ID: PROJECT }, ...args);

function calls(tool: "gh" | "gcloud" | "curl"): string[][] {
  const log = join(fake, "calls.log");
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("\t"))
    .filter((call) => call[0] === tool)
    .map((call) => call.slice(1));
}

/** gcloud's listing of the records of `target`, as promote asks for it. */
const listsRecords = (target: Target) => [
  "storage",
  "objects",
  "list",
  `${RECORDS}/${target}/**`,
  "--exhaustive",
  "--format=value(name)",
];

const prCreated = () =>
  calls("gh").some(([command, sub]) => command === "pr" && sub === "create");
const prTitle = () => readFileSync(join(fake, "pr-title"), "utf8");
const prBody = () => readFileSync(join(fake, "pr-body"), "utf8");
const onBranch = () => git("rev-parse", "--abbrev-ref", "HEAD");
const localBranches = () =>
  git("for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n");

function originBranch(branch: string): string | undefined {
  const result = spawnIn(origin, [
    "git",
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

/** A job of a workflow, with the keys the tests read. */
interface WorkflowJob {
  name?: string;
  needs?: string | string[];
  if?: string;
  environment?: unknown;
  concurrency?: unknown;
  permissions?: unknown;
  outputs?: Record<string, string>;
  "continue-on-error"?: unknown;
  steps?: {
    name?: string;
    if?: string;
    "continue-on-error"?: unknown;
    run?: string;
    uses?: string;
    with?: Record<string, unknown>;
    "working-directory"?: string;
  }[];
}

const deployWorkflow = async () =>
  YAML.parse(
    await Bun.file(
      join(import.meta.dir, "..", ".github", "workflows", "deploy.yml"),
    ).text(),
  ) as { permissions?: unknown; jobs?: Record<string, WorkflowJob> };

/** Asserts the run left the user on a clean main, with no branch and no pull request. */
function expectNothingMade(branch: string) {
  expect(onBranch()).toBe("main");
  expect(localBranches()).toEqual(["main"]);
  expect(originBranch(branch)).toBeUndefined();
  expect(git("status", "--porcelain")).toBe("");
  expect(prCreated()).toBe(false);
}

/** What make deploy-record sent to Cloud Storage's JSON API. */
interface Upload {
  method: string;
  path: string;
  query: Record<string, string>;
  authorization: string | null;
  contentType: string | null;
  body: string;
}

const uploads: Upload[] = [];
/** The status the fake Cloud Storage answers with: 412 when the object is there already. */
let storageStatus = 200;
const storage = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    uploads.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      authorization: request.headers.get("authorization"),
      contentType: request.headers.get("content-type"),
      body: await request.text(),
    });
    return Response.json({ kind: "storage#object" }, { status: storageStatus });
  },
});

afterAll(() => {
  storage.stop(true);
});

/**
 * The repository's make deploy-record, as deploy.yml runs it, with the fake gcloud's token
 * and the fake Cloud Storage. Run from the test's folder, so no .env is read, and spawned
 * without blocking, since the fake Cloud Storage answers in this process.
 */
async function deployRecord(...values: string[]) {
  const child = Bun.spawn(
    [
      "make",
      "--no-print-directory",
      "-f",
      join(import.meta.dir, "..", "Makefile"),
      "deploy-record",
      ...values,
      `GCP_PROJECT_ID=${PROJECT}`,
      `STORAGE_URL=${storage.url.origin}`,
    ],
    { cwd: root, env: env(), stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("promote", () => {
  test("opens the staging promotion of main's newest commit outside deploy/", () => {
    const branch = `promote/staging-${short(c4)}`;
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${PR_URL}\n`);
    expect(prTitle()).toBe(`chore(deploy): promote staging to ${short(c4)}`);
    expect(prBody()).toBe(
      [
        "## 昇格",
        "",
        "- 環境: staging",
        `- 今の版: \`${c2}\``,
        `- 出す版: \`${c4}\``,
        "- 向き: 進める",
        `- いちばん先まで出した版: \`${c2}\``,
        "",
        `## コミット（今の版 \`${short(c2)}\` の次から、出す版まで）`,
        "",
        `- ${abbrev(c4)} fix: four`,
        `- ${abbrev(c3)} feat: three`,
        "",
        `## マイグレーション（いちばん先まで出した版 \`${short(c2)}\` の次から、出す版まで。この昇格で新しく当たるもの）`,
        "",
        "- `0002_three`",
        "",
        "## 戻し方",
        "",
        `今の版に戻すときは \`make promote ENV=staging SHA=${short(c2)}\` を動かす。`,
        "",
        "## この PR のデプロイが済まなかったとき",
        "",
        UNDEPLOYED_NOTE(STAGING),
        "",
      ].join("\n"),
    );

    const pushed = originBranch(branch);
    expect(gitIn(origin, "rev-parse", `${pushed}^`)).toBe(s2);
    expect(gitIn(origin, "show", `${pushed}:${STAGING}`)).toBe(c4);
    expect(
      gitIn(origin, "show", "--format=%s", "--name-status", pushed ?? ""),
    ).toBe(`chore(deploy): promote staging to ${short(c4)}\n\nM\t${STAGING}`);
    expect(onBranch()).toBe(branch);
    expect(git("rev-parse", "HEAD")).toBe(pushed ?? "");
    expect(git("rev-parse", "--abbrev-ref", "@{upstream}")).toBe(
      `origin/${branch}`,
    );
    expect(git("status", "--porcelain")).toBe("");

    // GitHub's workflow runs expire (ADR-016): gh is asked about pull requests alone.
    expect(calls("gh")).toEqual([
      [
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        branch,
        "--title",
        `chore(deploy): promote staging to ${short(c4)}`,
        "--body-file",
        expect.any(String) as unknown as string,
      ],
    ]);
    expect(calls("gcloud")).toEqual([
      [
        "artifacts",
        "docker",
        "images",
        "describe",
        `${IMAGE}:${c4}`,
        "--format=value(image_summary.digest)",
      ],
      listsRecords("staging"),
    ]);
  });

  test("resolves a short SHA to the full one", () => {
    const result = run("staging", short(c3));

    expect(result.exitCode).toBe(0);
    expect(prTitle()).toBe(`chore(deploy): promote staging to ${short(c3)}`);
    expect(prBody()).toContain(`- 出す版: \`${c3}\``);
    expect(prBody()).toContain(
      `今の版 \`${short(c2)}\` の次から、出す版まで）\n\n- ${abbrev(c3)} feat: three\n\n`,
    );
    expect(prBody()).toContain(
      "この昇格で新しく当たるもの）\n\n- `0002_three`\n\n",
    );
    expect(
      gitIn(
        origin,
        "show",
        `refs/heads/promote/staging-${short(c3)}:${STAGING}`,
      ),
    ).toBe(c3);
  });

  test("rolls back to the previous version", () => {
    const result = run("staging", short(c1));

    expect(result.exitCode).toBe(0);
    expect(prTitle()).toBe(`chore(deploy): roll back staging to ${short(c1)}`);
    const body = prBody();
    expect(body).toContain("- 向き: 戻す\n");
    expect(body).toContain(
      `## コミット（出す版の次から、いちばん先まで出した版 \`${short(c2)}\` まで。出す版に無いもの）\n\n- ${abbrev(c2)} feat: two\n\n`,
    );
    expect(body).toContain(
      `## マイグレーション（出す版の次から、いちばん先まで出した版 \`${short(c2)}\` まで。DB に当たっていて、出す版に無いもの）\n\n- \`0001_two\`\n\n`,
    );
    expect(body).toContain(
      `## 直前の版\n\n出す版は、いちばん先まで出した版より古く、直前の版（04_deployment-procedure.md 4.1）の \`${c1}\` なので、5.1 の 3 で確かめなくてよい。\n`,
    );
    expect(body).toContain(
      `今の版に戻すときは \`make promote ENV=staging SHA=${short(c2)}\` を動かす。`,
    );
    expect(body).toContain(UNDEPLOYED_NOTE(STAGING));
    expect(body).toContain(`## 戻す理由\n\n${ROLLBACK_REASON}\n`);
    expect(body).not.toContain("## staging での確認の結果");
  });

  test("rolls back past the previous version and asks for the contract check", () => {
    land("staging", c4);
    publish();
    const result = run("staging", c1);

    expect(result.exitCode).toBe(0);
    expect(prTitle()).toBe(`chore(deploy): roll back staging to ${short(c1)}`);
    const body = prBody();
    expect(body).toContain(`- いちばん先まで出した版: \`${c4}\``);
    expect(body).toContain(
      `まで。出す版に無いもの）\n\n- ${abbrev(c4)} fix: four\n- ${abbrev(c3)} feat: three\n- ${abbrev(c2)} feat: two\n\n`,
    );
    expect(body).toContain(
      "出す版に無いもの）\n\n- `0001_two`\n- `0002_three`\n\n",
    );
    expect(body).toContain(
      `直前の版（04_deployment-procedure.md 4.1）の \`${c2}\` でもない。04_deployment-procedure.md 5.1 の 3 のとおり、上のマイグレーションの一覧に contract（4.1 の表の右の列）が無いことを確かめる。`,
    );
  });

  test("takes the previous version from the first write that deployed the furthest version", () => {
    land("staging", c4);
    land("staging", c3);
    land("staging", c4);
    publish();
    const result = run("staging", c2);

    expect(result.exitCode).toBe(0);
    expect(prBody()).toContain(
      `直前の版（04_deployment-procedure.md 4.1）の \`${c2}\` なので、5.1 の 3 で確かめなくてよい。`,
    );
  });

  test("skips a write deploy.yml did not deploy when it looks for the previous version", () => {
    land("staging", c3, ["migrating"]);
    land("staging", c4);
    publish();
    const result = run("staging", c2);

    expect(result.exitCode).toBe(0);
    expect(prBody()).toContain(`- いちばん先まで出した版: \`${c4}\``);
    expect(prBody()).toContain(
      `直前の版（04_deployment-procedure.md 4.1）の \`${c2}\` なので、5.1 の 3 で確かめなくてよい。`,
    );
  });

  test("counts the furthest version as first deployed when its first write did not deploy", () => {
    // c4's first write stopped before its image job; c4's migrations reached the DB while
    // c3 ran.
    land("staging", c4, []);
    land("staging", c3);
    land("staging", c4);
    publish();
    const result = run("staging", c3);

    expect(result.exitCode).toBe(0);
    expect(prBody()).toContain(
      `直前の版（04_deployment-procedure.md 4.1）の \`${c3}\` なので、5.1 の 3 で確かめなくてよい。`,
    );
  });

  test("takes the furthest version from what deploy.yml deployed, not from what was written", () => {
    // X = c2 deployed, Y = c3 promoted but stopped before its image job, X promoted again;
    // Z = c4.
    land("staging", c3, []);
    land("staging", c2);
    publish();
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    const body = prBody();
    expect(body).not.toContain("[!WARNING]");
    expect(body).not.toContain("[!CAUTION]");
    expect(body).toContain(`- いちばん先まで出した版: \`${c2}\``);
    expect(body).toContain(
      `## コミット（今の版 \`${short(c2)}\` の次から、出す版まで）\n\n- ${abbrev(c4)} fix: four\n- ${abbrev(c3)} feat: three\n\n`,
    );
    expect(body).toContain(
      `## マイグレーション（いちばん先まで出した版 \`${short(c2)}\` の次から、出す版まで。この昇格で新しく当たるもの）\n\n- \`0002_three\`\n\n`,
    );
    // The records of the environment are listed once, whatever the number of writes.
    expect(
      calls("gcloud").filter(([command]) => command === "storage"),
    ).toEqual([listsRecords("staging")]);
  });

  describe("when a newer version may have migrated", () => {
    // X = c2 deployed, then Y = c5 recorded that its migrations may run and never deployed
    // (its migrations may be in the DB), then X was promoted again. W = c1 is older, c3
    // lies between X and Y, Z = c6.
    let c5: string;
    let c6: string;
    let y: string;

    beforeEach(() => {
      addMigration(["0000_one", "0001_two", "0002_three", "0003_five"]);
      c5 = commit("feat: five");
      addMigration([
        "0000_one",
        "0001_two",
        "0002_three",
        "0003_five",
        "0004_six",
      ]);
      c6 = commit("feat: six");
      for (const sha of [c5, c6]) {
        fixture(`gcloud/image-${sha}`, "");
      }
      y = land("staging", c5, ["migrating"]);
      land("staging", c2);
      publish();
    });

    const caution = (writer = y) =>
      `> [!CAUTION]\n> \`${short(c5)}\` の deploy.yml（${short(writer)} の書き込み）は、マイグレーションの前の記録を書いたが、この版を出した記録はどの書き込みにも無い。記録はマイグレーションのジョブより前（production では承認の前）に書くので、\`${short(c5)}\` のマイグレーションが DB に当たったかは分からない。下のマイグレーションの一覧は、当たっていても当たっていなくても漏れが無いように作った。\n\n## 昇格\n`;

    test("rolling back to an older version lists the migrations up to the one that may have migrated", () => {
      const result = run("staging", c1);

      expect(result.exitCode).toBe(0);
      expect(prTitle()).toBe(
        `chore(deploy): roll back staging to ${short(c1)}`,
      );
      const body = prBody();
      expect(body).toBe(
        [
          caution(),
          "- 環境: staging",
          `- 今の版: \`${c2}\``,
          `- 出す版: \`${c1}\``,
          "- 向き: 戻す",
          `- いちばん先まで出した版: \`${c2}\``,
          `- マイグレーションが当たったかもしれない版: \`${c5}\``,
          "",
          `## コミット（出す版の次から、マイグレーションが当たったかもしれない版 \`${short(c5)}\` まで。出す版に無いもの）`,
          "",
          `- ${abbrev(c5)} feat: five`,
          `- ${abbrev(c4)} fix: four`,
          `- ${abbrev(c3)} feat: three`,
          `- ${abbrev(c2)} feat: two`,
          "",
          `## マイグレーション（出す版の次から、マイグレーションが当たったかもしれない版 \`${short(c5)}\` まで。DB に当たっているかもしれず、出す版に無いもの）`,
          "",
          "- `0001_two`",
          "- `0002_three`",
          "- `0003_five`",
          "",
          "## 直前の版",
          "",
          // c1 is the previous version of c2, but it never ran on c5's migrations.
          `出す版は、いちばん先まで出した版より古く、直前の版（04_deployment-procedure.md 4.1）の \`${c1}\` なので、\`${short(c2)}\` までのマイグレーションは確かめなくてよい。\`${short(c2)}\` の次から \`${short(c5)}\` までのもの（当たったかもしれないもの）は、04_deployment-procedure.md 5.1 の 3 のとおり contract（4.1 の表の右の列）が無いことを確かめる。新しい値を書き始めた変更はマイグレーションに出ないことがあるので、コミットの一覧でも確かめる。`,
          "",
          "## 戻し方",
          "",
          `今の版に戻すときは \`make promote ENV=staging SHA=${short(c2)}\` を動かす。`,
          "",
          "## この PR のデプロイが済まなかったとき",
          "",
          UNDEPLOYED_NOTE(STAGING),
          "",
          "## 戻す理由",
          "",
          ROLLBACK_REASON,
          "",
        ].join("\n"),
      );
    });

    test("promoting past it lists the migrations from the furthest version", () => {
      const result = run("staging", c6);

      expect(result.exitCode).toBe(0);
      const body = prBody();
      expect(body).toStartWith(caution());
      expect(body).toContain(
        `## マイグレーション（いちばん先まで出した版 \`${short(c2)}\` の次から、出す版まで。この昇格で新しく当たるもの）\n\n- \`0002_three\`\n- \`0003_five\`\n- \`0004_six\`\n\nこの一覧には、\`${short(c5)}\` のデプロイで当たったかもしれないものも入っている。\n\n## 戻し方`,
      );
      expect(body).not.toContain("出す版に無いもの");
    });

    test("promoting a version between them lists both directions and asks for the contract check", () => {
      const result = run("staging", c3);

      expect(result.exitCode).toBe(0);
      expect(prTitle()).toBe(`chore(deploy): promote staging to ${short(c3)}`);
      expect(prBody()).toContain(
        [
          `## コミット（今の版 \`${short(c2)}\` の次から、出す版まで）`,
          "",
          `- ${abbrev(c3)} feat: three`,
          "",
          `## マイグレーション（いちばん先まで出した版 \`${short(c2)}\` の次から、出す版まで。この昇格で新しく当たるもの）`,
          "",
          "- `0002_three`",
          "",
          `この一覧には、\`${short(c5)}\` のデプロイで当たったかもしれないものも入っている。`,
          "",
          `## コミット（出す版の次から、マイグレーションが当たったかもしれない版 \`${short(c5)}\` まで。出す版に無いもの）`,
          "",
          `- ${abbrev(c5)} feat: five`,
          `- ${abbrev(c4)} fix: four`,
          "",
          `## マイグレーション（出す版の次から、マイグレーションが当たったかもしれない版 \`${short(c5)}\` まで。DB に当たっているかもしれず、出す版に無いもの）`,
          "",
          "- `0003_five`",
          "",
          `出す版は \`${short(c5)}\` より古く、上の一覧のマイグレーションが当たった DB で動くとは確かめられていない。04_deployment-procedure.md 5.1 の 3 のとおり、この一覧に contract（4.1 の表の右の列）が無いことを確かめる。新しい値を書き始めた変更はマイグレーションに出ないことがあるので、出す版に無いコミットの一覧でも確かめる。`,
          "",
          "## 戻し方",
        ].join("\n"),
      );
    });

    test("does not count a newer version whose writes have no record", () => {
      // c6's write stopped before its image job: nothing of it can have migrated.
      land("staging", c6, []);
      land("staging", c2);
      publish();
      const result = run("staging", c3);

      expect(result.exitCode).toBe(0);
      const body = prBody();
      expect(body).toStartWith(caution());
      expect(body).toContain(
        `- マイグレーションが当たったかもしれない版: \`${c5}\`\n`,
      );
      expect(body).not.toContain(`\`${c6}\``);
    });

    test("names the newest write of the version that recorded its migrations", () => {
      // c5 written again and recorded, then a third time, stopped before its image job.
      const again = land("staging", c5, ["migrating"]);
      land("staging", c2);
      land("staging", c5, []);
      land("staging", c2);
      publish();
      const result = run("staging", c6);

      expect(result.exitCode).toBe(0);
      expect(prBody()).toStartWith(caution(again));
    });

    test("lists the commits absent from a target older than what Cloud Run runs", () => {
      // c5 written again; its migrations and its deployment ran, the check after them
      // failed, so no deployed record, and it now serves.
      land("staging", c5, ["migrating"]);
      publish();
      fixture(
        "gcloud/service-moonx-api-staging.json",
        JSON.stringify({
          status: {
            latestReadyRevisionName: "moonx-api-staging-00005-eee",
            traffic: [{ latestRevision: true, percent: 100 }],
          },
        }),
      );
      fixture(
        "gcloud/revision-moonx-api-staging-00005-eee",
        `${IMAGE}:${c5}\n`,
      );
      const result = run("staging", c2);

      expect(result.exitCode).toBe(0);
      expect(prTitle()).toBe(
        `chore(deploy): roll back staging to ${short(c2)}`,
      );
      const body = prBody();
      expect(body).not.toContain("の次から、出す版まで）");
      expect(body).toContain(
        [
          `## マイグレーション（いちばん先まで出した版 \`${short(c2)}\` の次から、出す版まで。この昇格で新しく当たるもの）`,
          "",
          "なし",
          "",
          `この一覧には、\`${short(c5)}\` のデプロイで当たったかもしれないものも入っている。`,
          "",
          `## コミット（出す版の次から、マイグレーションが当たったかもしれない版 \`${short(c5)}\` まで。出す版に無いもの）`,
          "",
          `- ${abbrev(c5)} feat: five`,
          `- ${abbrev(c4)} fix: four`,
          `- ${abbrev(c3)} feat: three`,
          "",
          `## マイグレーション（出す版の次から、マイグレーションが当たったかもしれない版 \`${short(c5)}\` まで。DB に当たっているかもしれず、出す版に無いもの）`,
          "",
          "- `0002_three`",
          "- `0003_five`",
          "",
        ].join("\n"),
      );
      expect(body).toContain(
        "新しい値を書き始めた変更はマイグレーションに出ないことがあるので、出す版に無いコミットの一覧でも確かめる。",
      );
      // Cloud Run runs the written version, so the undo line starts from it, and no list of
      // commits starts from it: the target is older.
      expect(body).toContain(
        `> Cloud Run で動いているのは書かれている今の版 \`${short(c5)}\` で、下の戻し方もこの版を起点にする。\n`,
      );
      expect(body).toContain(
        `今の版に戻すときは \`make promote ENV=staging SHA=${short(c5)}\` を動かす。`,
      );
    });
  });

  test.each(["staging", "production"] as const)(
    "counts a version as deployed when its write has the deployed record among others (%s)",
    (target) => {
      // A re-run of every job recorded the migrations again after the deployment.
      record("staging", c2, s2, ["migrating"]);
      const result = run(target, ...(target === "staging" ? [] : [c2]));

      expect(result.exitCode).toBe(0);
      expect(prBody()).not.toContain("[!WARNING]");
      expect(prBody()).toContain(
        `- 出す版: \`${target === "staging" ? c4 : c2}\``,
      );
    },
  );

  test("counts the current version without the deployed record as not deployed, but maybe migrated", () => {
    const written = land("staging", c3, ["migrating"]);
    publish();
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(prBody()).toBe(
      [
        "> [!WARNING]",
        `> staging の前回の deploy.yml には、今の版を出した記録が無い（${short(written)} の deploy.yml は、マイグレーションの前の記録を書いたが、出した記録を書いていない（マイグレーションかデプロイのジョブを待っている・そこで止まった、または後の昇格に追い越された））。\`${STAGING}\` は、Cloud Run に出ていない版を指していることがある。`,
        ">",
        "> Cloud Run の `moonx-api-staging` で動いている版を gcloud で読めなかった（gcloud run services describe: ERROR: (gcloud.run.services.describe) Cannot find service [moonx-api-staging]）。",
        ">",
        `> 下のコミットの一覧と戻し方は、書かれている今の版 \`${short(c3)}\` を起点にする。この版は Cloud Run で動いていないことがある。`,
        "",
        "> [!CAUTION]",
        `> \`${short(c3)}\` の deploy.yml（${short(written)} の書き込み）は、マイグレーションの前の記録を書いたが、この版を出した記録はどの書き込みにも無い。記録はマイグレーションのジョブより前（production では承認の前）に書くので、\`${short(c3)}\` のマイグレーションが DB に当たったかは分からない。下のマイグレーションの一覧は、当たっていても当たっていなくても漏れが無いように作った。`,
        "",
        "## 昇格",
        "",
        "- 環境: staging",
        `- 今の版: \`${c3}\``,
        `- 出す版: \`${c4}\``,
        "- 向き: 進める",
        `- いちばん先まで出した版: \`${c2}\``,
        `- マイグレーションが当たったかもしれない版: \`${c3}\``,
        "",
        `## コミット（今の版 \`${short(c3)}\` の次から、出す版まで）`,
        "",
        `- ${abbrev(c4)} fix: four`,
        "",
        `## マイグレーション（いちばん先まで出した版 \`${short(c2)}\` の次から、出す版まで。この昇格で新しく当たるもの）`,
        "",
        "- `0002_three`",
        "",
        `この一覧には、\`${short(c3)}\` のデプロイで当たったかもしれないものも入っている。`,
        "",
        "## 戻し方",
        "",
        `今の版に戻すときは \`make promote ENV=staging SHA=${short(c3)}\` を動かす。`,
        "",
        "## この PR のデプロイが済まなかったとき",
        "",
        UNDEPLOYED_NOTE(STAGING),
        "",
      ].join("\n"),
    );
  });

  test.each<[string, Kind[]]>([
    ["no write has a record", []],
    ["the current write may have migrated", ["migrating"]],
  ])(
    "without a deployed version, lists every migration of the target when %s",
    (_, kinds) => {
      forget("staging", s1);
      forget("staging", s2);
      record("staging", c2, s2, kinds);
      const result = run("staging");

      expect(result.exitCode).toBe(0);
      const body = prBody();
      expect(body).toContain(
        "- いちばん先まで出した版: なし（デプロイまで済んだ版が無い）\n",
      );
      expect(body).toContain(
        [
          "## マイグレーション（出す版にあるすべて。この昇格で新しく当たるもの）",
          "",
          "- `0000_one`",
          "- `0001_two`",
          "- `0002_three`",
          "",
          ...(kinds.length === 0
            ? []
            : [
                `この一覧には、\`${short(c2)}\` のデプロイで当たったかもしれないものも入っている。`,
                "",
              ]),
          "## 戻し方",
        ].join("\n"),
      );
      expect(body.includes("[!CAUTION]")).toBe(kinds.length > 0);
    },
  );

  test.each<[string, Target, string]>([
    [
      "staging",
      "staging",
      "ERROR: (gcloud.storage.objects.list) [me@example.com] does not have permission to access b instance [moonx-test-moonx-deploys]",
    ],
    [
      "staging, for production",
      "production",
      "ERROR: (gcloud.storage.objects.list) There was a problem refreshing your current auth tokens",
    ],
  ])("stops when gcloud cannot read the records of %s", (_, target, error) => {
    fixture("gcloud/records-staging.stderr", error);
    const result = run(target);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `promote: could not read deploy.yml's records of staging (gcloud ${listsRecords("staging").join(" ")}: ${error})`,
    );
    expectNothingMade(
      `promote/${target}-${short(target === "staging" ? c4 : c2)}`,
    );
  });

  test.each<[string, () => string, () => string]>([
    [
      "a name make deploy-record does not write",
      () => "staging/notes.txt",
      () =>
        `${RECORDS}/staging/** holds staging/notes.txt, which is not a record make deploy-record writes for staging`,
    ],
    [
      "a record of the other environment",
      () => `production/${c2}/${s2}/2026-11-01T000000Z-deployed`,
      () =>
        `${RECORDS}/staging/** holds production/${c2}/${s2}/2026-11-01T000000Z-deployed, which is not a record make deploy-record writes for staging`,
    ],
    [
      "an unknown kind of record",
      () => `staging/${c2}/${s2}/2026-11-01T000000Z-migrated`,
      () => "-migrated, which is not a record make deploy-record writes",
    ],
    [
      "a record of a commit that did not write the version",
      () => `staging/${c3}/${c3}/2026-11-01T000000Z-deployed`,
      () =>
        `the record staging/${c3}/${c3}/2026-11-01T000000Z-deployed belongs to ${short(c3)}, which did not write ${STAGING} on origin/main.`,
    ],
    [
      "a record whose SHA is not the one its write wrote",
      () => `staging/${c3}/${s2}/2026-11-01T000000Z-migrating`,
      () =>
        `the record staging/${c3}/${s2}/2026-11-01T000000Z-migrating says ${short(s2)} wrote ${short(c3)} to ${STAGING}, but it wrote ${short(c2)} on origin/main`,
    ],
  ])("stops at %s", (_, name, message) => {
    const file = join(fake, "gcloud", "records-staging");
    fixture(
      "gcloud/records-staging",
      `${readFileSync(file, "utf8")}${name()}\n`,
    );
    const result = run("staging");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(message());
    expectNothingMade(`promote/staging-${short(c4)}`);
  });

  test("promotes a version between a rollback and the furthest version", () => {
    land("staging", c4);
    land("staging", c2);
    publish();
    const result = run("staging", c3);

    expect(result.exitCode).toBe(0);
    expect(prTitle()).toBe(`chore(deploy): promote staging to ${short(c3)}`);
    const body = prBody();
    expect(body).toContain("- 向き: 進める\n");
    expect(body).toContain(`- いちばん先まで出した版: \`${c4}\``);
    expect(body).toContain(
      `いちばん先まで出した版 \`${short(c4)}\` まで。出す版に無いもの）\n\n- ${abbrev(c4)} fix: four\n\n`,
    );
    expect(body).toContain("DB に当たっていて、出す版に無いもの）\n\nなし\n\n");
    expect(body).toContain(`の \`${c2}\` でもない。`);
    expect(body).not.toContain("## 戻す理由");
  });

  test("refuses a rollback to a SHA the environment never had, back on main without the branch", () => {
    const result = run("staging", c0);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "make promote-check BASE=origin/main fails:",
    );
    expect(result.stderr).toContain(
      `${STAGING}: rolls back to ${c0}, which was never in ${STAGING} up to origin/main`,
    );
    expect(result.stderr).toContain("You are back on main");
    expectNothingMade(`promote/staging-${short(c0)}`);
  });

  test("opens the first promotion of production with staging's version", () => {
    const result = run("production");

    expect(result.exitCode).toBe(0);
    expect(prTitle()).toBe(`chore(deploy): promote production to ${short(c2)}`);
    expect(prBody()).toBe(
      [
        "## 昇格",
        "",
        "- 環境: production",
        "- 今の版: なし（最初の昇格）",
        `- 出す版: \`${c2}\``,
        "- 向き: 進める",
        "",
        "## マイグレーション（出す版にあるすべて。最初の昇格で当たるもの）",
        "",
        "- `0000_one`",
        "- `0001_two`",
        "",
        "## 戻し方",
        "",
        "最初の昇格なので、戻す先の版は無い。",
        "",
        "## この PR のデプロイが済まなかったとき",
        "",
        UNDEPLOYED_NOTE(PRODUCTION),
        "",
        "## staging での確認の結果",
        "",
        "<!-- staging で済ませたデプロイ後の確認（04_deployment-procedure.md 6章）の結果を書く（4.2） -->",
        "",
      ].join("\n"),
    );
    expect(
      gitIn(
        origin,
        "show",
        `refs/heads/promote/production-${short(c2)}:${PRODUCTION}`,
      ),
    ).toBe(c2);
    // staging's records show the deployment; production has none to read before its first.
    expect(
      calls("gcloud").filter(([command]) => command === "storage"),
    ).toEqual([listsRecords("staging")]);
  });

  test("promotes production forward from its version", () => {
    land("production", c1);
    publish();
    const result = run("production");

    expect(result.exitCode).toBe(0);
    expect(prTitle()).toBe(`chore(deploy): promote production to ${short(c2)}`);
    const body = prBody();
    expect(body).toContain(`- 今の版: \`${c1}\``);
    expect(body).toContain(
      `今の版 \`${short(c1)}\` の次から、出す版まで）\n\n- ${abbrev(c2)} feat: two\n\n`,
    );
    expect(body).toContain("この昇格で新しく当たるもの）\n\n- `0001_two`\n\n");
    expect(body).toContain(
      `今の版に戻すときは \`make promote ENV=production SHA=${short(c1)}\` を動かす。`,
    );
    expect(body).toContain("## staging での確認の結果\n");
  });

  test.each<[string, Kind[], (write: string) => string]>([
    [
      "recorded no deployment of it",
      ["migrating"],
      (write) =>
        `deploy.yml recorded that ${short(write)} may migrate, and no deployment of it (it waits or stopped in its migrate or deploy job, or a later promotion reached main first)`,
    ],
    [
      "wrote no record of it",
      [],
      (write) =>
        `deploy.yml wrote no record for ${short(write)} (it stopped at its check or image job, or has not got that far)`,
    ],
  ])("refuses production when staging's deploy.yml %s", (_, kinds, reason) => {
    forget("staging", s2);
    record("staging", c2, s2, kinds);
    const result = run("production");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `the staging deployment of ${short(c2)} is not known to have succeeded: ${reason(s2)}. Put it on staging first: wait for or rerun that run while ${STAGING} still holds it, otherwise promote it to staging again (make promote ENV=staging SHA=${short(c2)})`,
    );
    expectNothingMade(`promote/production-${short(c2)}`);
  });

  test("checks the newest staging promotion of the SHA", () => {
    land("staging", c4);
    const again = land("staging", c2, ["migrating"]);
    publish();
    const result = run("production");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `deploy.yml recorded that ${short(again)} may migrate, and no deployment of it`,
    );
  });

  test("lets production roll back to a version staging deployed long ago", () => {
    // staging has moved on to c4 since; s1's record still shows that staging deployed c1.
    land("production", c1);
    land("production", c2);
    land("staging", c4);
    publish();
    const result = run("production", c1);

    expect(result.exitCode).toBe(0);
    expect(prTitle()).toBe(
      `chore(deploy): roll back production to ${short(c1)}`,
    );
    expect(prBody()).toContain(
      `直前の版（04_deployment-procedure.md 4.1）の \`${c1}\` なので、5.1 の 3 で確かめなくてよい。`,
    );
    expect(
      calls("gcloud").filter(([command]) => command === "storage"),
    ).toEqual([listsRecords("staging"), listsRecords("production")]);
  });

  test("refuses a production SHA that was never in staging", () => {
    const result = run("production", c3);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `${short(c3)} was never in ${STAGING} on origin/main: promote it to staging first`,
    );
    expectNothingMade(`promote/production-${short(c3)}`);
  });

  test("stops an omitted SHA older than the version", () => {
    land("production", c2);
    land("staging", c1);
    publish();
    const result = run("production");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `the default SHA ${short(c1)} (${STAGING} on origin/main) is older than production's version ${short(c2)}, so it would roll back`,
    );
    expect(result.stderr).toContain("make promote ENV=production SHA=<sha>");
    expectNothingMade(`promote/production-${short(c1)}`);
  });

  test.each(["staging", "production"] as const)(
    "stops an omitted SHA that %s rolled back before",
    (target) => {
      // staging's default is c4 and production's is staging's c2.
      const [rolledBack, current] = target === "staging" ? [c4, c2] : [c2, c1];
      if (target === "production") land("production", c1);
      land(target, rolledBack);
      land(target, current);
      publish();
      const result = run(target);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        `the default SHA ${short(rolledBack)} (${target === "staging" ? "the newest commit of origin/main outside deploy/" : `${STAGING} on origin/main`}) was rolled back in ${target} before: it is in deploy/${target}/version's history and newer than ${target}'s version ${short(current)}`,
      );
      expect(result.stderr).toContain(`make promote ENV=${target} SHA=<sha>`);
      expectNothingMade(`promote/${target}-${short(rolledBack)}`);
    },
  );

  test("refuses the version the environment already has", () => {
    const result = run("staging", c2);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `${short(c2)} is already staging's version (${STAGING} on origin/main)`,
    );
    expectNothingMade(`promote/staging-${short(c2)}`);
  });

  test("refuses an unknown SHA", () => {
    const result = run("staging", "0123456");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("promote: 0123456 is not a commit (");
    expect(calls("gh")).toEqual([]);
  });

  test("refuses a SHA without an image", () => {
    rmSync(join(fake, `gcloud/image-${c4}`));
    const result = run("staging");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `the image ${IMAGE}:${c4} was not found (gcloud: ERROR: (gcloud.artifacts.docker.images.describe) Image not found`,
    );
    expectNothingMade(`promote/staging-${short(c4)}`);
  });

  test("stops at a leftover branch an open pull request uses, and prints its URL", () => {
    const branch = `promote/staging-${short(c4)}`;
    git("push", "-q", "origin", `${c0}:refs/heads/${branch}`);
    fixture(
      `gh/pr-list-${branch.replace("/", "_")}.json`,
      JSON.stringify([
        { number: 7, url: "https://github.com/example/moonx/pull/7" },
      ]),
    );
    const result = run("staging");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `an open pull request already uses ${branch}: https://github.com/example/moonx/pull/7.`,
    );
    expect(calls("gh")).toContainEqual([
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "open",
      "--json",
      "number,url",
    ]);
    expect(originBranch(branch)).toBe(c0);
    expect(onBranch()).toBe("main");
    expect(prCreated()).toBe(false);
  });

  test("replaces a leftover branch no pull request uses, locally and on origin", () => {
    const branch = `promote/staging-${short(c4)}`;
    // Off main, so pushing the new branch over it would not be a fast-forward.
    git("switch", "-q", "-c", branch, c0);
    write(STAGING, `${c4}\n`);
    const leftover = commit("chore(deploy): an earlier attempt");
    git("push", "-q", "origin", branch);
    git("switch", "-q", "main");
    expect(originBranch(branch)).toBe(leftover);
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(`deleted the leftover branch ${branch}`);
    const pushed = originBranch(branch);
    expect(gitIn(origin, "rev-parse", `${pushed}^`)).toBe(s2);
    expect(gitIn(origin, "show", `${pushed}:${STAGING}`)).toBe(c4);
    expect(git("rev-parse", branch)).toBe(pushed ?? "");
    expect(prCreated()).toBe(true);
  });

  test.each([
    [
      "the work tree has an untracked file",
      () => write("notes.txt", "draft\n"),
      "the work tree has changes (git status)",
    ],
    [
      "status.showUntrackedFiles=no hides an untracked version file",
      () => {
        git("config", "status.showUntrackedFiles", "no");
        write(PRODUCTION, `${c2}\n`);
      },
      "the work tree has changes (git status)",
    ],
    [
      "the work tree has a change",
      () => write("README.md", "changed\n"),
      "the work tree has changes (git status)",
    ],
    [
      "the branch is not main",
      () => git("switch", "-q", "-c", "feature/x"),
      "on feature/x, not main",
    ],
    [
      "HEAD is detached",
      () => git("switch", "-q", "--detach"),
      "HEAD is detached, not main",
    ],
    [
      "main is behind origin/main",
      () => {
        write("README.md", "later\n");
        commit("docs: later");
        publish();
        git("reset", "-q", "--hard", "HEAD~1");
      },
      "main is behind origin/main: git pull",
    ],
    [
      "main is ahead of origin/main",
      () => {
        write("README.md", "local\n");
        commit("docs: local");
      },
      "main has commits that origin/main does not",
    ],
  ])("refuses before anything else when %s", (_, setup, message) => {
    setup();
    const result = run("staging");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`promote: ${message}`);
    expect(calls("gh")).toEqual([]);
    expect(calls("gcloud")).toEqual([]);
    expect(originBranch(`promote/staging-${short(c4)}`)).toBeUndefined();
  });

  test("warns at the top when deploy.yml did not deploy the version, with the split traffic of Cloud Run", () => {
    forget("staging", s2);
    fixture(
      "gcloud/service-moonx-api-staging.json",
      JSON.stringify({
        status: {
          latestReadyRevisionName: "moonx-api-staging-00002-bbb",
          traffic: [
            { latestRevision: true, percent: 90 },
            { revisionName: "moonx-api-staging-00001-aaa", percent: 10 },
            {
              revisionName: "moonx-api-staging-00003-ccc",
              percent: 0,
              tag: "next",
            },
          ],
        },
      }),
    );
    fixture("gcloud/revision-moonx-api-staging-00002-bbb", `${IMAGE}:${c1}\n`);
    fixture("gcloud/revision-moonx-api-staging-00001-aaa", `${IMAGE}:${c0}\n`);
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(prBody()).toStartWith(
      [
        "> [!WARNING]",
        `> staging の前回の deploy.yml には、今の版を出した記録が無い（${short(s2)} の deploy.yml の記録が無い（検査かイメージのジョブで止まったか、まだそこまで動いていない））。\`${STAGING}\` は、Cloud Run に出ていない版を指していることがある。`,
        ">",
        "> Cloud Run の `moonx-api-staging` で動いている版:",
        ">",
        `> - \`${c1}\`（90%）`,
        `> - \`${c0}\`（10%）`,
        ">",
        `> 下のコミットの一覧と戻し方は、書かれている今の版 \`${short(c2)}\` を起点にする。この版は Cloud Run で動いていないことがある。`,
        "",
        "## 昇格",
        "",
      ].join("\n"),
    );
    // The split traffic names no one version, so the lists keep the written one.
    expect(prBody()).toContain(
      `## コミット（今の版 \`${short(c2)}\` の次から、出す版まで）`,
    );
    expect(prBody()).toContain(
      `今の版に戻すときは \`make promote ENV=staging SHA=${short(c2)}\` を動かす。`,
    );
    // c2's deploy failed, so the DB has only up to c1's migrations.
    expect(prBody()).toContain(`- いちばん先まで出した版: \`${c1}\``);
    expect(prBody()).toContain(
      "この昇格で新しく当たるもの）\n\n- `0001_two`\n- `0002_three`\n\n",
    );
    expect(calls("gcloud")).toContainEqual([
      "run",
      "services",
      "describe",
      "moonx-api-staging",
      "--region=asia-southeast1",
      `--project=${PROJECT}`,
      "--format=json",
    ]);
    expect(calls("gcloud")).toContainEqual([
      "run",
      "revisions",
      "describe",
      "moonx-api-staging-00002-bbb",
      "--region=asia-southeast1",
      `--project=${PROJECT}`,
      "--format=value(spec.containers[0].image)",
    ]);
  });

  test("says in the warning that gcloud could not read Cloud Run, and still opens the pull request", () => {
    forget("staging", s2);
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(prBody()).toStartWith(
      [
        "> [!WARNING]",
        `> staging の前回の deploy.yml には、今の版を出した記録が無い（${short(s2)} の deploy.yml の記録が無い（検査かイメージのジョブで止まったか、まだそこまで動いていない））。\`${STAGING}\` は、Cloud Run に出ていない版を指していることがある。`,
        ">",
        "> Cloud Run の `moonx-api-staging` で動いている版を gcloud で読めなかった（gcloud run services describe: ERROR: (gcloud.run.services.describe) Cannot find service [moonx-api-staging]）。",
        ">",
        `> 下のコミットの一覧と戻し方は、書かれている今の版 \`${short(c2)}\` を起点にする。この版は Cloud Run で動いていないことがある。`,
        "",
      ].join("\n"),
    );
  });

  test("keeps gcloud's message on one line of the warning's quote", () => {
    forget("staging", s2);
    fixture(
      "gcloud/service-moonx-api-staging.stderr",
      "ERROR: (gcloud.run.services.describe) There was a problem refreshing\n  your current auth tokens: reauthentication failed\n",
    );
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(prBody()).toContain(
      "> Cloud Run の `moonx-api-staging` で動いている版を gcloud で読めなかった（gcloud run services describe: ERROR: (gcloud.run.services.describe) There was a problem refreshing your current auth tokens: reauthentication failed）。\n>\n",
    );
  });

  test("starts the commit list and the undo line from the one version Cloud Run runs", () => {
    const written = land("staging", c3, []);
    publish();
    fixture(
      "gcloud/service-moonx-api-staging.json",
      JSON.stringify({
        status: {
          latestReadyRevisionName: "moonx-api-staging-00002-bbb",
          traffic: [{ latestRevision: true, percent: 100 }],
        },
      }),
    );
    fixture("gcloud/revision-moonx-api-staging-00002-bbb", `${IMAGE}:${c2}\n`);
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(prTitle()).toBe(`chore(deploy): promote staging to ${short(c4)}`);
    expect(prBody()).toStartWith(
      [
        "> [!WARNING]",
        `> staging の前回の deploy.yml には、今の版を出した記録が無い（${short(written)} の deploy.yml の記録が無い（検査かイメージのジョブで止まったか、まだそこまで動いていない））。\`${STAGING}\` は、Cloud Run に出ていない版を指していることがある。`,
        ">",
        "> Cloud Run の `moonx-api-staging` で動いている版:",
        ">",
        `> - \`${c2}\`（100%）`,
        ">",
        `> 下のコミットの一覧と戻し方は、書かれている今の版ではなく、Cloud Run で動いている \`${short(c2)}\` を起点にする。`,
        "",
        "## 昇格",
        "",
        "- 環境: staging",
        `- 今の版: \`${c3}\``,
      ].join("\n"),
    );
    expect(prBody()).toContain(
      `## コミット（Cloud Run で動いている版 \`${short(c2)}\` の次から、出す版まで）\n\n- ${abbrev(c4)} fix: four\n- ${abbrev(c3)} feat: three\n\n`,
    );
    expect(prBody()).toContain(
      `Cloud Run で動いている版に戻すときは \`make promote ENV=staging SHA=${short(c2)}\` を動かす。`,
    );
  });

  test("goes back to main without the branch when the commit fails", () => {
    const hook = join(work, ".git", "hooks", "pre-commit");
    writeFileSync(hook, "#!/bin/sh\necho 'hook says no' >&2\nexit 1\n");
    chmodSync(hook, 0o755);
    const result = run("production");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("hook says no");
    expect(result.stderr).toContain(
      `You are back on main, and the branch promote/production-${short(c2)} is deleted.`,
    );
    expectNothingMade(`promote/production-${short(c2)}`);
    expect(existsSync(join(work, PRODUCTION))).toBe(false);
  });

  test("goes back to main without the new version file when git add fails", () => {
    // An ignored path makes git add fail after the file is written, and git status stays clean.
    writeFileSync(
      join(work, ".git", "info", "exclude"),
      "deploy/production/\n",
    );
    const result = run("production");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("ignored");
    expectNothingMade(`promote/production-${short(c2)}`);
    expect(existsSync(join(work, PRODUCTION))).toBe(false);
  });

  test("goes back to main without the branch when the push fails", () => {
    const hook = join(origin, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\necho 'origin says no' >&2\nexit 1\n");
    chmodSync(hook, 0o755);
    const result = run("staging");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("origin says no");
    expectNothingMade(`promote/staging-${short(c4)}`);
  });

  test("keeps the pushed branch for the next run when gh cannot open the pull request", () => {
    const branch = `promote/staging-${short(c4)}`;
    fixture("gh/pr-create-fails", "");
    const result = run("staging");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("GraphQL: could not create");
    expect(result.stderr).toContain(
      `${branch} is on origin without a pull request; you are back on main. Run make promote ENV=staging SHA=${short(c4)} again`,
    );
    expect(onBranch()).toBe("main");
    expect(localBranches()).toEqual(["main"]);
    expect(originBranch(branch)).toBeDefined();
  });

  test("runs deploy.yml's migrate job before its deploy job, one deployment per environment at a time", async () => {
    const workflow = await deployWorkflow();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression
    const target = "${{ needs.check.outputs.target }}";
    const migrate = workflow.jobs?.migrate;
    const deploy = workflow.jobs?.deploy;

    for (const job of [migrate, deploy]) {
      expect(job?.environment).toBe(target);
      // actionlint is told to ignore queue:, which it does not know, so only this checks it.
      expect(job?.concurrency).toEqual({
        group: `deploy-${target}`,
        queue: "max",
      });
    }
    // The image check comes before the approval the migrate job waits for.
    expect([migrate?.needs ?? []].flat()).toEqual(
      expect.arrayContaining(["check", "image"]),
    );
    expect([deploy?.needs ?? []].flat()).toContain("migrate");
    expect(deploy?.if).toBe("needs.migrate.outputs.current == 'true'");
    expect(Object.keys(migrate?.outputs ?? {})).toContain("current");
    // Each job reads main again first; a later promotion skips what would migrate or deploy.
    for (const [job, name] of [
      [migrate, "Migrate"],
      [deploy, "Deploy"],
      [deploy, "Check the deployment"],
    ] as const) {
      expect(job?.steps?.find((step) => step.name === name)?.if).toBe(
        "steps.current.outputs.current == 'true'",
      );
    }
    // The migrate job runs the SHA's dependencies, which must not mint a Google Cloud token.
    // Without permissions: of its own it has the workflow's.
    const permissions = migrate?.permissions ?? workflow.permissions;
    expect(permissions).toBeObject();
    expect(permissions).not.toHaveProperty("id-token");
  });

  test("records in deploy.yml what promote reads: the migrations before they may run, the deployment once checked", async () => {
    const jobs = (await deployWorkflow()).jobs ?? {};
    const records = (kind: Kind) =>
      Object.entries(jobs).flatMap(([key, job]) =>
        (job.steps ?? [])
          .filter((step) =>
            new RegExp(
              `^make deploy-record ENV="\\$TARGET" SHA="\\$SHA" WRITE="\\$GITHUB_SHA" KIND=${kind}$`,
            ).test(step.run?.trim() ?? ""),
          )
          .map((step) => ({ key, job, step })),
      );
    const [migrating, ...moreMigrating] = records("migrating");
    const [deployed, ...moreDeployed] = records("deployed");
    expect(moreMigrating).toEqual([]);
    expect(moreDeployed).toEqual([]);
    if (migrating === undefined || deployed === undefined) {
      throw new Error("deploy.yml writes no migrating or no deployed record");
    }

    // The migrating record: in the image job, which the migrate job needs, and after the
    // image check, whose failure stops the migrations without a record. Nothing lets the
    // migrate job start once the image job failed: no if: of its own (which could say
    // always()), and no step of the image job may fail without failing it.
    expect(migrating?.key).toBe("image");
    expect([jobs.migrate?.needs ?? []].flat()).toContain("image");
    expect(jobs.migrate?.if).toBeUndefined();
    expect(migrating?.step.if).toBeUndefined();
    for (const job of [migrating.job, deployed.job]) {
      expect(job["continue-on-error"]).toBeUndefined();
      for (const step of job.steps ?? []) {
        expect(step["continue-on-error"]).toBeUndefined();
      }
    }
    const imageSteps = migrating?.job.steps ?? [];
    expect(
      imageSteps.findIndex(
        (step) => step.name === "The image of the SHA exists",
      ),
    ).toBeLessThan(imageSteps.indexOf(migrating?.step ?? {}));

    // The deployed record: the deploy job's last step, after the check of /api/health and
    // /api/health/db, so the job succeeds only with it.
    expect(deployed?.key).toBe("deploy");
    const deploySteps = deployed?.job.steps ?? [];
    expect(deploySteps.at(-1)).toBe(deployed?.step);
    expect(deploySteps.at(-2)?.name).toBe("Check the deployment");
    expect(deployed?.step.if).toBe("steps.current.outputs.current == 'true'");

    // Both run the Makefile of the commit deploy.yml runs for, never the SHA's, which may
    // be an older version without the records promote reads now: a checkout with no ref:,
    // in the folder the step runs in.
    for (const { job, step } of [migrating, deployed]) {
      const folder = step["working-directory"];
      const checkouts = (job.steps ?? []).filter(
        (each) =>
          each.uses?.startsWith("actions/checkout@") &&
          each.with?.path === folder,
      );
      expect(checkouts).toHaveLength(1);
      expect(checkouts[0]?.with?.ref).toBeUndefined();
    }
    expect(deployed.step["working-directory"]).toBeDefined();
    // The SHA's checkout at the top cleans its folder, write/ included, so the commit's
    // own checkout comes after it, and before the record.
    const order = (test: (step: (typeof deploySteps)[number]) => boolean) =>
      deploySteps.findIndex(test);
    const atTop = order(
      (step) =>
        step.uses?.startsWith("actions/checkout@") === true &&
        step.with?.path === undefined,
    );
    const ownCommit = order(
      (step) =>
        step.uses?.startsWith("actions/checkout@") === true &&
        step.with?.path === deployed.step["working-directory"],
    );
    expect(atTop).toBeGreaterThanOrEqual(0);
    expect(ownCommit).toBeGreaterThan(atTop);
    expect(ownCommit).toBeLessThan(deploySteps.indexOf(deployed.step));
  });

  test("keeps gh's JSON plain when the shell forces colour", () => {
    const result = promoteWith(
      { GCP_PROJECT_ID: PROJECT, CLICOLOR_FORCE: "1", GH_FORCE_TTY: "100%" },
      "staging",
    );

    expect(result.stderr).not.toContain("coloured output forced");
    expect(result.exitCode).toBe(0);
    expect(prCreated()).toBe(true);
  });

  test("exits 1 without an environment it knows", () => {
    const result = run("prod");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "usage: bun scripts/promote.ts <staging|production> [SHA]",
    );
  });

  test("exits 1 without a Google Cloud project", () => {
    const unset: Record<string, string> = {};
    for (const project of [unset, { GCP_PROJECT_ID: " " }]) {
      const result = promoteWith(project, "staging");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("promote: GCP_PROJECT_ID is empty");
    }
    expect(calls("gh")).toEqual([]);
  });
});

describe("make deploy-record", () => {
  beforeEach(() => {
    uploads.length = 0;
    storageStatus = 200;
  });

  test("creates the record promote reads, and never replaces one", async () => {
    // c3 written to staging; deploy.yml has written no record of it yet.
    const written = land("staging", c3, []);
    publish();
    const before = Math.floor(Date.now() / 1000) * 1000;
    for (const kind of DEPLOYED) {
      const result = await deployRecord(
        "ENV=staging",
        `SHA=${c3}`,
        `WRITE=${written}`,
        `KIND=${kind}`,
      );
      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    }
    const after = Date.now();

    expect(uploads).toHaveLength(2);
    // The token goes to curl through a header file, never in its arguments, which every
    // user of the machine can read.
    const curls = calls("curl");
    expect(curls).toHaveLength(2);
    for (const args of curls) expect(args.join(" ")).not.toContain(TOKEN);
    const names = uploads.map((upload) => {
      expect(upload).toMatchObject({
        method: "POST",
        path: `/upload/storage/v1/b/${PROJECT}-moonx-deploys/o`,
        authorization: `Bearer ${TOKEN}`,
        contentType: "application/octet-stream",
        body: "",
      });
      expect(upload.query.uploadType).toBe("media");
      // The writer may only create: a second record of the same name is refused.
      expect(upload.query.ifGenerationMatch).toBe("0");
      return upload.query.name ?? "";
    });
    names.forEach((name, index) => {
      const match =
        /^staging\/([0-9a-f]{40})\/([0-9a-f]{40})\/(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z-(\w+)$/.exec(
          name,
        );
      expect(match?.slice(1, 3)).toEqual([c3, written]);
      expect(match?.[7]).toBe(DEPLOYED[index]);
      const [, , , day, hours, minutes, seconds] = match ?? [];
      const time = Date.parse(`${day}T${hours}:${minutes}:${seconds}Z`);
      expect(time).toBeGreaterThanOrEqual(before);
      expect(time).toBeLessThanOrEqual(after);
    });

    // What it wrote is what promote reads: c3 is now the furthest version.
    const file = join(fake, "gcloud", "records-staging");
    fixture(
      "gcloud/records-staging",
      `${readFileSync(file, "utf8")}${names.join("\n")}\n`,
    );
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(prBody()).not.toContain("[!WARNING]");
    expect(prBody()).toContain(`- いちばん先まで出した版: \`${c3}\``);
  });

  test("fails when Cloud Storage refuses to replace a record", async () => {
    storageStatus = 412;
    const result = await deployRecord(
      "ENV=production",
      `SHA=${c2}`,
      `WRITE=${s2}`,
      "KIND=deployed",
    );

    expect(result.exitCode).not.toBe(0);
    expect(uploads).toHaveLength(1);
  });

  test.each([
    [
      [
        "ENV=prod",
        `SHA=${"a".repeat(40)}`,
        `WRITE=${"b".repeat(40)}`,
        "KIND=migrating",
      ],
      "ENV must be one of: staging production",
    ],
    [
      [`ENV=staging`, `WRITE=${"b".repeat(40)}`, "KIND=migrating"],
      "SHA is required",
    ],
    [
      ["ENV=staging", `SHA=${"a".repeat(40)}`, "KIND=migrating"],
      "WRITE is required",
    ],
    [
      [
        "ENV=staging",
        `SHA=${"a".repeat(40)}`,
        `WRITE=${"b".repeat(40)}`,
        "KIND=migrated",
      ],
      "KIND must be one of: migrating deployed",
    ],
    [
      [
        "ENV=staging",
        `SHA=${"a".repeat(40)}`,
        `WRITE=${"b".repeat(40)}`,
        "KIND=migrating deployed",
      ],
      "KIND must be one of: migrating deployed",
    ],
    [
      [
        "ENV=staging",
        "SHA=abc1234",
        `WRITE=${"b".repeat(40)}`,
        "KIND=migrating",
      ],
      "SHA and WRITE must be full commit SHAs",
    ],
    [
      [
        "ENV=staging",
        `SHA=${"a".repeat(40)}`,
        `WRITE=${"B".repeat(40)}`,
        "KIND=deployed",
      ],
      "SHA and WRITE must be full commit SHAs",
    ],
  ])("refuses %p and writes nothing", async (values, message) => {
    const result = await deployRecord(...values);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(uploads).toEqual([]);
  });

  test("checks SHA and WRITE before the shell can run anything in them", async () => {
    const marker = join(root, "ran");
    const result = await deployRecord(
      "ENV=staging",
      // A quote that would close the shell's quoting, then a command substitution.
      `SHA=a'\`touch ${marker}\`'b`,
      `WRITE=$$(touch ${marker})`,
      "KIND=migrating",
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("SHA and WRITE must be full commit SHAs");
    expect(existsSync(marker)).toBe(false);
    expect(uploads).toEqual([]);
  });
});
