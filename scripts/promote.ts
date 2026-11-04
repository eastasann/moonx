// make promote ENV=... [SHA=...]: opens the promotion pull request that writes one SHA to
// deploy/{env}/version, for a release and a rollback alike (SDD 2章「make ターゲット」,
// ADR-016, docs/04_deployment-procedure.md 4.2・5.1). It runs on the developer's machine,
// signed in to gh and gcloud, and checks with them what the pull request's CI cannot: that
// the SHA was built, and for production that it was deployed to staging.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MIGRATIONS_DIR } from "./db-check";
import {
  checkPromotion,
  commitOf,
  ENVIRONMENTS,
  type Environment,
  isAncestor,
  parseVersion,
  readFileAt,
  resolveCommit,
  versionFile,
  versionHistory,
  type Written,
} from "./promote-check";

/**
 * The job of .github/workflows/deploy.yml that deploys, and its step that runs make
 * deploy-api. The job ends early with success, skipping that step, when a later promotion
 * reached main first, so only a successful step shows that the run put its SHA on the
 * environment.
 */
export const DEPLOY_JOB = "deploy";
/** The step of {@link DEPLOY_JOB} that runs make deploy-api. */
export const DEPLOY_STEP = "Deploy";

const REGION = "asia-southeast1";
const JOURNAL = `${MIGRATIONS_DIR}/meta/_journal.json`;

interface Output {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface Run {
  databaseId: number;
  status: string;
  conclusion: string;
}

interface Step {
  name?: string;
  status?: string;
  conclusion?: string | null;
}

/** A job of one attempt of a run, as the REST API lists it. */
interface Job {
  name?: string;
  status?: string;
  conclusion?: string | null;
  run_attempt?: number;
  steps?: Step[];
}

interface ServiceStatus {
  latestReadyRevisionName?: string;
  traffic?: {
    revisionName?: string;
    latestRevision?: boolean;
    percent?: number;
  }[];
}

/** What deploy.yml did for the commit that wrote a version. */
type Deployment =
  | { kind: "deployed" }
  | { kind: "none" }
  | { kind: "unfinished" | "failed"; run: Run }
  | { kind: "undeployed"; run: Run; step: string | undefined };

type NotDeployed = Exclude<Deployment, { kind: "deployed" }>;

const short = (sha: string) => sha.slice(0, 7);

/**
 * gh's environment: CLICOLOR_FORCE=1 or GH_FORCE_TTY in the user's shell make gh colour and
 * indent its --json and --jq output, which then does not parse.
 */
const GH_ENV: Record<string, string | undefined> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== "GH_FORCE_TTY"),
  ),
  CLICOLOR_FORCE: "0",
  NO_COLOR: "1",
};

function spawn(
  cwd: string,
  command: string[],
  env?: Record<string, string | undefined>,
): Output {
  const result = Bun.spawnSync(command, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString().trim(),
  };
}

function must(
  cwd: string,
  command: string[],
  env?: Record<string, string | undefined>,
): string {
  const result = spawn(cwd, command, env);
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

const gh = (repo: string, args: string[]) =>
  must(repo, ["gh", ...args], GH_ENV);

function ghJson(repo: string, args: string[]): unknown {
  const text = gh(repo, args);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `gh ${args.join(" ")} printed no JSON (${(error as Error).message})`,
    );
  }
}

/** The runs of `workflow` for `commit`, newest first, as gh lists them. */
function runs(repo: string, workflow: string, commit: string): Run[] {
  const value = ghJson(repo, [
    "run",
    "list",
    `--workflow=${workflow}`,
    `--commit=${commit}`,
    "--json",
    "databaseId,conclusion,status",
    "--limit",
    "20",
  ]);
  if (!Array.isArray(value)) {
    throw new Error(`gh run list --workflow=${workflow} printed no list`);
  }
  return value as Run[];
}

/**
 * The jobs of every attempt of a run. gh run view shows only the latest attempt, and a
 * re-run (of a run superseded by a later promotion, or of a failed one) hides what the
 * earlier attempts did.
 */
function runJobs(repo: string, runId: number): Job[] {
  return gh(repo, [
    "api",
    `repos/{owner}/{repo}/actions/runs/${runId}/jobs?filter=all&per_page=100`,
    "--paginate",
    "--jq",
    ".jobs[]",
  ])
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      try {
        return JSON.parse(line) as Job;
      } catch (error) {
        throw new Error(
          `gh api .../runs/${runId}/jobs printed a line that is not JSON (${(error as Error).message})`,
        );
      }
    });
}

/** One attempt's deploy job and its Deploy step, and the run it belongs to. */
interface DeployAttempt {
  run: Run;
  job: Job;
  step: Step | undefined;
}

const started = (step: Step | undefined) =>
  step?.status === "in_progress" || step?.status === "completed";

/**
 * What deploy.yml did for the commits that wrote versions, over every run gh lists for a
 * commit and every attempt of each run. gh is asked once per commit and per run, and only as
 * far as an answer needs.
 */
interface Deployments {
  outcome(commit: string): Deployment;
  /** Some attempt's deploy job succeeded, its Deploy step included. */
  deployed(commit: string): boolean;
  /**
   * Some attempt's Deploy step started and was not skipped, whatever its conclusion. The
   * step runs make deploy-api, which applies all pending migrations in one transaction and
   * then deploys: a successful step applied them, and a failed, cancelled or unfinished one
   * may have.
   */
  mayHaveMigrated(commit: string): boolean;
  /** Some attempt's Deploy step succeeded, so the version's migrations are applied. */
  applied(commit: string): boolean;
  /** The attempt that shows best that the commit's migrations ran: its Deploy step succeeded if one did. */
  migratedIn(commit: string): DeployAttempt | undefined;
}

function deployments(repo: string): Deployments {
  const runsOf = new Map<string, Run[]>();
  const jobsOf = new Map<number, Job[]>();
  const listed = (commit: string) => {
    let found = runsOf.get(commit);
    if (found === undefined) {
      found = runs(repo, "deploy.yml", commit);
      runsOf.set(commit, found);
    }
    return found;
  };
  const jobs = (runId: number) => {
    let found = jobsOf.get(runId);
    if (found === undefined) {
      found = runJobs(repo, runId);
      jobsOf.set(runId, found);
    }
    return found;
  };
  /** The deploy jobs of `run`, latest attempt first. */
  const attempts = (run: Run): DeployAttempt[] =>
    jobs(run.databaseId)
      .filter((job) => job.name === DEPLOY_JOB)
      .sort((a, b) => (b.run_attempt ?? 0) - (a.run_attempt ?? 0))
      .map((job) => ({
        run,
        job,
        step: job.steps?.find((step) => step.name === DEPLOY_STEP),
      }));
  const find = (commit: string, test: (attempt: DeployAttempt) => boolean) => {
    for (const run of listed(commit)) {
      const match = attempts(run).find(test);
      if (match !== undefined) return match;
    }
    return undefined;
  };
  const deployed = (commit: string) =>
    find(
      commit,
      ({ job, step }) =>
        job.conclusion === "success" && step?.conclusion === "success",
    ) !== undefined;
  const mayHaveMigrated = (commit: string) =>
    find(
      commit,
      ({ step }) => started(step) && step?.conclusion !== "skipped",
    ) !== undefined;
  return {
    deployed,
    mayHaveMigrated,
    applied: (commit) =>
      find(commit, ({ step }) => step?.conclusion === "success") !== undefined,
    migratedIn: (commit) =>
      find(commit, ({ step }) => step?.conclusion === "success") ??
      find(
        commit,
        ({ step }) => started(step) && step?.conclusion !== "skipped",
      ),
    outcome: (commit) => {
      if (deployed(commit)) return { kind: "deployed" };
      const latest = listed(commit)[0];
      if (latest === undefined) return { kind: "none" };
      if (latest.status !== "completed") {
        return { kind: "unfinished", run: latest };
      }
      if (latest.conclusion !== "success")
        return { kind: "failed", run: latest };
      const deploy = attempts(latest)[0]?.step;
      return {
        kind: "undeployed",
        run: latest,
        step:
          deploy === undefined
            ? undefined
            : deploy.conclusion || deploy.status || "unknown",
      };
    },
  };
}

function describeInEnglish(outcome: NotDeployed, commit: string): string {
  const run =
    outcome.kind === "none"
      ? ""
      : `deploy.yml run ${outcome.run.databaseId} for ${short(commit)}`;
  switch (outcome.kind) {
    case "none":
      return `deploy.yml has not run for ${short(commit)}`;
    case "unfinished":
      return `${run} is still ${outcome.run.status}`;
    case "failed":
      return `${run} ended with ${outcome.run.conclusion}`;
    case "undeployed":
      if (outcome.step === undefined) {
        return `${run} has no ${DEPLOY_STEP} step in a ${DEPLOY_JOB} job`;
      }
      return outcome.step === "skipped"
        ? `${run} skipped its ${DEPLOY_STEP} step (a later promotion reached main first), so it deployed nothing`
        : `${run} ended with its ${DEPLOY_STEP} step ${outcome.step}`;
  }
}

function describeInJapanese(outcome: NotDeployed, commit: string): string {
  const run =
    outcome.kind === "none"
      ? ""
      : `${short(commit)} の deploy.yml（実行 ${outcome.run.databaseId}）`;
  switch (outcome.kind) {
    case "none":
      return `${short(commit)} の deploy.yml が動いていない`;
    case "unfinished":
      return `${run}がまだ終わっていない（${outcome.run.status}）`;
    case "failed":
      return `${run}が成功していない（${outcome.run.conclusion}）`;
    case "undeployed":
      if (outcome.step === undefined) {
        return `${run}の ${DEPLOY_JOB} のジョブに ${DEPLOY_STEP} のステップが無い`;
      }
      return outcome.step === "skipped"
        ? `${run}は、後の昇格が先に main に入ったので ${DEPLOY_STEP} のステップを飛ばした`
        : `${run}の ${DEPLOY_STEP} のステップが成功していない（${outcome.step}）`;
  }
}

/** The SHA make promote uses when SHA= is left out; stops when it would roll back. */
function defaultSha(
  repo: string,
  env: Environment,
  originMain: string,
  current: string | undefined,
  history: Written[],
): string {
  let sha: string;
  let source: string;
  if (env === "staging") {
    sha = must(repo, [
      "git",
      "log",
      "-1",
      "--first-parent",
      "--format=%H",
      originMain,
      "--",
      ".",
      ":(exclude)deploy",
    ]).trim();
    if (sha === "") {
      throw new Error("origin/main has no commit outside deploy/ to promote");
    }
    source = "the newest commit of origin/main outside deploy/";
  } else {
    const staging = versionFile("staging");
    const content = readFileAt(repo, originMain, staging);
    if (content === undefined) {
      throw new Error(
        `${staging} is not on origin/main: promote to staging first (make promote ENV=staging)`,
      );
    }
    const value = parseVersion(content);
    if (value === undefined || commitOf(repo, value) === undefined) {
      throw new Error(
        `${staging} on origin/main holds ${JSON.stringify(content.slice(0, 80))}, not the full SHA of a commit`,
      );
    }
    sha = value;
    source = `${staging} on origin/main`;
  }
  if (current !== undefined && sha !== current) {
    const ask = `give the version to deploy (make promote ENV=${env} SHA=<sha>)`;
    if (isAncestor(repo, sha, current)) {
      throw new Error(
        `the default SHA ${short(sha)} (${source}) is older than ${env}'s version ${short(current)}, so it would roll back: ${ask}`,
      );
    }
    if (
      history.some((written) => written.sha === sha) &&
      isAncestor(repo, current, sha)
    ) {
      throw new Error(
        `the default SHA ${short(sha)} (${source}) was rolled back in ${env} before: it is in ${versionFile(env)}'s history and newer than ${env}'s version ${short(current)}. To deploy it again, ${ask}`,
      );
    }
  }
  return sha;
}

/** How far the environment's versions reached, from its written history. */
interface Furthest {
  /** いちばん先まで出した版: the newest SHA in main whose write deploy.yml deployed. */
  deployed?: string;
  /**
   * The newest SHA in main whose migrations may be in the DB: `deployed`, or a newer SHA
   * whose write may have migrated (Deployments.mayHaveMigrated).
   */
  migrated?: string;
  /**
   * The write of `migrated` that shows best that its migrations ran, when `migrated` is not
   * `deployed`: one whose Deploy step succeeded if any did, else the newest that may have.
   */
  migratedBy?: string;
}

/**
 * The furthest versions (docs/04_deployment-procedure.md 4.1) among the SHAs `history`
 * holds that are in main. gh is asked from the newest SHA down, only until one deployed,
 * and then about the newer ones only until one may have migrated.
 */
function furthestVersions(
  repo: string,
  originMain: string,
  history: Written[],
  deploys: Deployments,
): Furthest {
  // rev-list's default order follows commit dates, which need not follow the history.
  const order = new Map(
    must(repo, ["git", "rev-list", "--topo-order", originMain])
      .split("\n")
      .filter((line) => line !== "")
      .map((sha, index) => [sha, index]),
  );
  const candidates = [...new Set(history.map(({ sha }) => sha))]
    .filter((sha) => order.has(sha))
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const writeOf = (sha: string, test: (commit: string) => boolean) =>
    history.find((written) => written.sha === sha && test(written.commit))
      ?.commit;
  const index = candidates.findIndex(
    (sha) => writeOf(sha, deploys.deployed) !== undefined,
  );
  const deployed = index === -1 ? undefined : candidates[index];
  for (const sha of index === -1 ? candidates : candidates.slice(0, index)) {
    const mayHave = writeOf(sha, deploys.mayHaveMigrated);
    if (mayHave !== undefined) {
      const migratedBy = writeOf(sha, deploys.applied) ?? mayHave;
      return { deployed, migrated: sha, migratedBy };
    }
  }
  return { deployed, migrated: deployed };
}

/** Whether `sha` is older than `version` in main's history; never when `version` is none. */
function olderThan(
  repo: string,
  sha: string,
  version: string | undefined,
): boolean {
  if (version === undefined || isAncestor(repo, version, sha)) return false;
  if (!isAncestor(repo, sha, version)) {
    throw new Error(
      `${sha} and ${version} are on separate lines of main's history`,
    );
  }
  return true;
}

/**
 * The previous version (docs/04_deployment-procedure.md 4.1): what was deployed just before
 * the furthest version was first deployed, walking back from that write.
 */
function previousVersion(
  history: Written[],
  furthest: string,
  deployed: (commit: string) => boolean,
): string | undefined {
  const first = history.findLastIndex(
    (written) => written.sha === furthest && deployed(written.commit),
  );
  return history.slice(first + 1).find((written) => deployed(written.commit))
    ?.sha;
}

/** The migration tags of the journal at `commit`, in journal order; none without a journal. */
function migrations(repo: string, commit: string | undefined): string[] {
  if (commit === undefined) return [];
  const text = readFileAt(repo, commit, JOURNAL);
  if (text === undefined) return [];
  let entries: unknown;
  try {
    entries = (JSON.parse(text) as { entries?: unknown } | null)?.entries;
  } catch (error) {
    throw new Error(
      `${JOURNAL} at ${short(commit)} is not valid JSON (${(error as Error).message})`,
    );
  }
  if (!Array.isArray(entries)) {
    throw new Error(`${JOURNAL} at ${short(commit)} has no entries array`);
  }
  return entries.flatMap((entry: unknown) => {
    const tag = (entry as { tag?: unknown } | null)?.tag;
    return typeof tag === "string" ? [tag] : [];
  });
}

/** The migrations at `to` that `from` does not have. */
function migrationsBetween(
  repo: string,
  from: string | undefined,
  to: string,
): string[] {
  const before = new Set(migrations(repo, from));
  return migrations(repo, to).filter((tag) => !before.has(tag));
}

/** `%h %s` of the first-parent commits in from..to, leaving out the promotion commits. */
function commitsBetween(repo: string, from: string, to: string): string[] {
  return must(repo, [
    "git",
    "log",
    "--first-parent",
    "--format=%h %s",
    `${from}..${to}`,
    "--",
    ".",
    ":(exclude)deploy",
  ])
    .split("\n")
    .filter((line) => line !== "");
}

/**
 * The SHAs Cloud Run sends traffic to for `env`, or why gcloud could not tell; the pull
 * request says either, so a failure here does not stop the promotion.
 */
function runningVersions(
  repo: string,
  env: Environment,
  project: string,
): { sha: string; percent: number }[] | string {
  const where = [`--region=${REGION}`, `--project=${project}`];
  const service = spawn(repo, [
    "gcloud",
    "run",
    "services",
    "describe",
    `moonx-api-${env}`,
    ...where,
    "--format=json",
  ]);
  if (service.exitCode !== 0) {
    return `gcloud run services describe: ${service.stderr}`;
  }
  let status: ServiceStatus | undefined;
  try {
    status = (JSON.parse(service.stdout) as { status?: ServiceStatus } | null)
      ?.status;
  } catch (error) {
    return `gcloud run services describe printed no JSON (${(error as Error).message})`;
  }
  const versions: { sha: string; percent: number }[] = [];
  for (const entry of status?.traffic ?? []) {
    if (entry.percent === undefined || entry.percent <= 0) continue;
    const revision = entry.latestRevision
      ? status?.latestReadyRevisionName
      : entry.revisionName;
    if (revision === undefined) {
      return `a traffic entry of moonx-api-${env} names no revision`;
    }
    const described = spawn(repo, [
      "gcloud",
      "run",
      "revisions",
      "describe",
      revision,
      ...where,
      "--format=value(spec.containers[0].image)",
    ]);
    if (described.exitCode !== 0) {
      return `gcloud run revisions describe ${revision}: ${described.stderr}`;
    }
    const image = described.stdout.trim();
    versions.push({
      sha: image.slice(image.lastIndexOf(":") + 1),
      percent: entry.percent,
    });
  }
  if (versions.length === 0) {
    return `moonx-api-${env} sends no traffic to any revision`;
  }
  return versions;
}

const list = (items: string[]) =>
  items.length === 0 ? ["なし"] : items.map((item) => `- ${item}`);

interface BodyInput {
  repo: string;
  env: Environment;
  project: string;
  originMain: string;
  sha: string;
  current: string | undefined;
  history: Written[];
  rollback: boolean;
}

/** The current version, and where the pull request's commit list and undo line start. */
interface Current {
  sha: string;
  writer: string;
  outcome: Deployment;
  /** What Cloud Run runs, or why gcloud could not tell; read only when `outcome` did not deploy. */
  running: { sha: string; percent: number }[] | string;
  /** `sha`, or the one version Cloud Run runs when deploy.yml did not deploy `sha`. */
  from: string;
  /** Whether `from` is what Cloud Run runs (it can be `sha`). */
  serving: boolean;
}

function inspectCurrent(
  repo: string,
  env: Environment,
  project: string,
  sha: string,
  history: Written[],
  deployedBy: (commit: string) => Deployment,
): Current {
  const writer = history.find((written) => written.sha === sha)?.commit;
  if (writer === undefined) {
    throw new Error(
      `no commit on origin/main wrote ${sha} to ${versionFile(env)}`,
    );
  }
  const outcome = deployedBy(writer);
  if (outcome.kind === "deployed") {
    return { sha, writer, outcome, running: [], from: sha, serving: false };
  }
  const running = runningVersions(repo, env, project);
  const versions = typeof running === "string" ? [] : running;
  const shas = new Set(versions.map((version) => version.sha));
  const total = versions.reduce((sum, version) => sum + version.percent, 0);
  // An image tag that is not a full SHA names no commit to count from.
  const only =
    shas.size === 1 && total === 100 ? parseVersion([...shas][0]) : undefined;
  const from = only === undefined ? undefined : commitOf(repo, only);
  return {
    sha,
    writer,
    outcome,
    running,
    from: from ?? sha,
    serving: from !== undefined,
  };
}

/** The warning at the top of the body when deploy.yml did not deploy the current version. */
function warningLines(
  env: Environment,
  now: Current,
  listsFrom: boolean,
): string[] {
  if (now.outcome.kind === "deployed") return [];
  const file = versionFile(env);
  const uses = listsFrom ? "コミットの一覧と戻し方" : "戻し方";
  return [
    "> [!WARNING]",
    `> ${env} の前回の deploy.yml は、今の版をデプロイしていない（${describeInJapanese(now.outcome, now.writer)}）。\`${file}\` は、Cloud Run に出ていない版を指していることがある。`,
    ">",
    ...(typeof now.running === "string"
      ? [
          `> Cloud Run の \`moonx-api-${env}\` で動いている版を gcloud で読めなかった（${now.running}）。`,
        ]
      : [
          `> Cloud Run の \`moonx-api-${env}\` で動いている版:`,
          ">",
          ...now.running.map(
            (version) => `> - \`${version.sha}\`（${version.percent}%）`,
          ),
        ]),
    ">",
    !now.serving
      ? `> 下の${uses}は、書かれている今の版 \`${short(now.sha)}\` を起点にする。この版は Cloud Run で動いていないことがある。`
      : now.from === now.sha
        ? `> Cloud Run で動いているのは書かれている今の版 \`${short(now.sha)}\` で、下の${uses}もこの版を起点にする。`
        : `> 下の${uses}は、書かれている今の版ではなく、Cloud Run で動いている \`${short(now.from)}\` を起点にする。`,
    "",
  ];
}

/**
 * The note at the top of the body when a newer version than the furthest one ran its
 * Deploy step without its deploy job succeeding, so its migrations are or may be applied.
 */
function cautionLines(
  migrated: string,
  migratedBy: string | undefined,
  deploys: Deployments,
): string[] {
  const attempt =
    migratedBy === undefined ? undefined : deploys.migratedIn(migratedBy);
  const what =
    migratedBy === undefined || attempt === undefined
      ? "deploy.yml"
      : `deploy.yml（${short(migratedBy)} の実行 ${attempt.run.databaseId}）`;
  const version = `\`${short(migrated)}\``;
  const text =
    attempt?.step?.conclusion === "success"
      ? `${version} の ${what}は ${DEPLOY_STEP} のステップが成功したが、${DEPLOY_JOB} のジョブは成功していない（${attempt.job.conclusion || attempt.job.status}）。${version} のマイグレーションは DB に当たっている（その版のリビジョンにはトラフィックが流れていないことがある）ので、下のマイグレーションの一覧はこの版までを数えに入れた。`
      : `${version} の ${what}は ${DEPLOY_STEP} のステップまで動いたが、そのステップが成功していない（${attempt?.step?.conclusion || attempt?.step?.status || "不明"}）。${version} のマイグレーションが DB に当たったかは分からないので、下のマイグレーションの一覧は、当たっていても当たっていなくても漏れが無いように作った。`;
  return ["> [!CAUTION]", `> ${text}`, ""];
}

/** The pull request's body (SDD 2章「make ターゲット」の promote): Japanese, like the repo's PRs. */
function prBody(input: BodyInput): string {
  const { repo, env, project, originMain, sha, current, history } = input;
  const file = versionFile(env);
  const deploys = deployments(repo);
  const now =
    current === undefined
      ? undefined
      : inspectCurrent(repo, env, project, current, history, deploys.outcome);
  const from = now?.from;
  const {
    deployed: furthest,
    migrated,
    migratedBy,
  }: Furthest = current === undefined
    ? {}
    : furthestVersions(repo, originMain, history, deploys);
  const behind = olderThan(repo, sha, furthest);
  const behindMigrated = olderThan(repo, sha, migrated);
  // A newer version than the furthest one may have migrated: each list counts it in.
  const doubt = migrated !== undefined && migrated !== furthest;
  // Older than `migrated` but not than `furthest` means `migrated` is not `furthest`.
  const absent = !behind && behindMigrated && migrated !== undefined;
  // from..sha is empty when the target is not newer than where that list starts (what
  // Cloud Run runs can be newer than the furthest version); the absent list says it then.
  const forward =
    from !== undefined &&
    !behind &&
    (!absent || (from !== sha && isAncestor(repo, from, sha)));
  const tags = (after: string | undefined, upTo: string) =>
    list(migrationsBetween(repo, after, upTo).map((tag) => `\`${tag}\``));

  const lines = [
    ...(now === undefined ? [] : warningLines(env, now, forward)),
    ...(doubt ? cautionLines(migrated, migratedBy, deploys) : []),
    "## 昇格",
    "",
    `- 環境: ${env}`,
    `- 今の版: ${current === undefined ? "なし（最初の昇格）" : `\`${current}\``}`,
    `- 出す版: \`${sha}\``,
    `- 向き: ${input.rollback ? "戻す" : "進める"}`,
  ];
  if (current !== undefined) {
    lines.push(
      `- いちばん先まで出した版: ${furthest === undefined ? "なし（デプロイまで済んだ版が無い）" : `\`${furthest}\``}`,
    );
  }
  if (doubt) {
    lines.push(`- マイグレーションが当たったかもしれない版: \`${migrated}\``);
  }
  lines.push("");

  const startLabel = from === current ? "今の版" : "Cloud Run で動いている版";
  const doubtLabel = doubt
    ? `マイグレーションが当たったかもしれない版 \`${short(migrated)}\``
    : "";
  if (from === undefined) {
    lines.push(
      "## マイグレーション（出す版にあるすべて。最初の昇格で当たるもの）",
      "",
      ...tags(undefined, sha),
      "",
    );
  } else if (behind && furthest !== undefined && migrated !== undefined) {
    const upTo = doubt
      ? doubtLabel
      : `いちばん先まで出した版 \`${short(furthest)}\``;
    const previous = previousVersion(history, furthest, deploys.deployed);
    const check =
      "04_deployment-procedure.md 5.1 の 3 のとおり、上のマイグレーションの一覧に contract（4.1 の表の右の列）が無いことを確かめる。";
    lines.push(
      `## コミット（出す版の次から、${upTo} まで。出す版に無いもの）`,
      "",
      ...list(commitsBetween(repo, sha, migrated)),
      "",
      `## マイグレーション（出す版の次から、${upTo} まで。DB に当たって${doubt ? "いるかもしれず" : "いて"}、出す版に無いもの）`,
      "",
      ...tags(sha, migrated),
      "",
      "## 直前の版",
      "",
      previous !== sha
        ? `出す版は、いちばん先まで出した版より古く、直前の版（04_deployment-procedure.md 4.1）${previous === undefined ? "は無い" : `の \`${previous}\` でもない`}。${check}新しい値を書き始めた変更はマイグレーションに出ないことがあるので、コミットの一覧でも確かめる。`
        : doubt
          ? `出す版は、いちばん先まで出した版より古く、直前の版（04_deployment-procedure.md 4.1）の \`${previous}\` なので、\`${short(furthest)}\` までのマイグレーションは確かめなくてよい。\`${short(furthest)}\` の次から \`${short(migrated)}\` までのもの（当たったかもしれないもの）は、04_deployment-procedure.md 5.1 の 3 のとおり contract（4.1 の表の右の列）が無いことを確かめる。新しい値を書き始めた変更はマイグレーションに出ないことがあるので、コミットの一覧でも確かめる。`
          : `出す版は、いちばん先まで出した版より古く、直前の版（04_deployment-procedure.md 4.1）の \`${previous}\` なので、5.1 の 3 で確かめなくてよい。`,
      "",
    );
  } else {
    if (forward) {
      lines.push(
        `## コミット（${startLabel} \`${short(from)}\` の次から、出す版まで）`,
        "",
        ...list(commitsBetween(repo, from, sha)),
        "",
      );
    }
    lines.push(
      furthest === undefined
        ? "## マイグレーション（出す版にあるすべて。この昇格で新しく当たるもの）"
        : `## マイグレーション（いちばん先まで出した版 \`${short(furthest)}\` の次から、出す版まで。この昇格で新しく当たるもの）`,
      "",
      ...tags(furthest, sha),
      "",
    );
    if (doubt) {
      lines.push(
        `この一覧には、\`${short(migrated)}\` のデプロイで当たったかもしれないものも入っている。`,
        "",
      );
    }
    if (absent && migrated !== undefined) {
      lines.push(
        `## コミット（出す版の次から、${doubtLabel} まで。出す版に無いもの）`,
        "",
        ...list(commitsBetween(repo, sha, migrated)),
        "",
        `## マイグレーション（出す版の次から、${doubtLabel} まで。DB に当たっているかもしれず、出す版に無いもの）`,
        "",
        ...tags(sha, migrated),
        "",
        `出す版は \`${short(migrated)}\` より古く、上の一覧のマイグレーションが当たった DB で動くとは確かめられていない。04_deployment-procedure.md 5.1 の 3 のとおり、この一覧に contract（4.1 の表の右の列）が無いことを確かめる。新しい値を書き始めた変更はマイグレーションに出ないことがあるので、出す版に無いコミットの一覧でも確かめる。`,
        "",
      );
    }
  }

  lines.push(
    "## 戻し方",
    "",
    from === undefined
      ? "最初の昇格なので、戻す先の版は無い。"
      : `${startLabel}に戻すときは \`make promote ENV=${env} SHA=${short(from)}\` を動かす。`,
    "",
    "## この PR のデプロイが済まなかったとき",
    "",
    `この PR の \`deploy.yml\` が検査で止まった・承認されなかった・失敗したときは、\`${file}\` が出ていない版を指したままになる。正しい SHA で新しい昇格の PR を出して直す（\`make promote\`。04_deployment-procedure.md 2章）。`,
  );
  if (input.rollback) {
    lines.push(
      "",
      "## 戻す理由",
      "",
      "<!-- 戻す理由と、出す版が直前の版でないときは 5.1 の 3 で確かめた結果を書く（04_deployment-procedure.md 5.1 の 4） -->",
    );
  }
  if (env === "production") {
    lines.push(
      "",
      "## staging での確認の結果",
      "",
      "<!-- staging で済ませたデプロイ後の確認（04_deployment-procedure.md 6章）の結果を書く（4.2） -->",
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Puts the user back on main and removes what this run made: the branch, and `newFile`, the
 * version file of a first promotion when the run wrote it.
 */
function backToMain(repo: string, branch: string, newFile: string | undefined) {
  must(repo, ["git", "switch", "--discard-changes", "main"]);
  // Switching drops the file once it is staged; a failed `git add` leaves it untracked or
  // ignored, which neither switching nor `git clean` removes.
  if (newFile !== undefined) rmSync(newFile, { force: true });
  if (commitOf(repo, `refs/heads/${branch}`) !== undefined) {
    must(repo, ["git", "branch", "--quiet", "-D", branch]);
  }
}

function promote(
  repo: string,
  env: Environment,
  given: string | undefined,
  project: string,
) {
  const git = (...args: string[]) => must(repo, ["git", ...args]);
  const file = versionFile(env);

  git("fetch", "--quiet", "--prune", "origin");
  // --untracked-files=all overrides status.showUntrackedFiles, which can hide them.
  if (git("status", "--porcelain", "--untracked-files=all") !== "") {
    throw new Error(
      "the work tree has changes (git status): commit, stash or remove them, then run make promote again",
    );
  }
  const head = spawn(repo, [
    "git",
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]);
  if (head.exitCode > 1) {
    throw new Error(`git symbolic-ref HEAD failed: ${head.stderr}`);
  }
  const onBranch = head.exitCode === 0 ? head.stdout.trim() : undefined;
  if (onBranch !== "main") {
    throw new Error(
      `${onBranch === undefined ? "HEAD is detached" : `on ${onBranch}`}, not main: git switch main && git pull, then run make promote again`,
    );
  }
  const main = resolveCommit(repo, "refs/heads/main");
  const originMain = resolveCommit(repo, "refs/remotes/origin/main");
  if (main !== originMain) {
    throw new Error(
      isAncestor(repo, main, originMain)
        ? "main is behind origin/main: git pull, then run make promote again"
        : "main has commits that origin/main does not: move them to a branch and make main match origin/main (main changes only through pull requests)",
    );
  }

  const content = readFileAt(repo, originMain, file);
  const current = parseVersion(content);
  if (
    content !== undefined &&
    (current === undefined || commitOf(repo, current) === undefined)
  ) {
    throw new Error(
      `${file} on origin/main holds ${JSON.stringify(content.slice(0, 80))}, not the full SHA of a commit: correct it in a pull request first`,
    );
  }
  const history = versionHistory(repo, originMain, env);
  const sha =
    given === undefined
      ? defaultSha(repo, env, originMain, current, history)
      : resolveCommit(repo, given);
  console.error(
    `promote: ${env} ${current === undefined ? "(no version yet)" : short(current)} -> ${short(sha)}`,
  );

  if (sha === current) {
    throw new Error(
      `${short(sha)} is already ${env}'s version (${file} on origin/main)`,
    );
  }
  const builds = runs(repo, "build.yml", sha);
  if (!builds.some((run) => run.conclusion === "success")) {
    throw new Error(
      builds.length === 0
        ? `build.yml has not run for ${sha}: it builds the commits that reach main`
        : `build.yml has not succeeded for ${sha} (${builds.map((run) => `run ${run.databaseId}: ${run.conclusion || run.status}`).join(", ")})`,
    );
  }
  const image = `${REGION}-docker.pkg.dev/${project}/moonx/api:${sha}`;
  const described = spawn(repo, [
    "gcloud",
    "artifacts",
    "docker",
    "images",
    "describe",
    image,
    "--format=value(image_summary.digest)",
  ]);
  if (described.exitCode !== 0) {
    throw new Error(
      `the image ${image} was not found (gcloud: ${described.stderr}). build.yml pushes it, and Artifact Registry keeps the newest 30 images and those under 90 days old (ADR-007)`,
    );
  }
  if (env === "production") {
    const writer = versionHistory(repo, originMain, "staging").find(
      (written) => written.sha === sha,
    );
    if (writer === undefined) {
      throw new Error(
        `${short(sha)} was never in ${versionFile("staging")} on origin/main: promote it to staging first (make promote ENV=staging SHA=${short(sha)})`,
      );
    }
    const outcome = deployments(repo).outcome(writer.commit);
    if (outcome.kind !== "deployed") {
      throw new Error(
        `the staging deployment of ${short(sha)} did not succeed: ${describeInEnglish(outcome, writer.commit)}. Put it on staging first: wait for or rerun that run while ${versionFile("staging")} still holds it, otherwise promote it to staging again (make promote ENV=staging SHA=${short(sha)})`,
      );
    }
  }

  const branch = `promote/${env}-${short(sha)}`;
  const local = commitOf(repo, `refs/heads/${branch}`) !== undefined;
  // The full ref name: a bare pattern would also match refs/heads/<anything>/<branch>.
  const remoteLookup = spawn(repo, [
    "git",
    "ls-remote",
    "--exit-code",
    "--heads",
    "origin",
    `refs/heads/${branch}`,
  ]);
  if (remoteLookup.exitCode !== 0 && remoteLookup.exitCode !== 2) {
    throw new Error(`git ls-remote origin failed: ${remoteLookup.stderr}`);
  }
  const remote = remoteLookup.exitCode === 0;
  if (local || remote) {
    const open = ghJson(repo, [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "open",
      "--json",
      "number,url",
    ]);
    if (!Array.isArray(open)) {
      throw new Error(`gh pr list --head ${branch} printed no list`);
    }
    if (open.length > 0) {
      throw new Error(
        `an open pull request already uses ${branch}: ${open.map((pr: { url?: string }) => pr.url).join(", ")}. Merge or close it, then run make promote again`,
      );
    }
    if (local) git("branch", "--quiet", "-D", branch);
    if (remote) git("push", "--quiet", "origin", "--delete", branch);
    console.error(`promote: deleted the leftover branch ${branch}`);
  }

  const rollback = current !== undefined && isAncestor(repo, sha, current);
  const subject = `chore(deploy): ${rollback ? "roll back" : "promote"} ${env} to ${short(sha)}`;
  git("switch", "--quiet", "-c", branch, "origin/main");
  const path = join(repo, file);
  const newFile = existsSync(path) ? undefined : path;
  let pushed = false;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${sha}\n`);
    git("add", "--", file);
    git("commit", "--quiet", "-m", subject);
    const problems = checkPromotion(repo, "origin/main");
    if (problems.length > 0) {
      throw new Error(
        `make promote-check BASE=origin/main fails:\n${problems.join("\n")}`,
      );
    }
    const body = prBody({
      repo,
      env,
      project,
      originMain,
      sha,
      current,
      history,
      rollback,
    });
    git("push", "--quiet", "--set-upstream", "origin", branch);
    pushed = true;
    const dir = mkdtempSync(join(tmpdir(), "moonx-promote-"));
    try {
      writeFileSync(join(dir, "body.md"), body);
      const opened = gh(repo, [
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        branch,
        "--title",
        subject,
        "--body-file",
        join(dir, "body.md"),
      ]);
      process.stdout.write(opened);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch (error) {
    let message = (error as Error).message;
    try {
      backToMain(repo, branch, newFile);
      message += pushed
        ? `\n${branch} is on origin without a pull request; you are back on main. Run make promote ENV=${env} SHA=${short(sha)} again (it replaces the branch)`
        : `\nYou are back on main, and the branch ${branch} is deleted.`;
    } catch (cleanup) {
      message += `\nCould not go back to main (${(cleanup as Error).message}): switch to main and delete ${branch} yourself`;
    }
    throw new Error(message);
  }
}

const isEnvironment = (value: string | undefined): value is Environment =>
  ENVIRONMENTS.some((env) => env === value);

if (import.meta.main) {
  const [env, given] = process.argv.slice(2);
  if (!isEnvironment(env)) {
    console.error(
      "usage: bun scripts/promote.ts <staging|production> [SHA] (make promote ENV=... [SHA=...])",
    );
    process.exit(1);
  }
  const project = process.env.GCP_PROJECT_ID?.trim() ?? "";
  if (project === "") {
    console.error(
      "promote: GCP_PROJECT_ID is empty: run it through make promote, which takes the project from gcloud config (or GCP_PROJECT_ID=...)",
    );
    process.exit(1);
  }
  try {
    // The pathspecs of git log here are relative to the work tree's top folder.
    const repo = must(process.cwd(), [
      "git",
      "rev-parse",
      "--show-toplevel",
    ]).trim();
    promote(repo, env, given === "" ? undefined : given, project);
  } catch (error) {
    console.error(`promote: ${(error as Error).message}`);
    process.exit(1);
  }
}
