import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import chalk from "chalk";
import { findClaudeDir, listProjects, findProjectDir } from "../lib/scanner.js";
import { interactiveSelect } from "../lib/select.js";

export async function inspectCommand(targetPath, opts = {}) {
  const claudeDir = opts.claudeDir || findClaudeDir();

  let projectPath;

  if (targetPath) {
    projectPath = resolve(targetPath.replace(/^~/, process.env.HOME));
  } else {
    const projects = listProjects(claudeDir);
    const all = [];
    for (const p of projects) {
      all.push(p);
      for (const sub of p.subfolders || []) all.push(sub);
    }

    const selected = await interactiveSelect(all, {
      label: (p) => {
        let label = p.projectPath;
        if (!p.exists) label += chalk.dim(" (orphaned)");
        if (p.isGit) label += chalk.dim(" (git)");
        return label;
      },
      multi: false,
    });

    if (selected === null) {
      console.log("Aborted.");
      return;
    }
    projectPath = selected.projectPath;
  }

  const data = loadProjectData(projectPath, claudeDir);

  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  display(data);
}

function loadProjectData(projectPath, claudeDir) {
  const exists = existsSync(projectPath);
  const claudeJsonPath = join(claudeDir, "..", ".claude.json");
  const projectDir = findProjectDir(claudeDir, projectPath);

  let entry = {};
  try {
    const raw = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
    entry = raw.projects?.[projectPath] || {};
  } catch {}

  let projectMcps = {};
  let projectSettings = {};
  let localSettings = {};

  if (exists) {
    const mcpJsonPath = join(projectPath, ".mcp.json");
    if (existsSync(mcpJsonPath)) {
      try { projectMcps = JSON.parse(readFileSync(mcpJsonPath, "utf-8")).mcpServers || {}; } catch {}
    }

    const settingsPath = join(projectPath, ".claude", "settings.json");
    if (existsSync(settingsPath)) {
      try { projectSettings = JSON.parse(readFileSync(settingsPath, "utf-8")); } catch {}
    }

    const localSettingsPath = join(projectPath, ".claude", "settings.local.json");
    if (existsSync(localSettingsPath)) {
      try { localSettings = JSON.parse(readFileSync(localSettingsPath, "utf-8")); } catch {}
    }
  }

  return {
    projectPath,
    exists,
    claudeMd: loadClaudeMd(projectPath),
    plans: loadPlans(claudeDir, projectPath),
    sessions: projectDir ? loadSessions(projectDir) : [],
    mcps: {
      global: entry.mcpServers || {},
      project: projectMcps,
      disabledFromMcpJson: entry.disabledMcpjsonServers || [],
    },
    tools: {
      global: entry.allowedTools || [],
      project: projectSettings.allowedTools || [],
      local: localSettings.allowedTools || [],
    },
  };
}

function loadClaudeMd(projectPath) {
  const filePath = join(projectPath, "CLAUDE.md");
  if (!existsSync(filePath)) return null;
  try {
    const firstLine = readFileSync(filePath, "utf-8").split("\n").find((l) => l.trim()) || "";
    return { firstLine: firstLine.replace(/^#+\s*/, "").trim() };
  } catch {
    return { firstLine: "" };
  }
}

function loadPlans(claudeDir, projectPath) {
  const plansDir = join(claudeDir, "plans");
  if (!existsSync(plansDir)) return [];
  const plans = [];
  try {
    for (const file of readdirSync(plansDir).filter((f) => f.endsWith(".md"))) {
      const filePath = join(plansDir, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        if (!content.includes(projectPath)) continue;
        const title = content.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").trim() || file;
        plans.push({ file, title });
      } catch {}
    }
  } catch {}
  return plans;
}

function loadSessions(projectDir) {
  const sessions = [];
  try {
    for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
      if (!entry.name.endsWith(".jsonl")) continue;
      const full = join(projectDir, entry.name);
      const st = statSync(full);
      sessions.push({
        id: entry.name.replace(/\.jsonl$/, ""),
        created: st.birthtime.toISOString(),
        lastInteraction: st.mtime.toISOString(),
      });
    }
  } catch {}
  return sessions.sort((a, b) => b.lastInteraction.localeCompare(a.lastInteraction));
}

function display(data) {
  const dot = data.exists ? chalk.green("●") : chalk.redBright("●");
  let header = data.projectPath;
  if (!data.exists) header += chalk.dim(" (orphaned)");
  console.log(dot + " " + chalk.bold(header));
  console.log();

  // CLAUDE.md
  console.log(chalk.bold("  CLAUDE.md"));
  if (data.claudeMd) {
    console.log("  ⎿  " + chalk.dim(data.claudeMd.firstLine || "(no title)"));
  } else {
    console.log("  " + chalk.dim("none"));
  }
  console.log();

  // Plans
  console.log(chalk.bold("  Plans") + chalk.dim(" (" + data.plans.length + ")"));
  if (data.plans.length > 0) {
    for (const p of data.plans) {
      console.log("  ⎿  " + p.title + "  " + chalk.dim(p.file));
    }
  } else {
    console.log("  " + chalk.dim("none"));
  }
  console.log();

  // MCPs
  const globalMcps = Object.entries(data.mcps.global);
  const projectMcps = Object.entries(data.mcps.project);

  console.log(chalk.bold("  MCPs"));
  if (globalMcps.length > 0 || projectMcps.length > 0) {
    for (const [name, cfg] of globalMcps) {
      const cmd = [cfg.command, ...(cfg.args || [])].filter(Boolean).join(" ");
      console.log("  ⎿  " + chalk.cyan(name) + "  " + cmd + "  " + chalk.dim("(global)"));
    }
    for (const [name, cfg] of projectMcps) {
      const cmd = [cfg.command, ...(cfg.args || [])].filter(Boolean).join(" ");
      const disabled = data.mcps.disabledFromMcpJson.includes(name) ? chalk.dim(" (disabled)") : "";
      console.log("  ⎿  " + chalk.cyan(name) + "  " + cmd + "  " + chalk.dim("(.mcp.json)") + disabled);
    }
  } else {
    console.log("  " + chalk.dim("none"));
  }
  console.log();

  // Tools
  console.log(chalk.bold("  Allowed tools"));
  const allTools = [
    ...data.tools.global.map((t) => ({ tool: t, source: "global" })),
    ...data.tools.project.map((t) => ({ tool: t, source: "settings.json" })),
    ...data.tools.local.map((t) => ({ tool: t, source: "settings.local.json" })),
  ];
  if (allTools.length > 0) {
    const bySource = {};
    for (const { tool, source } of allTools) {
      if (!bySource[source]) bySource[source] = [];
      bySource[source].push(tool);
    }
    for (const [source, tools] of Object.entries(bySource)) {
      console.log("  ⎿  " + tools.join(", ") + "  " + chalk.dim("(" + source + ")"));
    }
  } else {
    console.log("  " + chalk.dim("none"));
  }
  console.log();

  // Sessions
  console.log(chalk.bold("  Sessions") + chalk.dim(" (" + data.sessions.length + ")"));
  if (data.sessions.length > 0) {
    for (const s of data.sessions) {
      const id = chalk.dim(s.id.slice(0, 8));
      const created = "created: " + formatDate(s.created);
      const last = "last: " + formatDate(s.lastInteraction);
      console.log("  ⎿  " + id + "  " + created + "  " + last);
    }
  } else {
    console.log("  " + chalk.dim("none"));
  }
  console.log();
}

function formatDate(iso) {
  if (!iso) return "unknown";
  return iso.slice(0, 16).replace("T", " ");
}
