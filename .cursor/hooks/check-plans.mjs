#!/usr/bin/env node
/**
 * Cursor hook: keep hackaton26-frontend aligned with hackaton26-plans.
 *
 * sessionStart — refresh the local clone of the plans repo.
 * beforeShellExecution (git commit) — review the staged diff against
 * master-plan/ and msd-* READMEs, then allow or deny the commit.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PLANS_REPO = "https://github.com/bauzwilling/hackaton26-plans.git";
const PLANS_CACHE_DIR = ".cursor/hooks/.cache/hackaton26-plans";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-5";
const MAX_PLANS_CHARS = 90_000;
const MAX_DIFF_CHARS = 80_000;

function reply(payload) {
  process.stdout.write(jsonDump(payload));
  process.exit(0);
}

function jsonDump(value) {
  return `${JSON.stringify(value)}\n`;
}

function log(message) {
  process.stderr.write(`[check-plans] ${message}\n`);
}

function git(args, cwd, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASK_PASS: "",
    },
    ...options,
  });
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseHookInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function loadDotEnv(repoRoot) {
  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function resolveRepoRoot(input) {
  const cwd = input.cwd || process.cwd();
  try {
    return git(["rev-parse", "--show-toplevel"], cwd).trim();
  } catch {
    const roots = input.workspace_roots;
    if (Array.isArray(roots) && roots[0]) return roots[0];
    return process.cwd();
  }
}

function isGitCommit(command) {
  return /\bgit(?:\.exe)?(?:\s+[^\n]+)*\s+commit\b/i.test(String(command || ""));
}

function allow(extra = {}) {
  reply({ permission: "allow", ...extra });
}

function deny(userMessage, agentMessage) {
  reply({
    permission: "deny",
    user_message: userMessage,
    agent_message: agentMessage || userMessage,
  });
}

function ask(userMessage, agentMessage) {
  reply({
    permission: "ask",
    user_message: userMessage,
    agent_message: agentMessage || userMessage,
  });
}

function walkMarkdown(dir, acc) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git") continue;
      walkMarkdown(full, acc);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      acc.push(full);
    }
  }
}

function collectPlanFiles(plansRoot) {
  const files = [];
  const rootReadme = path.join(plansRoot, "README.md");
  if (fs.existsSync(rootReadme)) files.push(rootReadme);

  const masterPlan = path.join(plansRoot, "master-plan");
  walkMarkdown(masterPlan, files);

  if (!fs.existsSync(plansRoot)) return [];
  for (const entry of fs.readdirSync(plansRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^msd-/i.test(entry.name)) continue;
    walkMarkdown(path.join(plansRoot, entry.name), files);
  }

  const seen = new Set();
  return files.filter((file) => {
    const key = path.resolve(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectPlanMarkdown(plansRoot) {
  const files = collectPlanFiles(plansRoot);
  const parts = [];
  let used = 0;
  for (const file of files) {
    const rel = path.relative(plansRoot, file).split(path.sep).join("/");
    const body = fs.readFileSync(file, "utf8").trim();
    const chunk = `## ${rel}\n\n${body}\n`;
    if (used + chunk.length > MAX_PLANS_CHARS) {
      parts.push(`## ${rel}\n\n[truncated — file omitted to stay within size limits]\n`);
      continue;
    }
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join("\n---\n\n");
}

function syncPlans(repoRoot) {
  const cache = path.join(repoRoot, PLANS_CACHE_DIR);
  fs.mkdirSync(path.dirname(cache), { recursive: true });

  if (fs.existsSync(path.join(cache, ".git"))) {
    git(["fetch", "--depth", "1", "origin"], cache);
    let target = "origin/HEAD";
    try {
      git(["rev-parse", "--verify", "origin/HEAD"], cache);
    } catch {
      target = "origin/main";
      try {
        git(["rev-parse", "--verify", "origin/main"], cache);
      } catch {
        target = "FETCH_HEAD";
      }
    }
    git(["reset", "--hard", target], cache);
    git(["clean", "-fd"], cache);
    return cache;
  }

  if (fs.existsSync(cache)) {
    fs.rmSync(cache, { recursive: true, force: true });
  }
  git(["clone", "--depth", "1", PLANS_REPO, cache], repoRoot);
  return cache;
}

function collectCommitDiff(repoRoot, command) {
  let diff = "";
  try {
    diff = git(["diff", "--cached", "--full-index"], repoRoot);
  } catch {
    diff = "";
  }

  const usesAll = /(?:\s|^)(?:-a|--all)(?:\s|$)/.test(command);
  if (!diff.trim() && usesAll) {
    try {
      diff = git(["diff", "HEAD", "--full-index"], repoRoot);
    } catch {
      diff = "";
    }
  }

  let stat = "";
  try {
    stat = git(["diff", "--cached", "--stat"], repoRoot);
  } catch {
    stat = "";
  }

  let files = "";
  try {
    files = git(["diff", "--cached", "--name-only"], repoRoot);
  } catch {
    files = "";
  }

  if (!files.trim() && usesAll) {
    try {
      files = git(["diff", "HEAD", "--name-only"], repoRoot);
    } catch {
      files = "";
    }
  }

  return {
    diff: diff.trim(),
    stat: stat.trim(),
    files: files
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

function onlyHookBootstrap(files) {
  if (files.length === 0) return false;
  return files.every((file) => {
    const normalized = file.replace(/\\/g, "/");
    return (
      normalized.startsWith(".cursor/hooks") ||
      normalized === ".cursor/hooks.json" ||
      normalized === ".gitignore"
    );
  });
}

function extractCommitMessage(command) {
  const flagged = String(command || "").match(
    /(?:^|\s)(?:-m|--message)(?:\s+|=)(["'])([\s\S]*?)\1/,
  );
  if (flagged) return flagged[2].trim();
  const unquoted = String(command || "").match(
    /(?:^|\s)(?:-m|--message)\s+(\S+)/,
  );
  return unquoted ? unquoted[1].trim() : "";
}

function buildReviewPrompt({ branch, commitMessage, plans, stat, diff }) {
  return `You are reviewing a git commit in the Unified UI repo hackaton26-frontend (Studio / React frontend for the DataB hackathon).

The architecture source of truth is the hackaton26-plans repo. Master plan wins on conflict. Each msd-* folder (and master-plan) contains markdown that defines in-scope work, out-of-scope work, and how features interact.

This frontend is Unified UI only. It may talk to a Platform BFF. It must not grow into a workflow engine, adapter layer, Grasshopper/Rhino host, or a second product.

## Review rules

FAIL (compliant=false) if the DIFF introduces any of:
- Out-of-scope features (examples: Plyworks as Phase-1 product work, billing, Nexus auth, rewriting Door Box-Out / Simple Parts / Worklist, UI calling those systems or Rhino Compute or the AI provider directly, browser-owned workflow execution, global CurrentJob state, treating { reply, app } as the real product contract)
- Incorrect wiring vs the plans (UI → legacy systems, AI executes manufacturing, skipping BFF SuggestedAction accept, polling adapters, exposing GH/Worklist/Rhino IDs as platform IDs, Design/Mill/Produce file bounce in the browser)
- New behavior that contradicts named feature interactions in msd-* READMEs

ALLOW (compliant=true) if:
- The diff only changes look/layout/copy while staying within a named window (Studio canvas, Concierge, Boxouts/Design, Simple Parts/Mill, Orbit/Produce)
- The diff keeps or refactors mocks that the plans already list under "Fake / not fixed" or named deviations (dummy login, local quotes, open-app concierge, localStorage workspace) WITHOUT treating them as the lasting contract
- The BFF does not exist yet, so continuing to use local mocks is fine as long as the diff does not cement the wrong architecture
- Docs, comments, tests, or this hook itself
- You are judging the DIFF, not punishing pre-existing code that the plans already describe as current look / mock

Current branch: ${branch || "(unknown)"}
Commit message: ${commitMessage || "(not provided)"}

## Plans

${plans}

## Diff stat

${stat || "(empty)"}

## Diff

${diff || "(empty)"}

Respond with JSON only, no markdown fences:
{"compliant": true|false, "summary": "<one short sentence>", "violations": [{"plan": "<folder or file>", "issue": "<what the diff does wrong>"}]}
`;
}

function stripJsonFences(text) {
  return String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

async function reviewWithClaude(apiKey, prompt) {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic HTTP ${response.status}: ${body.slice(0, 400)}`);
  }

  const parsed = JSON.parse(body);
  const text = (parsed.content || [])
    .map((block) => (block && block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();
  if (!text) throw new Error("Anthropic returned an empty review");
  return JSON.parse(stripJsonFences(text));
}

function formatViolations(violations) {
  if (!Array.isArray(violations) || violations.length === 0) {
    return "The commit goes against hackaton26-plans.";
  }
  return violations
    .map((item) => {
      const plan = item && item.plan ? String(item.plan) : "plans";
      const issue = item && item.issue ? String(item.issue) : "unspecified issue";
      return `- [${plan}] ${issue}`;
    })
    .join("\n");
}

async function handleSessionStart(repoRoot) {
  try {
    syncPlans(repoRoot);
    const plansRoot = path.join(repoRoot, PLANS_CACHE_DIR);
    const folders = collectPlanFiles(plansRoot)
      .map((file) => path.relative(plansRoot, file).split(path.sep).join("/"))
      .slice(0, 24);
    reply({
      additional_context: [
        "Architecture source of truth: github.com/bauzwilling/hackaton26-plans (master-plan and every msd-* folder).",
        "This repo is Unified UI only. UI talks to the Platform BFF, never to the AI provider, Door Box-Out, Simple Parts, Worklist, or Rhino Compute.",
        "Do not add out-of-scope Phase-1 features or rewire feature interactions against those READMEs. Named mocks/deviations in the plans may remain until the BFF exists.",
        `Cached plan files: ${folders.join(", ")}`,
        "Git commits in this repo are checked against those plans before they land.",
      ].join("\n"),
    });
  } catch (error) {
    log(`sessionStart plan sync failed: ${error.message || error}`);
    reply({});
  }
}

async function handleCommit(input, repoRoot) {
  const command = String(input.command || "");
  if (!isGitCommit(command)) {
    allow();
  }

  let plansRoot;
  try {
    plansRoot = syncPlans(repoRoot);
  } catch (error) {
    ask(
      "Could not refresh hackaton26-plans. Review this commit against master-plan and msd-* before continuing.",
      `Plan sync failed (${error.message || error}). Fetch https://github.com/bauzwilling/hackaton26-plans and re-check that this commit does not add out-of-scope features or incorrect wiring.`,
    );
  }

  const { diff, stat, files } = collectCommitDiff(repoRoot, command);
  if (!diff && files.length === 0) {
    allow();
  }

  if (onlyHookBootstrap(files)) {
    allow();
  }

  const plans = collectPlanMarkdown(plansRoot);
  if (!plans.trim()) {
    ask(
      "hackaton26-plans clone has no master-plan or msd-* markdown. Review this commit manually.",
      "The plan cache was empty after sync. Confirm master-plan and msd-* READMEs are present, then retry the commit.",
    );
  }

  loadDotEnv(repoRoot);
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    ask(
      "ANTHROPIC_API_KEY is missing, so this commit was not auto-checked against hackaton26-plans. Confirm it stays in scope, then approve.",
      "Set ANTHROPIC_API_KEY in the repo-root .env so commits can be checked against master-plan and msd-* READMEs. Until then, do not introduce out-of-scope features or wiring that those plans forbid.",
    );
  }

  let branch = "";
  try {
    branch = git(["branch", "--show-current"], repoRoot).trim();
  } catch {
    branch = "";
  }

  const clippedDiff =
    diff.length > MAX_DIFF_CHARS
      ? `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[diff truncated]`
      : diff;

  const prompt = buildReviewPrompt({
    branch,
    commitMessage: extractCommitMessage(command),
    plans,
    stat,
    diff: clippedDiff,
  });

  let review;
  try {
    review = await reviewWithClaude(apiKey, prompt);
  } catch (error) {
    ask(
      "Plan check could not finish. Review this commit against hackaton26-plans before continuing.",
      `Commit review failed (${error.message || error}). Re-read master-plan and msd-* and make sure this diff does not add out-of-scope features or incorrect wiring.`,
    );
  }

  if (review && review.compliant === false) {
    const details = formatViolations(review.violations);
    const summary = review.summary || "This commit goes against hackaton26-plans.";
    deny(
      `Commit blocked: it conflicts with hackaton26-plans. ${summary}`,
      `Commit blocked by the plan-alignment hook.\n${summary}\n${details}\nFix the diff so it matches master-plan and the relevant msd-* READMEs, then commit again.`,
    );
  }

  allow();
}

async function main() {
  const input = parseHookInput(readStdin());
  const repoRoot = resolveRepoRoot(input);
  const event = String(input.hook_event_name || "");

  if (event === "sessionStart" || (!input.command && input.session_id)) {
    await handleSessionStart(repoRoot);
    return;
  }

  await handleCommit(input, repoRoot);
}

main().catch((error) => {
  log(error && error.stack ? error.stack : String(error));
  allow({
    agent_message:
      "Plan-alignment hook crashed; the commit was allowed. Re-check hackaton26-plans (master-plan and msd-*) if this change might be out of scope.",
  });
});
