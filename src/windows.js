const { execFile } = require("node:child_process");
const os = require("node:os");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

async function powershell(script) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, maxBuffer: 1024 * 1024 * 10 }
  );
  return stdout.trim();
}

async function getDrives() {
  const script = "$ErrorActionPreference='SilentlyContinue'; " +
    "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | " +
    "Select-Object DeviceID,VolumeName,Size,FreeSpace | " +
    "ConvertTo-Json -Compress";

  const output = await powershell(script);
  if (!output) return [];

  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function getTopProcesses(limit = 5) {
  const script = "$ErrorActionPreference='SilentlyContinue'; " +
    `Get-Process | Sort-Object CPU -Descending | Select-Object -First ${limit} ProcessName,CPU,WS | ConvertTo-Json -Compress`;

  const output = await powershell(script);
  if (!output) return [];

  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function clearRecycleBin() {
  await powershell("Clear-RecycleBin -Force -ErrorAction SilentlyContinue");
}

function memoryInfo() {
  return {
    total: os.totalmem(),
    free: os.freemem(),
    used: os.totalmem() - os.freemem()
  };
}

module.exports = {
  clearRecycleBin,
  getDrives,
  getTopProcesses,
  memoryInfo,
  powershell
};
