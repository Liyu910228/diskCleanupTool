const path = require("node:path");

function bytes(value) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value) || 0;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  const digits = size >= 10 || unit === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unit]}`;
}

function bar(ratio, width = 22) {
  const bounded = Math.max(0, Math.min(1, ratio || 0));
  const filled = Math.round(bounded * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function relativeName(targetPath) {
  const home = process.env.USERPROFILE || "";
  if (home && targetPath.toLowerCase().startsWith(home.toLowerCase())) {
    return `~${path.sep}${path.relative(home, targetPath)}`;
  }
  return targetPath;
}

function printSection(title) {
  console.log("");
  console.log(title);
  console.log("═".repeat(Math.max(12, title.length)));
}

module.exports = {
  bar,
  bytes,
  printSection,
  relativeName
};
