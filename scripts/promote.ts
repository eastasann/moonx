// make promote ENV=... [SHA=...]: opens the promotion pull request that writes one SHA to
// deploy/{env}/version, for a release and a rollback alike (SDD 2章「make ターゲット」,
// ADR-016, docs/04_deployment-procedure.md 4.2・5.1). It runs on the developer's machine,
// signed in to gh and gcloud, and checks with them what the pull request's CI cannot: that
// the SHA was built, and for production that it was deployed to staging. Both come from
// records that do not expire, unlike GitHub's workflow runs (ADR-016): the image build.yml
// pushes after its tests, and the records deploy.yml writes to Cloud Storage (make
// deploy-record).

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

const REGION = "asia-southeast1";
const JOURNAL = `${MIGRATIONS_DIR}/meta/_journal.json`;

/**
 * The name of a record of deploy.yml, as make deploy-record writes it:
 * `{env}/{SHA}/{write}/{UTC time}-{kind}`, where the write is the commit of main that wrote
 * SHA to deploy/{env}/version (deploy.yml runs for it). `migrating` is written before the
 * migrate job may start, `deployed` after the deployment's check passed.
 */
const RECORD_NAME =
  /^(staging|production)\/([0-9a-f]{40})\/([0-9a-f]{40})\/\d{4}-\d{2}-\d{2}T\d{6}Z-(migrating|deployed)$/;

interface Output {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface ServiceStatus {
  latestReadyRevisionName?: string;
  traffic?: {
    revisionName?: string;
    latestRevision?: boolean;
    percent?: number;
  }[];
}

/** What deploy.yml recorded for one write of a version file. */
interface Recorded {
  migrating: boolean;
  deployed: boolean;
}

/**
 * What deploy.yml did for a write, from its records: deployed the SHA, or recorded that
 * its migrations may run and no deployment, or wrote nothing.
 */
type Deployment = "deployed" | "migrating" | "none";

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

/** deploy.yml's records of one environment, by the write they belong to. */
interface Records {
  deployment(commit: string): Deployment;
  /** The records name this write's SHA as deployed. */
  deployed(commit: string): boolean;
  /** The records name this write's SHA as one whose migrations may run, or deployed. */
  migrating(commit: string): boolean;
}

/**
 * deploy.yml's records of `env` (make deploy-record), read with the user's gcloud. Each
 * must name a write of `history` (the environment's writes on origin/main) and the SHA that
 * write wrote; anything else stops, as does a failure to list them: a record that cannot be
 * placed may be the one that shows a version's migrations reached the DB (ADR-016).
 */
function readRecords(
  repo: string,
  env: Environment,
  project: string,
  history: Written[],
): Records {
  const url = `gs://${project}-moonx-deploys/${env}/**`;
  // --exhaustive: without it gcloud stops at an empty page that has a next one, warns and
  // succeeds, which would leave records out.
  const command = [
    "gcloud",
    "storage",
    "objects",
    "list",
    url,
    "--exhaustive",
    "--format=value(name)",
  ];
  const listed = spawn(repo, command);
  if (listed.exitCode !== 0) {
    throw new Error(
      `could not read deploy.yml's records of ${env} (${command.join(" ")}: ${listed.stderr})`,
    );
  }
  const wrote = new Map(history.map(({ commit, sha }) => [commit, sha]));
  const found = new Map<string, Recorded>();
  for (const name of listed.stdout.split("\n").filter((line) => line !== "")) {
    const match = RECORD_NAME.exec(name);
    if (match === null || match[1] !== env) {
      throw new Error(
        `${url} holds ${name}, which is not a record make deploy-record writes for ${env}`,
      );
    }
    const [, , sha = "", write = "", kind] = match;
    const written = wrote.get(write);
    if (written === undefined) {
      throw new Error(
        `the record ${name} belongs to ${short(write)}, which did not write ${versionFile(env)} on origin/main. deploy.yml records the commit it runs for, which is the write when main takes squash merges alone; if a promotion reached main after this run fetched origin, run make promote again`,
      );
    }
    if (written !== sha) {
      throw new Error(
        `the record ${name} says ${short(write)} wrote ${short(sha)} to ${versionFile(env)}, but it wrote ${short(written)} on origin/main`,
      );
    }
    const recorded = found.get(write) ?? { migrating: false, deployed: false };
    if (kind === "deployed") recorded.deployed = true;
    else recorded.migrating = true;
    found.set(write, recorded);
  }
  const deployed = (commit: string) => found.get(commit)?.deployed === true;
  // Writing the deployed record follows the migrating one in every run, so either shows
  // that the migrations may have run.
  const migrating = (commit: string) => found.get(commit) !== undefined;
  return {
    deployed,
    migrating,
    deployment: (commit) =>
      deployed(commit) ? "deployed" : migrating(commit) ? "migrating" : "none",
  };
}

function describeInEnglish(
  deployment: Exclude<Deployment, "deployed">,
  commit: string,
): string {
  return deployment === "none"
    ? `deploy.yml wrote no record for ${short(commit)} (it stopped at its check or image job, or has not got that far)`
    : `deploy.yml recorded that ${short(commit)} may migrate, and no deployment of it (it waits or stopped in its migrate or deploy job, or a later promotion reached main first)`;
}

function describeInJapanese(
  deployment: Exclude<Deployment, "deployed">,
  commit: string,
): string {
  return deployment === "none"
    ? `${short(commit)} の deploy.yml の記録が無い（検査かイメージのジョブで止まったか、まだそこまで動いていない）`
    : `${short(commit)} の deploy.yml は、マイグレーションの前の記録を書いたが、出した記録を書いていない（マイグレーションかデプロイのジョブを待っている・そこで止まった、または後の昇格に追い越された）`;
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

/**
 * マイグレーションが当たったかもしれない版 (docs/04_deployment-procedure.md 4.1), and the
 * newest write of it whose migrating record shows that.
 */
interface MayHaveMigrated {
  sha: string;
  writer: string;
}

/** How far the environment's versions reached, from its written history and records. */
interface Furthest {
  /** いちばん先まで出した版: the newest SHA in main with a write deploy.yml deployed. */
  deployed?: string;
  /** The newest SHA in main newer than `deployed` with a write that may have migrated. */
  mayHaveMigrated?: MayHaveMigrated;
}

/**
 * The furthest versions (docs/04_deployment-procedure.md 4.1) among the SHAs `history`
 * holds that are in main.
 */
function furthestVersions(
  repo: string,
  originMain: string,
  history: Written[],
  records: Records,
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
    (sha) => writeOf(sha, records.deployed) !== undefined,
  );
  const deployed = index === -1 ? undefined : candidates[index];
  const newer = index === -1 ? candidates : candidates.slice(0, index);
  for (const sha of newer) {
    const writer = writeOf(sha, records.migrating);
    if (writer !== undefined) {
      return { deployed, mayHaveMigrated: { sha, writer } };
    }
  }
  return { deployed };
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
 * the furthest version was first deployed, walking back from that write; none when no
 * write before it deployed.
 */
function previousVersion(
  history: Written[],
  furthest: string,
  records: Records,
): string | undefined {
  const first = history.findLastIndex(
    (written) => written.sha === furthest && records.deployed(written.commit),
  );
  return history
    .slice(first + 1)
    .find((written) => records.deployed(written.commit))?.sha;
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
  deployment: Deployment;
  /** What Cloud Run runs, or why gcloud could not tell; read only when not deployed. */
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
  records: Records,
): Current {
  const writer = history.find((written) => written.sha === sha)?.commit;
  if (writer === undefined) {
    throw new Error(
      `no commit on origin/main wrote ${sha} to ${versionFile(env)}`,
    );
  }
  const deployment = records.deployment(writer);
  if (deployment === "deployed") {
    return {
      sha,
      writer,
      deployment,
      running: [],
      from: sha,
      serving: false,
    };
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
    deployment,
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
  if (now.deployment === "deployed") return [];
  const file = versionFile(env);
  const uses = listsFrom ? "コミットの一覧と戻し方" : "戻し方";
  return [
    "> [!WARNING]",
    `> ${env} の前回の deploy.yml には、今の版を出した記録が無い（${describeInJapanese(now.deployment, now.writer)}）。\`${file}\` は、Cloud Run に出ていない版を指していることがある。`,
    ">",
    ...(typeof now.running === "string"
      ? [
          // gcloud's message can span lines, which would end the quote.
          `> Cloud Run の \`moonx-api-${env}\` で動いている版を gcloud で読めなかった（${now.running.replace(/\s*\n\s*/g, " ")}）。`,
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
 * The note at the top of the body when a newer version than the furthest one may have
 * migrated: deploy.yml recorded that its migrations may run, and never deployed it.
 */
function cautionLines({ sha, writer }: MayHaveMigrated): string[] {
  const version = `\`${short(sha)}\``;
  return [
    "> [!CAUTION]",
    `> ${version} の deploy.yml（${short(writer)} の書き込み）は、マイグレーションの前の記録を書いたが、この版を出した記録はどの書き込みにも無い。記録はマイグレーションのジョブより前（production では承認の前）に書くので、${version} のマイグレーションが DB に当たったかは分からない。下のマイグレーションの一覧は、当たっていても当たっていなくても漏れが無いように作った。`,
    "",
  ];
}

/** The pull request's body (SDD 2章「make ターゲット」の promote): Japanese, like the repo's PRs. */
function prBody(input: BodyInput, records: () => Records): string {
  const { repo, env, project, originMain, sha, current, history } = input;
  const file = versionFile(env);
  const now =
    current === undefined
      ? undefined
      : inspectCurrent(repo, env, project, current, history, records());
  const from = now?.from;
  const { deployed: furthest, mayHaveMigrated }: Furthest =
    current === undefined
      ? {}
      : furthestVersions(repo, originMain, history, records());
  // The newest SHA in main whose migrations may be in the DB.
  const migrated = mayHaveMigrated?.sha ?? furthest;
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
    ...(mayHaveMigrated === undefined ? [] : cautionLines(mayHaveMigrated)),
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
    const previous = previousVersion(history, furthest, records());
    const check =
      "04_deployment-procedure.md 5.1 の 3 のとおり、上のマイグレーションの一覧に contract（4.1 の表の右の列）が無いことを確かめる。";
    const commitsToo =
      "新しい値を書き始めた変更はマイグレーションに出ないことがあるので、コミットの一覧でも確かめる。";
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
        ? `出す版は、いちばん先まで出した版より古く、直前の版（04_deployment-procedure.md 4.1）${previous === undefined ? "は無い" : `の \`${previous}\` でもない`}。${check}${commitsToo}`
        : doubt
          ? `出す版は、いちばん先まで出した版より古く、直前の版（04_deployment-procedure.md 4.1）の \`${previous}\` なので、\`${short(furthest)}\` までのマイグレーションは確かめなくてよい。\`${short(furthest)}\` の次から \`${short(migrated)}\` までのもの（当たったかもしれないもの）は、04_deployment-procedure.md 5.1 の 3 のとおり contract（4.1 の表の右の列）が無いことを確かめる。${commitsToo}`
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
      furthest !== undefined
        ? `## マイグレーション（いちばん先まで出した版 \`${short(furthest)}\` の次から、出す版まで。この昇格で新しく当たるもの）`
        : "## マイグレーション（出す版にあるすべて。この昇格で新しく当たるもの）",
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
      `the image ${image} was not found (gcloud: ${described.stderr}). Only build.yml pushes it, once its tests pass, and Artifact Registry keeps the newest 30 images and those under 90 days old (ADR-007)`,
    );
  }
  let records: Records | undefined;
  const envRecords = () => {
    records ??= readRecords(repo, env, project, history);
    return records;
  };
  if (env === "production") {
    const stagingHistory = versionHistory(repo, originMain, "staging");
    const writer = stagingHistory.find((written) => written.sha === sha);
    if (writer === undefined) {
      throw new Error(
        `${short(sha)} was never in ${versionFile("staging")} on origin/main: promote it to staging first (make promote ENV=staging SHA=${short(sha)})`,
      );
    }
    const deployment = readRecords(
      repo,
      "staging",
      project,
      stagingHistory,
    ).deployment(writer.commit);
    if (deployment !== "deployed") {
      throw new Error(
        `the staging deployment of ${short(sha)} is not known to have succeeded: ${describeInEnglish(deployment, writer.commit)}. Put it on staging first: wait for or rerun that run while ${versionFile("staging")} still holds it, otherwise promote it to staging again (make promote ENV=staging SHA=${short(sha)})`,
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
    const body = prBody(
      {
        repo,
        env,
        project,
        originMain,
        sha,
        current,
        history,
        rollback,
      },
      envRecords,
    );
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
