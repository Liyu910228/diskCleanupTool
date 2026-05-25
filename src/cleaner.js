const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { clearRecycleBin } = require("./windows");

const INSTALLER_EXTENSIONS = new Set([".msi", ".exe", ".zip", ".iso", ".dmg", ".pkg", ".7z", ".rar"]);

function envPath(...parts) {
  if (parts.some((part) => !part)) return null;
  return path.join(...parts);
}

function cleanupTargets() {
  const home = process.env.USERPROFILE || os.homedir();
  const local = process.env.LOCALAPPDATA;
  const roaming = process.env.APPDATA;
  const windir = process.env.WINDIR || "C:\\Windows";

  return [
    { name: "User temp", path: process.env.TEMP, risk: "low" },
    { name: "Windows temp", path: envPath(windir, "Temp"), risk: "medium" },
    { name: "Windows update downloads", path: envPath(windir, "SoftwareDistribution", "Download"), risk: "medium" },
    { name: "Chrome cache", path: envPath(local, "Google", "Chrome", "User Data", "Default", "Cache"), risk: "low" },
    { name: "Chrome code cache", path: envPath(local, "Google", "Chrome", "User Data", "Default", "Code Cache"), risk: "low" },
    { name: "Edge cache", path: envPath(local, "Microsoft", "Edge", "User Data", "Default", "Cache"), risk: "low" },
    { name: "Edge code cache", path: envPath(local, "Microsoft", "Edge", "User Data", "Default", "Code Cache"), risk: "low" },
    { name: "Firefox cache", path: envPath(local, "Mozilla", "Firefox", "Profiles"), risk: "low", pattern: "cache2" },
    { name: "npm cache", path: envPath(local, "npm-cache"), risk: "low" },
    { name: "pnpm store", path: envPath(local, "pnpm", "store"), risk: "low" },
    { name: "yarn cache", path: envPath(local, "Yarn", "Cache"), risk: "low" },
    { name: "pip cache", path: envPath(local, "pip", "Cache"), risk: "low" },
    { name: "Gradle cache", path: envPath(home, ".gradle", "caches"), risk: "medium" },
    { name: "User logs", path: envPath(local, "Temp"), risk: "low", extensions: [".log", ".etl", ".dmp"] },
    { name: "Windows logs", path: envPath(windir, "Logs"), risk: "medium", extensions: [".log", ".etl", ".tmp"] },
    { name: "Crash dumps", path: envPath(local, "CrashDumps"), risk: "low" },
    { name: "Roaming temp logs", path: envPath(roaming, "Microsoft", "Windows", "Recent"), risk: "low", extensions: [".tmp", ".log"] }
  ].filter((target) => target.path);
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function statSafe(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

async function scanPath(targetPath, options = {}) {
  const result = { path: targetPath, size: 0, files: 0, errors: 0 };
  const stat = await statSafe(targetPath);
  if (!stat) return result;

  if (stat.isFile()) {
    if (matchesFilters(targetPath, options)) {
      result.size += stat.size;
      result.files += 1;
    }
    return result;
  }

  const entries = await readDirSafe(targetPath);
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    const childStat = await statSafe(fullPath);
    if (!childStat) {
      result.errors += 1;
      continue;
    }

    if (childStat.isDirectory()) {
      if (options.pattern && entry.name.toLowerCase() !== options.pattern.toLowerCase()) {
        const child = await scanPath(fullPath, options);
        result.size += child.size;
        result.files += child.files;
        result.errors += child.errors;
        continue;
      }

      const child = await scanPath(fullPath, { ...options, pattern: null });
      result.size += child.size;
      result.files += child.files;
      result.errors += child.errors;
      continue;
    }

    if (matchesFilters(fullPath, options)) {
      result.size += childStat.size;
      result.files += 1;
    }
  }

  return result;
}

function matchesFilters(targetPath, options) {
  if (!options.extensions) return true;
  return options.extensions.includes(path.extname(targetPath).toLowerCase());
}

async function readDirSafe(targetPath) {
  try {
    return await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function removeContents(targetPath, options = {}) {
  const entries = await readDirSafe(targetPath);
  let removed = 0;
  let errors = 0;

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (options.pattern && entry.name.toLowerCase() !== options.pattern.toLowerCase()) {
        const child = await removeContents(fullPath, options);
        removed += child.removed;
        errors += child.errors;
        continue;
      }

      try {
        await fs.rm(fullPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
        removed += 1;
      } catch {
        errors += 1;
      }
      continue;
    }

    if (!matchesFilters(fullPath, options)) continue;

    try {
      await fs.rm(fullPath, { force: true, maxRetries: 2, retryDelay: 100 });
      removed += 1;
    } catch {
      errors += 1;
    }
  }

  return { removed, errors };
}

async function runClean({ execute = false, includeRecycleBin = false } = {}) {
  const targets = cleanupTargets();
  const rows = [];

  for (const target of targets) {
    if (!(await exists(target.path))) continue;
    const scan = await scanPath(target.path, target);
    let removal = null;

    if (execute && scan.files > 0) {
      removal = await removeContents(target.path, target);
    }

    rows.push({ ...target, ...scan, removal });
  }

  if (execute && includeRecycleBin) {
    await clearRecycleBin();
  }

  return rows;
}

async function analyzeDirectory(root, { limit = 12, minLargeFile = 1024 * 1024 * 100 } = {}) {
  const entries = await readDirSafe(root);
  const folders = [];
  const largeFiles = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    const stat = await statSafe(fullPath);
    if (!stat) continue;

    if (stat.isDirectory()) {
      const scan = await scanPath(fullPath);
      folders.push({ path: fullPath, size: scan.size, files: scan.files });
    } else if (stat.size >= minLargeFile) {
      largeFiles.push({ path: fullPath, size: stat.size, modified: stat.mtime });
    }
  }

  return {
    folders: folders.sort((a, b) => b.size - a.size).slice(0, limit),
    largeFiles: largeFiles.sort((a, b) => b.size - a.size).slice(0, limit)
  };
}

async function findProjectArtifacts(root) {
  const names = new Set(["node_modules", ".next", "dist", "build", "target", ".turbo", ".cache", "coverage", "venv", ".venv"]);
  const found = [];
  await walkLimited(root, 4, async (targetPath, entry) => {
    if (!entry.isDirectory() || !names.has(entry.name)) return false;
    const scan = await scanPath(targetPath);
    const stat = await statSafe(targetPath);
    found.push({ path: targetPath, size: scan.size, files: scan.files, modified: stat?.mtime });
    return false;
  });
  return found.sort((a, b) => b.size - a.size);
}

async function findInstallers(root) {
  const found = [];
  await walkLimited(root, 3, async (targetPath, entry) => {
    if (!entry.isFile()) return true;
    const ext = path.extname(entry.name).toLowerCase();
    if (!INSTALLER_EXTENSIONS.has(ext)) return true;
    const stat = await statSafe(targetPath);
    if (stat && stat.size >= 50 * 1024 * 1024) {
      found.push({ path: targetPath, size: stat.size, modified: stat.mtime });
    }
    return true;
  });
  return found.sort((a, b) => b.size - a.size);
}

async function walkLimited(root, depth, visitor) {
  if (depth < 0) return;
  const entries = await readDirSafe(root);
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    const shouldDescend = await visitor(fullPath, entry);
    if (shouldDescend !== false && entry.isDirectory()) {
      await walkLimited(fullPath, depth - 1, visitor);
    }
  }
}

async function deletePaths(paths) {
  const result = { removed: 0, errors: 0 };
  for (const targetPath of paths) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      result.removed += 1;
    } catch {
      result.errors += 1;
    }
  }
  return result;
}

module.exports = {
  analyzeDirectory,
  deletePaths,
  findInstallers,
  findProjectArtifacts,
  runClean
};
