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
import { DEPLOY_JOB, DEPLOY_STEP, MIGRATE_JOB, MIGRATE_STEP } from "./promote";

// Each test runs promote, which spawns git dozens of times: slow runners need more than 5 s.
setDefaultTimeout(30_000);

const STAGING = "deploy/staging/version";
const PRODUCTION = "deploy/production/version";
const MIGRATIONS = "packages/db/migrations";
const PROJECT = "moonx-test";
const IMAGE = `asia-southeast1-docker.pkg.dev/${PROJECT}/moonx/api`;
const PR_URL = "https://github.com/example/moonx/pull/42";
const UNDEPLOYED_NOTE = (file: string) =>
  `この PR の \`deploy.yml\` が検査で止まった・承認されなかった・失敗したときは、\`${file}\` が出ていない版を指したままになる。正しい SHA で新しい昇格の PR を出して直す（\`make promote\`。04_deployment-procedure.md 2章）。`;
const ROLLBACK_REASON =
  "<!-- 戻す理由と、出す版が直前の版でない・分からないときは 5.1 の 3 で確かめた結果を書く（04_deployment-procedure.md 5.1 の 4） -->";

/** What gh prints when the jobs of a run deleted after gh listed it answer 404. */
const NOT_FOUND = "gh: Not Found (HTTP 404)";

// gh and gcloud stand-ins: each logs its argv to calls.log and answers from the files the
// test writes under $FAKE_DIR.
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
"run list")
  file="$FAKE_DIR/gh/run-list-$(option --workflow "$@")-$(option --commit "$@").json"
  if [ -f "$file" ]; then cat "$file"; else echo '[]'; fi ;;
"api "*)
  # Only the call promote makes for every attempt's jobs; anything else is a regression.
  case "$#:$2:$3 $4 $5" in
  "5:repos/{owner}/{repo}/actions/runs/"*"/jobs?filter=all&per_page=100:--paginate --jq .jobs[]")
    id=\${2#'repos/{owner}/{repo}/actions/runs/'}
    file="$FAKE_DIR/gh/run-jobs-\${id%%/*}"
    if [ -f "$file.jsonl" ]; then cat "$file.jsonl"
    elif [ -f "$file.err" ]; then cat "$file.err" >&2; exit 1
    else echo "${NOT_FOUND}" >&2; exit 1; fi ;;
  *)
    echo "fake gh: unexpected $*" >&2; exit 2 ;;
  esac ;;
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

const FAKE_GCLOUD = `#!/usr/bin/env bash
{ printf 'gcloud'; printf '\\t%s' "$@"; printf '\\n'; } >> "$FAKE_DIR/calls.log"
if [ "$1 $2 $3 $4" = "artifacts docker images describe" ]; then
  if [ -f "$FAKE_DIR/gcloud/image-\${5##*:}" ]; then echo "sha256:0123"; exit 0; fi
  echo "ERROR: (gcloud.artifacts.docker.images.describe) Image not found: $5" >&2; exit 1
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

let runId = 100;

function buildRun(sha: string, conclusion = "success") {
  fixture(
    `gh/run-list-build.yml-${sha}.json`,
    JSON.stringify([{ databaseId: ++runId, conclusion, status: "completed" }]),
  );
}

/** A step of a fixture's job: completed and successful unless given. */
interface StepState {
  status?: string;
  /** null while it has not finished, as the jobs API has it. */
  conclusion?: string | null;
}

/** A job of a deploy.yml run, completed and successful unless given, and its Migrate or Deploy step. */
interface JobState extends StepState {
  /** null when the job never started (cancelled while it waited, say), so it lists no steps. */
  step?: StepState | null;
  /** The step's name when a run of another deploy.yml named it otherwise. */
  stepName?: string;
}

/** One attempt of a deploy.yml run, as the jobs API lists its jobs. */
interface Attempt {
  /** The image job's check failed, so GitHub skipped the jobs after it. */
  image?: "failure";
  /** The migrate job and its Migrate step; skipped as a whole after a failed image job. */
  migrate?: JobState;
  /**
   * The deploy job and its Deploy step; null for one the attempt does not list. Unless given,
   * it follows the migrate job as deploy.yml's needs: and if: make it: not listed while that
   * job has not completed, skipped as a whole (the jobs API lists it with no steps) when it
   * did not succeed or skipped its Migrate step, and otherwise completed and successful.
   */
  deploy?: JobState | null;
  /** A re-run of the deploy job alone: the attempt lists no check, image or migrate job. */
  alone?: boolean;
}

/**
 * A deploy.yml run: one attempt unless `attempts` is given. With `jobsError`, the jobs call
 * fails and gh prints that ({@link NOT_FOUND} for a run deleted after gh listed it).
 */
type RunFixture = Attempt & { attempts?: Attempt[]; jobsError?: string };

const concluded = (state: StepState) =>
  state.conclusion === undefined ? "success" : state.conclusion;

const skippedJob = (name: string, attempt: number) => ({
  name,
  run_attempt: attempt,
  status: "completed",
  conclusion: "skipped",
  steps: [],
});

function jobOf(name: string, attempt: number, state: JobState, step: string) {
  const inner = state.step === undefined ? {} : state.step;
  return {
    name,
    run_attempt: attempt,
    status: state.status ?? "completed",
    conclusion: concluded(state),
    steps:
      inner === null
        ? []
        : [
            { name: "Set up job", status: "completed", conclusion: "success" },
            {
              name: state.stepName ?? step,
              status: inner.status ?? "completed",
              conclusion: concluded(inner),
            },
          ],
  };
}

function deployJobOf(attempt: Attempt): JobState | "skipped" | null {
  if (attempt.deploy !== undefined) return attempt.deploy;
  if (attempt.alone) return {};
  if (attempt.image === "failure") return "skipped";
  const migrate = attempt.migrate ?? {};
  if ((migrate.status ?? "completed") !== "completed") return null;
  const step = migrate.step === undefined ? {} : migrate.step;
  return concluded(migrate) !== "success" ||
    step === null ||
    concluded(step) === "skipped"
    ? "skipped"
    : {};
}

/**
 * deploy.yml's runs for `commit`, newest first, as gh run list shows them, and the jobs of
 * each run's attempts as the jobs API lists them. gh run list shows the state of each job's
 * latest attempt: still running while one is, else failed (or cancelled) when one did not
 * succeed and was not skipped.
 */
function deployRuns(commit: string, ...given: RunFixture[]): number[] {
  const listed = given.map((run) => {
    const databaseId = ++runId;
    const attempts = run.attempts ?? [run];
    const jobs = attempts.flatMap((attempt, index) => {
      const number = index + 1;
      const deploy = deployJobOf(attempt);
      return [
        ...(attempt.alone
          ? []
          : [
              {
                name: "check",
                run_attempt: number,
                status: "completed",
                conclusion: "success",
                steps: [
                  { name: "Check", status: "completed", conclusion: "success" },
                ],
              },
              jobOf(
                "image",
                number,
                {
                  conclusion: attempt.image ?? "success",
                  step: { conclusion: attempt.image ?? "success" },
                },
                "The image of the SHA exists",
              ),
              attempt.image === "failure"
                ? skippedJob(MIGRATE_JOB, number)
                : jobOf(
                    MIGRATE_JOB,
                    number,
                    attempt.migrate ?? {},
                    MIGRATE_STEP,
                  ),
            ]),
        ...(deploy === null
          ? []
          : deploy === "skipped"
            ? [skippedJob(DEPLOY_JOB, number)]
            : [jobOf(DEPLOY_JOB, number, deploy, DEPLOY_STEP)]),
      ];
    });
    if (run.jobsError === undefined) {
      fixture(
        `gh/run-jobs-${databaseId}.jsonl`,
        jobs.map((job) => `${JSON.stringify(job)}\n`).join(""),
      );
    } else {
      fixture(`gh/run-jobs-${databaseId}.err`, run.jobsError);
    }
    const latest = [...new Map(jobs.map((job) => [job.name, job])).values()];
    const status =
      latest.find((job) => job.status !== "completed")?.status ?? "completed";
    return {
      databaseId,
      status,
      conclusion:
        status !== "completed"
          ? ""
          : (latest.find(
              (job) =>
                job.conclusion !== "success" && job.conclusion !== "skipped",
            )?.conclusion ?? "success"),
    };
  });
  fixture(`gh/run-list-deploy.yml-${commit}.json`, JSON.stringify(listed));
  return listed.map(({ databaseId }) => databaseId);
}

/** deploy.yml's one run for `commit`, with one attempt unless `attempts` is given. */
const deployRun = (commit: string, run: RunFixture = {}): number =>
  deployRuns(commit, run)[0] ?? 0;

/**
 * Makes deploy.yml's record of `commit` missing: no run listed, or a run whose jobs answer
 * 404. Returns how the body describes it.
 */
function loseRecord(commit: string, kind: "none" | "unreadable"): string {
  if (kind === "none") {
    rmSync(join(fake, `gh/run-list-deploy.yml-${commit}.json`));
    return `${short(commit)} の deploy.yml の実行が見つからない（まだ動いていないか、消された）`;
  }
  const id = deployRun(commit, { jobsError: NOT_FOUND });
  return `${short(commit)} の deploy.yml（実行 ${id}）のジョブを gh で読めなかった（${NOT_FOUND}）`;
}

/** The body's 直前の版 section when the write of `sha` has a missing record that `says`. */
const previousUnknown = (sha: string, says: string) =>
  `## 直前の版\n\n出す版は、いちばん先まで出した版より古く、直前の版（04_deployment-procedure.md 4.1）は分からない。\`${sha}\` を書いた ${says}ので、その版が出ていたかもしれない。04_deployment-procedure.md 5.1 の 3 のとおり、上のマイグレーションの一覧に contract（4.1 の表の右の列）が無いことを確かめる。新しい値を書き始めた変更はマイグレーションに出ないことがあるので、コミットの一覧でも確かめる。\n`;

/** A merged promotion pull request whose deploy.yml deployed: main's commit writing `sha`. */
function land(target: "staging" | "production", sha: string): string {
  write(`deploy/${target}/version`, `${sha}\n`);
  const written = commit(`chore(deploy): promote ${target} to ${short(sha)}`);
  deployRun(written);
  return written;
}

// main: c0 c1(0000_one) s1 c2(0001_two) c3(0002_three) c4 s2, where s1 and s2 write c1 and
// then c2 to deploy/staging/version and production has no version yet. Every c is built
// and has an image; s1's and s2's deploy.yml deployed. Git is slow to start, so this is
// built once and each test works on a copy.
let template: string;
let c0: string;
let c1: string;
let c2: string;
let c3: string;
let c4: string;
let s1: string;
let s2: string;
let s2Run: number;

beforeAll(() => {
  template = mkdtempSync(join(tmpdir(), "moonx-promote-"));
  use(template);
  for (const folder of ["bin", "home", "tmp", "fake"]) {
    mkdirSync(join(root, folder));
  }
  writeFileSync(join(root, "bin", "gh"), FAKE_GH);
  writeFileSync(join(root, "bin", "gcloud"), FAKE_GCLOUD);
  chmodSync(join(root, "bin", "gh"), 0o755);
  chmodSync(join(root, "bin", "gcloud"), 0o755);
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
  s2Run = runId;
  git("push", "-q", "-u", "origin", "main");
  for (const sha of [c0, c1, c2, c3, c4]) {
    buildRun(sha);
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

function calls(tool: "gh" | "gcloud"): string[][] {
  const log = join(fake, "calls.log");
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("\t"))
    .filter((call) => call[0] === tool)
    .map((call) => call.slice(1));
}

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
  steps?: { name?: string; if?: string; run?: string }[];
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

    expect(calls("gh")).toEqual([
      [
        "run",
        "list",
        "--workflow=build.yml",
        `--commit=${c4}`,
        "--json",
        "databaseId,conclusion,status",
        "--limit",
        "20",
      ],
      [
        "run",
        "list",
        "--workflow=deploy.yml",
        `--commit=${s2}`,
        "--json",
        "databaseId,conclusion,status",
        "--limit",
        "20",
      ],
      [
        "api",
        `repos/{owner}/{repo}/actions/runs/${s2Run}/jobs?filter=all&per_page=100`,
        "--paginate",
        "--jq",
        ".jobs[]",
      ],
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

  test.each(["none", "unreadable"] as const)(
    "does not know the previous version when an older write of the furthest one lost its record (%s)",
    (kind) => {
      // c4 may have been deployed first by the write whose record is lost, when c2 ran.
      const lost = land("staging", c4);
      const says = loseRecord(lost, kind);
      land("staging", c1);
      land("staging", c4);
      publish();
      const result = run("staging", c1);

      expect(result.exitCode).toBe(0);
      const body = prBody();
      expect(body).toContain(previousUnknown(c4, says));
      expect(body).not.toContain("確かめなくてよい");
    },
  );

  test("skips a write deploy.yml did not deploy when it looks for the previous version", () => {
    deployRun(land("staging", c3), { deploy: { conclusion: "failure" } });
    land("staging", c4);
    publish();
    const result = run("staging", c2);

    expect(result.exitCode).toBe(0);
    expect(prBody()).toContain(`- いちばん先まで出した版: \`${c4}\``);
    expect(prBody()).toContain(
      `直前の版（04_deployment-procedure.md 4.1）の \`${c2}\` なので、5.1 の 3 で確かめなくてよい。`,
    );
  });

  test.each(["none", "unreadable"] as const)(
    "does not know the previous version past a write with a missing record (%s)",
    (kind) => {
      // c3's write may have deployed c3 just before c4, so c2 may not be the previous one.
      const says = loseRecord(land("staging", c3), kind);
      land("staging", c4);
      publish();
      const result = run("staging", c2);

      expect(result.exitCode).toBe(0);
      const body = prBody();
      expect(body).not.toContain("[!CAUTION]");
      expect(body).toContain(`- いちばん先まで出した版: \`${c4}\``);
      expect(body).toContain(previousUnknown(c3, says));
    },
  );

  test("counts the furthest version as first deployed when its first write did not deploy", () => {
    // c4's first write stopped at the image check; c4's migrations reached the DB while c3
    // ran.
    deployRun(land("staging", c4), { image: "failure" });
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
    // X = c2 deployed, Y = c3 promoted but cancelled before it migrated, X promoted again;
    // Z = c4.
    const y = land("staging", c3);
    const yRun = deployRun(y, {
      migrate: { conclusion: "cancelled", step: null },
    });
    const again = land("staging", c2);
    const againRun = runId;
    publish();
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    const body = prBody();
    expect(body).not.toContain("[!WARNING]");
    expect(body).toContain(`- いちばん先まで出した版: \`${c2}\``);
    expect(body).toContain(
      `## コミット（今の版 \`${short(c2)}\` の次から、出す版まで）\n\n- ${abbrev(c4)} fix: four\n- ${abbrev(c3)} feat: three\n\n`,
    );
    expect(body).toContain(
      `## マイグレーション（いちばん先まで出した版 \`${short(c2)}\` の次から、出す版まで。この昇格で新しく当たるもの）\n\n- \`0002_three\`\n\n`,
    );
    // gh is asked from the newest written SHA down and stops at c2: s2 is never asked.
    const jobsOf = (id: number) =>
      `repos/{owner}/{repo}/actions/runs/${id}/jobs?filter=all&per_page=100`;
    expect(
      calls("gh")
        .filter(([command]) => command === "run" || command === "api")
        .map((call) => call.slice(0, 4)),
    ).toEqual([
      ["run", "list", "--workflow=build.yml", `--commit=${c4}`],
      ["run", "list", "--workflow=deploy.yml", `--commit=${again}`],
      ["api", jobsOf(againRun), "--paginate", "--jq"],
      ["run", "list", "--workflow=deploy.yml", `--commit=${y}`],
      ["api", jobsOf(yRun), "--paginate", "--jq"],
    ]);
  });

  describe("when a newer version's Migrate step ran and did not succeed", () => {
    // X = c2 deployed, then Y = c5 failed in its Migrate step (its migrations may be in the
    // DB), then X was promoted again. W = c1 is older, c3 lies between X and Y, Z = c6.
    let c5: string;
    let c6: string;
    let y: string;
    let yRun: number;

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
        buildRun(sha);
        fixture(`gcloud/image-${sha}`, "");
      }
      y = land("staging", c5);
      yRun = deployRun(y, {
        migrate: { conclusion: "failure", step: { conclusion: "failure" } },
      });
      land("staging", c2);
      publish();
    });

    const caution = () =>
      `> [!CAUTION]\n> \`${short(c5)}\` の deploy.yml（${short(y)} の実行 ${yRun}）は ${MIGRATE_STEP} のステップまで動いたが、そのステップが成功していない（failure）。\`${short(c5)}\` のマイグレーションが DB に当たったかは分からないので、下のマイグレーションの一覧は、当たっていても当たっていなくても漏れが無いように作った。\n\n## 昇格\n`;

    test("rolling back to an older version lists the migrations up to the one that may have migrated", () => {
      const result = run("staging", c1);

      expect(result.exitCode).toBe(0);
      expect(prTitle()).toBe(
        `chore(deploy): roll back staging to ${short(c1)}`,
      );
      const body = prBody();
      expect(body).toStartWith(caution());
      // Y's record is there, so c2 stays the furthest version without a doubt about it.
      expect(body).toContain(`- いちばん先まで出した版: \`${c2}\`\n`);
      expect(body).toContain(
        `- マイグレーションが当たったかもしれない版: \`${c5}\``,
      );
      expect(body).toContain(
        `## コミット（出す版の次から、マイグレーションが当たったかもしれない版 \`${short(c5)}\` まで。出す版に無いもの）\n\n- ${abbrev(c5)} feat: five\n- ${abbrev(c4)} fix: four\n- ${abbrev(c3)} feat: three\n- ${abbrev(c2)} feat: two\n\n`,
      );
      expect(body).toContain(
        `## マイグレーション（出す版の次から、マイグレーションが当たったかもしれない版 \`${short(c5)}\` まで。DB に当たっているかもしれず、出す版に無いもの）\n\n- \`0001_two\`\n- \`0002_three\`\n- \`0003_five\`\n\n`,
      );
      // c1 is the previous version of c2, but it never ran on c5's migrations.
      expect(body).toContain(
        `直前の版（04_deployment-procedure.md 4.1）の \`${c1}\` なので、\`${short(c2)}\` までのマイグレーションは確かめなくてよい。\`${short(c2)}\` の次から \`${short(c5)}\` までのもの（当たったかもしれないもの）は、04_deployment-procedure.md 5.1 の 3 のとおり contract（4.1 の表の右の列）が無いことを確かめる。新しい値を書き始めた変更はマイグレーションに出ないことがあるので、コミットの一覧でも確かめる。`,
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

    test.each<[string, RunFixture, boolean]>([
      [
        "a cancelled Migrate step",
        {
          migrate: {
            conclusion: "cancelled",
            step: { conclusion: "cancelled" },
          },
        },
        true,
      ],
      [
        "a Migrate step still running",
        {
          migrate: {
            status: "in_progress",
            conclusion: null,
            step: { status: "in_progress", conclusion: null },
          },
        },
        true,
      ],
      [
        "a skipped Migrate step, the deploy job skipped with it",
        { migrate: { step: { conclusion: "skipped" } } },
        false,
      ],
      [
        "a Migrate step still queued",
        {
          migrate: {
            status: "in_progress",
            conclusion: null,
            step: { status: "queued", conclusion: null },
          },
        },
        false,
      ],
      [
        "a migrate job skipped after a failed image check",
        { image: "failure" },
        false,
      ],
      [
        "a migrate job cancelled before it started",
        { migrate: { conclusion: "cancelled", step: null } },
        false,
      ],
      [
        "a Migrate step that succeeded before a deploy job that failed",
        { deploy: { conclusion: "failure", step: { conclusion: "failure" } } },
        true,
      ],
      [
        "a failed Migrate step re-run and cancelled before it started",
        {
          attempts: [
            {
              migrate: {
                conclusion: "failure",
                step: { conclusion: "failure" },
              },
            },
            { migrate: { conclusion: "cancelled", step: null } },
          ],
        },
        true,
      ],
      [
        "a failed Migrate step re-run and skipped",
        {
          attempts: [
            {
              migrate: {
                conclusion: "failure",
                step: { conclusion: "failure" },
              },
            },
            { migrate: { step: { conclusion: "skipped" } } },
          ],
        },
        true,
      ],
    ])("counts %s as may have migrated: %p", (_, deploy, counted) => {
      deployRun(y, deploy);
      const result = run("staging", c6);

      expect(result.exitCode).toBe(0);
      const body = prBody();
      expect(body.includes("> [!CAUTION]")).toBe(counted);
      expect(
        body.includes(`- マイグレーションが当たったかもしれない版: \`${c5}\``),
      ).toBe(counted);
      expect(body).toContain(`- いちばん先まで出した版: \`${c2}\``);
      expect(body).toContain(
        "この昇格で新しく当たるもの）\n\n- `0002_three`\n- `0003_five`\n- `0004_six`\n\n",
      );
    });

    test.each<[string, RunFixture]>([
      [
        "its deploy job failed",
        { deploy: { conclusion: "failure", step: { conclusion: "failure" } } },
      ],
      [
        "its deploy job skipped the Deploy step for a later promotion",
        { deploy: { step: { conclusion: "skipped" } } },
      ],
    ])(
      "says the migrations are applied when the Migrate step succeeded and %s",
      (_, deploy) => {
        const id = deployRun(y, deploy);
        const result = run("staging", c6);

        expect(result.exitCode).toBe(0);
        const body = prBody();
        expect(body).toStartWith(
          `> [!CAUTION]\n> \`${short(c5)}\` の deploy.yml（${short(y)} の実行 ${id}）は ${MIGRATE_STEP} のステップが成功したが、${DEPLOY_JOB} のジョブはどの試行でもデプロイしていない。\`${short(c5)}\` のマイグレーションは DB に当たっている（その版のリビジョンにはトラフィックが流れていないことがある）ので、下のマイグレーションの一覧はこの版までを数えに入れた。\n\n## 昇格\n`,
        );
        // Applied, but not deployed: the furthest version stays c2.
        expect(body).toContain(`- いちばん先まで出した版: \`${c2}\``);
        expect(body).toContain(
          `- マイグレーションが当たったかもしれない版: \`${c5}\``,
        );
      },
    );

    test("lists the commits absent from a target older than what Cloud Run runs", () => {
      // c5 written again; its Migrate and Deploy steps succeeded and the check after them
      // failed, and it now serves.
      const written = land("staging", c5);
      deployRun(written, { deploy: { conclusion: "failure" } });
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

    test("says the migrations are applied when an older write of the version applied them", () => {
      // y's Migrate step succeeded and its deploy job failed; c5's second write failed in
      // Migrate.
      const id = deployRun(y, {
        deploy: { conclusion: "failure", step: { conclusion: "failure" } },
      });
      deployRun(land("staging", c5), {
        migrate: { conclusion: "failure", step: { conclusion: "failure" } },
      });
      land("staging", c2);
      publish();
      const result = run("staging", c6);

      expect(result.exitCode).toBe(0);
      expect(prBody()).toStartWith(
        `> [!CAUTION]\n> \`${short(c5)}\` の deploy.yml（${short(y)} の実行 ${id}）は ${MIGRATE_STEP} のステップが成功したが、`,
      );
      expect(prBody()).toContain(
        `\`${short(c5)}\` のマイグレーションは DB に当たっている`,
      );
    });

    test("looks at every run gh lists for the commit", () => {
      deployRuns(
        y,
        { image: "failure" },
        { migrate: { conclusion: "failure", step: { conclusion: "failure" } } },
      );
      const result = run("staging", c6);

      expect(result.exitCode).toBe(0);
      expect(prBody()).toContain(
        `- マイグレーションが当たったかもしれない版: \`${c5}\``,
      );
    });

    test("counts a write as missing when a later run of it cannot be read", () => {
      // The newer run skipped its Migrate step; the older one was deleted after the listing.
      const [, deleted] = deployRuns(
        y,
        { migrate: { step: { conclusion: "skipped" } } },
        { jobsError: NOT_FOUND },
      );
      const result = run("staging", c6);

      expect(result.exitCode).toBe(0);
      expect(prBody()).toStartWith(
        `> [!CAUTION]\n> \`${short(c5)}\` の deploy.yml（${short(y)} の実行 ${deleted}）のジョブを gh で読めなかった（${NOT_FOUND}）。`,
      );
    });

    test("says the migrations are applied when an earlier attempt applied them and a re-run failed", () => {
      const id = deployRun(y, {
        attempts: [
          {
            deploy: { conclusion: "failure", step: { conclusion: "failure" } },
          },
          {
            migrate: { conclusion: "failure", step: { conclusion: "failure" } },
          },
        ],
      });
      const result = run("staging", c6);

      expect(result.exitCode).toBe(0);
      expect(prBody()).toStartWith(
        `> [!CAUTION]\n> \`${short(c5)}\` の deploy.yml（${short(y)} の実行 ${id}）は ${MIGRATE_STEP} のステップが成功したが、${DEPLOY_JOB} のジョブはどの試行でもデプロイしていない。\`${short(c5)}\` のマイグレーションは DB に当たっている`,
      );
    });

    // The DB cannot be rolled back, so a write whose record is missing may have migrated.
    describe.each<[string, () => void, () => string, string, () => string]>([
      [
        "no deploy.yml run",
        () => rmSync(join(fake, `gh/run-list-deploy.yml-${y}.json`)),
        () =>
          `\`${short(c5)}\` の deploy.yml（${short(y)} の実行）が見つからない（まだ動いていないか、消された）。`,
        "見つからない",
        () =>
          `${short(y)} の deploy.yml の実行が見つからない（まだ動いていないか、消された）`,
      ],
      [
        "a deploy.yml run whose jobs gh cannot read",
        () => rmSync(join(fake, `gh/run-jobs-${yRun}.jsonl`)),
        () =>
          `\`${short(c5)}\` の deploy.yml（${short(y)} の実行 ${yRun}）のジョブを gh で読めなかった（gh: Not Found (HTTP 404)）。`,
        "読めない",
        () =>
          `${short(y)} の deploy.yml（実行 ${yRun}）のジョブを gh で読めなかった（gh: Not Found (HTTP 404)）`,
      ],
    ])("when Y's write has %s", (_, lose, says, record, describes) => {
      beforeEach(lose);

      const missingCaution = () =>
        `> [!CAUTION]\n> ${says()}\`${short(c5)}\` のマイグレーションが DB に当たったかは分からないので、下のマイグレーションの一覧は、当たっていても当たっていなくても漏れが無いように作った。\n\n## 昇格\n`;
      // Y may have deployed c5, so c5 may be the furthest version.
      const furthestLine = () =>
        `- いちばん先まで出した版: \`${c2}\`（これより新しい \`${short(c5)}\` は deploy.yml の記録が${record}ので、出ていたかもしれない）\n`;

      test("rolling back below it lists the commits and migrations up to it, and does not know the previous version", () => {
        const result = run("staging", c1);

        expect(result.exitCode).toBe(0);
        const body = prBody();
        expect(body).not.toContain("確かめなくてよい");
        expect(body).toBe(
          [
            missingCaution(),
            "- 環境: staging",
            `- 今の版: \`${c2}\``,
            `- 出す版: \`${c1}\``,
            "- 向き: 戻す",
            furthestLine().trimEnd(),
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
            previousUnknown(c5, describes()).trimEnd(),
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

      test("promoting past it counts its migrations in", () => {
        const result = run("staging", c6);

        expect(result.exitCode).toBe(0);
        const body = prBody();
        expect(body).toStartWith(missingCaution());
        expect(body).toContain(furthestLine());
        expect(body).toContain(
          `- マイグレーションが当たったかもしれない版: \`${c5}\``,
        );
        expect(body).toContain(
          `## マイグレーション（いちばん先まで出した版 \`${short(c2)}\` の次から、出す版まで。この昇格で新しく当たるもの）\n\n- \`0002_three\`\n- \`0003_five\`\n- \`0004_six\`\n\nこの一覧には、\`${short(c5)}\` のデプロイで当たったかもしれないものも入っている。\n\n## 戻し方`,
        );
        expect(body).not.toContain("出す版に無いもの");
      });
    });

    test.each(["none", "unreadable"] as const)(
      "does not know the previous version past a write with a missing record (%s)",
      (kind) => {
        // c3's write may have deployed c3 just before c4, so c2 may not be the previous one.
        const says = loseRecord(land("staging", c3), kind);
        land("staging", c4);
        publish();
        const result = run("staging", c2);

        expect(result.exitCode).toBe(0);
        const body = prBody();
        expect(body).toStartWith(caution());
        expect(body).toContain(`- いちばん先まで出した版: \`${c4}\``);
        expect(body).toContain(
          `- マイグレーションが当たったかもしれない版: \`${c5}\``,
        );
        expect(body).toContain(previousUnknown(c3, says));
      },
    );

    test("does not know the previous version when another newer version's record is missing", () => {
      // Y's Migrate step failed; c3, also newer than c2, may have been deployed.
      const says = loseRecord(land("staging", c3), "none");
      land("staging", c2);
      publish();
      const result = run("staging", c1);

      expect(result.exitCode).toBe(0);
      const body = prBody();
      expect(body).toStartWith(caution());
      expect(body).toContain(
        `- いちばん先まで出した版: \`${c2}\`（これより新しい \`${short(c3)}\` は deploy.yml の記録が見つからないので、出ていたかもしれない）\n`,
      );
      expect(body).toContain(
        `- マイグレーションが当たったかもしれない版: \`${c5}\`\n`,
      );
      expect(body).toContain(previousUnknown(c3, says));
      expect(body).not.toContain("確かめなくてよい");
    });
  });

  describe.each<[string, RunFixture[]]>([
    [
      "an earlier attempt deployed it, before a skipped re-run",
      [{ attempts: [{}, { migrate: { step: { conclusion: "skipped" } } }] }],
    ],
    [
      "a re-run of its deploy job alone deployed it",
      [
        {
          attempts: [
            {
              deploy: {
                conclusion: "failure",
                step: { conclusion: "failure" },
              },
            },
            { alone: true },
          ],
        },
      ],
    ],
    [
      "an older run deployed it and gh cannot read the newer one's jobs",
      [{ jobsError: NOT_FOUND }, {}],
    ],
  ])("counts a version as deployed when %s", (_, runs) => {
    test.each(["staging", "production"] as const)("(%s)", (target) => {
      deployRuns(s2, ...runs);
      const result = run(target, ...(target === "staging" ? [] : [c2]));

      expect(result.exitCode).toBe(0);
      expect(prBody()).not.toContain("[!WARNING]");
      expect(prBody()).toContain(
        `- 出す版: \`${target === "staging" ? c4 : c2}\``,
      );
    });
  });

  test("counts a version as deployed when an older run deployed it", () => {
    deployRuns(s2, { image: "failure" }, {});
    const result = run("production");

    expect(result.exitCode).toBe(0);
    expect(prTitle()).toBe(`chore(deploy): promote production to ${short(c2)}`);
  });

  test.each<
    [
      string,
      (written: string) => { warning: string; caution: string; record: string },
    ]
  >([
    [
      "no deploy.yml run",
      (written) => {
        rmSync(join(fake, `gh/run-list-deploy.yml-${written}.json`));
        return {
          warning: `${short(written)} の deploy.yml の実行が見つからない（まだ動いていないか、消された）`,
          caution: `\`${short(c3)}\` の deploy.yml（${short(written)} の実行）が見つからない（まだ動いていないか、消された）。`,
          record: "見つからない",
        };
      },
    ],
    [
      "a deploy.yml run whose jobs gh cannot read",
      (written) => {
        const id = deployRun(written, { jobsError: NOT_FOUND });
        return {
          warning: `${short(written)} の deploy.yml（実行 ${id}）のジョブを gh で読めなかった（gh: Not Found (HTTP 404)）`,
          caution: `\`${short(c3)}\` の deploy.yml（${short(written)} の実行 ${id}）のジョブを gh で読めなかった（gh: Not Found (HTTP 404)）。`,
          record: "読めない",
        };
      },
    ],
  ])(
    "counts the current version with %s as not deployed, but maybe migrated",
    (_, lose) => {
      const written = land("staging", c3);
      const says = lose(written);
      publish();
      const result = run("staging");

      expect(result.exitCode).toBe(0);
      expect(prBody()).toBe(
        [
          "> [!WARNING]",
          `> staging の前回の deploy.yml が今の版をデプロイしたかは分からない（${says.warning}）。\`${STAGING}\` は、Cloud Run に出ていない版を指していることがある。`,
          ">",
          "> Cloud Run の `moonx-api-staging` で動いている版を gcloud で読めなかった（gcloud run services describe: ERROR: (gcloud.run.services.describe) Cannot find service [moonx-api-staging]）。",
          ">",
          `> 下のコミットの一覧と戻し方は、書かれている今の版 \`${short(c3)}\` を起点にする。この版は Cloud Run で動いていないことがある。`,
          "",
          "> [!CAUTION]",
          `> ${says.caution}\`${short(c3)}\` のマイグレーションが DB に当たったかは分からないので、下のマイグレーションの一覧は、当たっていても当たっていなくても漏れが無いように作った。`,
          "",
          "## 昇格",
          "",
          "- 環境: staging",
          `- 今の版: \`${c3}\``,
          `- 出す版: \`${c4}\``,
          "- 向き: 進める",
          `- いちばん先まで出した版: \`${c2}\`（これより新しい \`${short(c3)}\` は deploy.yml の記録が${says.record}ので、出ていたかもしれない）`,
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
    },
  );

  test.each<[string, "none" | "unreadable" | undefined, string, string]>([
    [
      "no write's record is missing",
      undefined,
      "なし（デプロイまで済んだ版が無い）",
      "この昇格で新しく当たるもの",
    ],
    [
      "a write has no deploy.yml run",
      "none",
      "分からない（deploy.yml の記録が見つからない・読めない版がある）",
      "DB に当たっているかもしれないものも入る",
    ],
    [
      "a write's deploy.yml run cannot be read",
      "unreadable",
      "分からない（deploy.yml の記録が見つからない・読めない版がある）",
      "DB に当たっているかもしれないものも入る",
    ],
  ])(
    "without a deployed version, says what it knows when %s",
    (_, kind, furthest, title) => {
      deployRun(s1, { image: "failure" });
      if (kind === undefined) deployRun(s2, { image: "failure" });
      else loseRecord(s2, kind);
      const result = run("staging");

      expect(result.exitCode).toBe(0);
      const body = prBody();
      expect(body).toContain(`- いちばん先まで出した版: ${furthest}\n`);
      expect(body).toContain(
        `## マイグレーション（出す版にあるすべて。${title}）\n\n- \`0000_one\`\n- \`0001_two\`\n- \`0002_three\`\n\n`,
      );
    },
  );

  test("puts gh's error on one line in the body", () => {
    const written = land("staging", c3);
    const id = deployRun(written, {
      jobsError: `${NOT_FOUND}\n  https://docs.github.com/rest/actions/workflow-jobs\n`,
    });
    publish();
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(prBody()).toContain(
      `> staging の前回の deploy.yml が今の版をデプロイしたかは分からない（${short(written)} の deploy.yml（実行 ${id}）のジョブを gh で読めなかった（${NOT_FOUND} https://docs.github.com/rest/actions/workflow-jobs））。`,
    );
  });

  test.each([
    "gh: Server Error (HTTP 500)",
    "gh: Bad credentials (HTTP 401)\nTry authenticating with:  gh auth login",
  ])(
    "stops when gh cannot read a run's jobs for another reason than 404: %s",
    (error) => {
      const id = deployRun(s2, { jobsError: error });
      const result = run("staging");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        `promote: gh api repos/{owner}/{repo}/actions/runs/${id}/jobs?filter=all&per_page=100 --paginate --jq .jobs[] failed: ${error}`,
      );
      expectNothingMade(`promote/staging-${short(c4)}`);
    },
  );

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
    expect(calls("gh")).toContainEqual([
      "run",
      "list",
      "--workflow=deploy.yml",
      `--commit=${s2}`,
      "--json",
      "databaseId,conclusion,status",
      "--limit",
      "20",
    ]);
    expect(calls("gh")).toContainEqual([
      "api",
      `repos/{owner}/{repo}/actions/runs/${s2Run}/jobs?filter=all&per_page=100`,
      "--paginate",
      "--jq",
      ".jobs[]",
    ]);
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

  test.each<[string, RunFixture, string]>([
    [
      "was superseded, skipping the Deploy step",
      { deploy: { step: { conclusion: "skipped" } } },
      `skipped its ${DEPLOY_STEP} step (a later promotion reached main first), so it deployed nothing`,
    ],
    [
      "was superseded, skipping the Migrate step and the deploy job",
      { migrate: { step: { conclusion: "skipped" } } },
      `skipped its ${MIGRATE_STEP} step (a later promotion reached main first), so it deployed nothing`,
    ],
    [
      "re-ran the deploy job alone after its Deploy step failed and was superseded then",
      {
        attempts: [
          {
            deploy: { conclusion: "failure", step: { conclusion: "failure" } },
          },
          { alone: true, deploy: { step: { conclusion: "skipped" } } },
        ],
      },
      `skipped its ${DEPLOY_STEP} step (a later promotion reached main first), so it deployed nothing`,
    ],
    ["failed", { deploy: { conclusion: "failure" } }, "ended with failure"],
    [
      "is still running",
      { deploy: { status: "in_progress", conclusion: null } },
      "is still in_progress",
    ],
    [
      "has no Deploy step (a run of a deploy.yml that named it otherwise)",
      { deploy: { stepName: "Roll out" } },
      `has no ${DEPLOY_STEP} step in a ${DEPLOY_JOB} job`,
    ],
  ])("refuses production when staging's deploy.yml %s", (_, deploy, reason) => {
    const id = deployRun(s2, deploy);
    const result = run("production");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `the staging deployment of ${short(c2)} is not known to have succeeded: deploy.yml run ${id} for ${short(s2)} ${reason}.`,
    );
    expectNothingMade(`promote/production-${short(c2)}`);
  });

  test("refuses production when no deploy.yml run is found for staging's promotion", () => {
    rmSync(join(fake, `gh/run-list-deploy.yml-${s2}.json`));
    const result = run("production");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `the staging deployment of ${short(c2)} is not known to have succeeded: no deploy.yml run was found for ${short(s2)} (it has not run yet, or its run was deleted).`,
    );
    expectNothingMade(`promote/production-${short(c2)}`);
  });

  test("refuses production when gh cannot read the jobs of staging's deploy.yml run, and says to run it again", () => {
    const id = deployRun(s2, { jobsError: NOT_FOUND });
    const result = run("production");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `the staging deployment of ${short(c2)} is not known to have succeeded: gh could not read the jobs of deploy.yml run ${id} for ${short(s2)} (${NOT_FOUND}). The run may have been deleted after gh listed it: run make promote ENV=production SHA=${short(c2)} again, and if no run of ${short(s2)} is left, promote it to staging again (make promote ENV=staging SHA=${short(c2)})`,
    );
    expectNothingMade(`promote/production-${short(c2)}`);
  });

  test("checks the newest staging promotion of the SHA", () => {
    land("staging", c4);
    const again = land("staging", c2);
    const id = deployRun(again, { deploy: { conclusion: "failure" } });
    publish();
    const result = run("production");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `deploy.yml run ${id} for ${short(again)} ended with failure.`,
    );
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

  test.each([
    [
      "has not run",
      () => rmSync(join(fake, `gh/run-list-build.yml-${c4}.json`)),
      () =>
        `build.yml has not run for ${c4}: it builds the commits that reach main`,
    ],
    [
      "failed",
      () => buildRun(c4, "failure"),
      () => `build.yml has not succeeded for ${c4} (run ${runId}: failure)`,
    ],
  ])("refuses a SHA whose build.yml %s", (_, setup, message) => {
    setup();
    const result = run("staging");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(message());
    expect(calls("gcloud")).toEqual([]);
    expectNothingMade(`promote/staging-${short(c4)}`);
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
    const id = deployRun(s2, { image: "failure" });
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
        `> staging の前回の deploy.yml は、今の版をデプロイしていない（${short(s2)} の deploy.yml（実行 ${id}）が成功していない（failure））。\`${STAGING}\` は、Cloud Run に出ていない版を指していることがある。`,
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
    rmSync(join(fake, `gh/run-list-deploy.yml-${s2}.json`));
    const result = run("staging");

    expect(result.exitCode).toBe(0);
    expect(prBody()).toStartWith(
      [
        "> [!WARNING]",
        `> staging の前回の deploy.yml が今の版をデプロイしたかは分からない（${short(s2)} の deploy.yml の実行が見つからない（まだ動いていないか、消された））。\`${STAGING}\` は、Cloud Run に出ていない版を指していることがある。`,
        ">",
        "> Cloud Run の `moonx-api-staging` で動いている版を gcloud で読めなかった（gcloud run services describe: ERROR: (gcloud.run.services.describe) Cannot find service [moonx-api-staging]）。",
        ">",
        `> 下のコミットの一覧と戻し方は、書かれている今の版 \`${short(c2)}\` を起点にする。この版は Cloud Run で動いていないことがある。`,
        "",
      ].join("\n"),
    );
  });

  test("keeps gcloud's message on one line of the warning's quote", () => {
    rmSync(join(fake, `gh/run-list-deploy.yml-${s2}.json`));
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
    const written = land("staging", c3);
    const id = deployRun(written, { image: "failure" });
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
        `> staging の前回の deploy.yml は、今の版をデプロイしていない（${short(written)} の deploy.yml（実行 ${id}）が成功していない（failure））。\`${STAGING}\` は、Cloud Run に出ていない版を指していることがある。`,
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

  test.each([
    [MIGRATE_JOB, MIGRATE_STEP, /^make db-migrate(\s|$)/],
    [DEPLOY_JOB, DEPLOY_STEP, /^make deploy-api(\s|$)/],
  ])(
    "names the job %s of deploy.yml and its step %s that runs %p",
    async (key, stepName, command) => {
      const job = (await deployWorkflow()).jobs?.[key];
      const step = job?.steps?.find(({ name }) => name === stepName);

      expect(job).toBeDefined();
      // The jobs API reports a job by its name:, which is its key only when name: is absent.
      expect(job?.name ?? key).toBe(key);
      expect(step?.run?.trim()).toMatch(command);
    },
  );

  test("runs deploy.yml's migrate job before its deploy job, one deployment per environment at a time", async () => {
    const workflow = await deployWorkflow();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression
    const target = "${{ needs.check.outputs.target }}";
    const migrate = workflow.jobs?.[MIGRATE_JOB];
    const deploy = workflow.jobs?.[DEPLOY_JOB];

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
    expect([deploy?.needs ?? []].flat()).toContain(MIGRATE_JOB);
    expect(deploy?.if).toBe(`needs.${MIGRATE_JOB}.outputs.current == 'true'`);
    expect(Object.keys(migrate?.outputs ?? {})).toContain("current");
    // Each job reads main again first; a later promotion skips what would migrate or deploy.
    for (const [job, name] of [
      [migrate, MIGRATE_STEP],
      [deploy, DEPLOY_STEP],
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
