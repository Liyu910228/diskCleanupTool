#!/usr/bin/env node

const os = require("node:os");
const path = require("node:path");
const { analyzeDirectory, deletePaths, findInstallers, findProjectArtifacts, runClean } = require("./cleaner");
const { bar, bytes, printSection, relativeName } = require("./format");
const { getDrives, getTopProcesses, memoryInfo } = require("./windows");

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("-") ? args[0] : "help";

function hasFlag(flag) {
  return args.includes(flag);
}

function readOption(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) return fallback;
  return args[index + 1];
}

async function main() {
  if (hasFlag("--help") || command === "help") {
    printHelp();
    return;
  }

  if (command === "clean") {
    await cleanCommand();
    return;
  }

  if (command === "analyze") {
    await analyzeCommand();
    return;
  }

  if (command === "purge") {
    await purgeCommand();
    return;
  }

  if (command === "installer") {
    await installerCommand();
    return;
  }

  if (command === "status") {
    await statusCommand();
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

async function cleanCommand() {
  const execute = hasFlag("--execute");
  const includeRecycleBin = hasFlag("--recycle-bin");
  printSection(execute ? "Windows Cleanup" : "Windows Cleanup Preview");

  const rows = await runClean({ execute, includeRecycleBin });
  const total = rows.reduce((sum, item) => sum + item.size, 0);

  if (rows.length === 0) {
    console.log("No cleanup targets were found.");
    return;
  }

  for (const item of rows) {
    const status = execute && item.removal ? `removed ${item.removal.removed}, skipped ${item.removal.errors}` : `${item.files} files`;
    console.log(`${item.risk.padEnd(6)} ${bytes(item.size).padStart(9)}  ${item.name.padEnd(28)} ${status}`);
    console.log(`       ${relativeName(item.path)}`);
  }

  console.log("─".repeat(72));
  console.log(`${execute ? "Space targeted" : "Potential reclaim"}: ${bytes(total)}`);
  if (!execute) {
    console.log("Dry run only. Add --execute after reviewing the list.");
  }
  if (includeRecycleBin) {
    console.log(execute ? "Recycle bin cleanup requested." : "Add --execute with --recycle-bin to clear recycle bin.");
  }
}

async function analyzeCommand() {
  const target = path.resolve(args[1] && !args[1].startsWith("-") ? args[1] : process.cwd());
  printSection(`Analyze Disk ${target}`);

  const result = await analyzeDirectory(target);
  const total = result.folders.reduce((sum, item) => sum + item.size, 0);

  for (const [index, folder] of result.folders.entries()) {
    const ratio = total ? folder.size / total : 0;
    console.log(`${String(index + 1).padStart(2)}. ${bar(ratio)} ${String(Math.round(ratio * 100)).padStart(3)}%  ${bytes(folder.size).padStart(9)}  ${path.basename(folder.path)}`);
  }

  if (result.largeFiles.length > 0) {
    printSection("Large Files");
    for (const file of result.largeFiles) {
      console.log(`${bytes(file.size).padStart(9)}  ${relativeName(file.path)}`);
    }
  }
}

async function purgeCommand() {
  const root = path.resolve(readOption("--path", process.cwd()));
  const execute = hasFlag("--execute");
  printSection(execute ? "Project Artifact Purge" : "Project Artifact Preview");

  const artifacts = await findProjectArtifacts(root);
  const oldArtifacts = artifacts.filter((item) => {
    if (!item.modified) return true;
    return Date.now() - item.modified.getTime() > 7 * 24 * 60 * 60 * 1000;
  });

  for (const artifact of artifacts) {
    const recent = oldArtifacts.includes(artifact) ? "old" : "recent";
    console.log(`${bytes(artifact.size).padStart(9)}  ${recent.padEnd(6)}  ${relativeName(artifact.path)}`);
  }

  const targetPaths = oldArtifacts.map((item) => item.path);
  if (execute) {
    const result = await deletePaths(targetPaths);
    console.log("─".repeat(72));
    console.log(`Removed ${result.removed} artifacts, skipped ${result.errors}.`);
  } else {
    const total = oldArtifacts.reduce((sum, item) => sum + item.size, 0);
    console.log("─".repeat(72));
    console.log(`Potential reclaim from old artifacts: ${bytes(total)}`);
    console.log("Dry run only. Add --execute to delete old artifacts. Recent artifacts stay protected.");
  }
}

async function installerCommand() {
  const home = process.env.USERPROFILE || os.homedir();
  const root = path.resolve(readOption("--path", path.join(home, "Downloads")));
  const execute = hasFlag("--execute");
  printSection(execute ? "Installer Cleanup" : "Installer Preview");

  const installers = await findInstallers(root);
  for (const item of installers) {
    console.log(`${bytes(item.size).padStart(9)}  ${relativeName(item.path)}`);
  }

  if (installers.length === 0) {
    console.log("No large installers found.");
    return;
  }

  if (execute) {
    const result = await deletePaths(installers.map((item) => item.path));
    console.log("─".repeat(72));
    console.log(`Removed ${result.removed} installers, skipped ${result.errors}.`);
  } else {
    const total = installers.reduce((sum, item) => sum + item.size, 0);
    console.log("─".repeat(72));
    console.log(`Potential reclaim: ${bytes(total)}`);
    console.log("Dry run only. Add --execute to delete these files.");
  }
}

async function statusCommand() {
  printSection("System Status");
  const memory = memoryInfo();
  const memoryRatio = memory.used / memory.total;
  console.log(`Memory  ${bar(memoryRatio)} ${Math.round(memoryRatio * 100)}%  ${bytes(memory.used)} / ${bytes(memory.total)}`);

  try {
    const drives = await getDrives();
    for (const drive of drives) {
      const used = Number(drive.Size) - Number(drive.FreeSpace);
      const ratio = used / Number(drive.Size);
      const label = drive.VolumeName ? `${drive.DeviceID} ${drive.VolumeName}` : drive.DeviceID;
      console.log(`Disk    ${bar(ratio)} ${Math.round(ratio * 100)}%  ${bytes(used)} / ${bytes(drive.Size)}  ${label}`);
    }
  } catch (error) {
    console.log(`Disk    unavailable: ${error.message}`);
  }

  try {
    const processes = await getTopProcesses();
    printSection("Top Processes");
    for (const proc of processes) {
      console.log(`${String(proc.ProcessName).padEnd(26)} CPU ${Number(proc.CPU || 0).toFixed(1).padStart(7)}s  RAM ${bytes(proc.WS).padStart(9)}`);
    }
  } catch (error) {
    console.log(`Processes unavailable: ${error.message}`);
  }
}

function printHelp() {
  console.log(`Windows Disk Cleanup Tool

Usage:
  wclean clean [--execute] [--recycle-bin]
  wclean analyze [path]
  wclean purge [--path path] [--execute]
  wclean installer [--path path] [--execute]
  wclean status

Safety:
  Cleanup commands preview by default. Add --execute only after reviewing output.
`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
