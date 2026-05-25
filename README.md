# Windows Disk Cleanup Tool

A Windows-focused disk cleanup CLI inspired by [Mole](https://github.com/dingzhenznen/Mole). It keeps Mole's useful shape: deep cleanup, disk insights, project artifact purge, installer cleanup, and live system status. This version is designed for Windows and is conservative by default.

## Safety

- All cleanup commands run in dry-run mode by default.
- Files are deleted only when `--execute` is passed.
- System folders are skipped unless they are known cache/temp locations.
- Recent project artifacts are unselected by default.
- Errors from locked files are reported without stopping the full run.

## Requirements

- Windows 10/11
- Node.js 18+

## Quick Start

```powershell
npm install
npm link
wclean --help
wclean status
wclean clean
wclean clean --execute
```

You can also run it without linking:

```powershell
node .\src\cli.js clean
```

## Commands

```powershell
wclean clean               # Preview cleanup for temp, logs, browser cache, npm cache
wclean clean --execute     # Delete safe cleanup targets
wclean analyze C:\Users    # Show top folders and large files
wclean purge --path D:\dev # Find removable project artifacts
wclean purge --execute     # Remove selected old project artifacts
wclean installer           # Find large installers in Downloads/Desktop
wclean installer --execute # Delete found installers
wclean status              # Show disk, memory, CPU, and top process summary
```

## Cleanup Targets

- User temp: `%TEMP%`
- Windows temp: `%WINDIR%\Temp`
- Windows update downloads: `%WINDIR%\SoftwareDistribution\Download`
- Browser caches for Chrome, Edge, and Firefox
- Developer caches: npm, pnpm, yarn, pip, Gradle
- Logs under common user and Windows locations
- Optional recycle bin cleanup through `Clear-RecycleBin`

## Examples

Preview all normal cleanup targets:

```powershell
wclean clean
```

Delete after reviewing:

```powershell
wclean clean --execute
```

Analyze a directory:

```powershell
wclean analyze D:\liyucode
```

Purge old project artifacts:

```powershell
wclean purge --path D:\liyucode --execute
```

## Notes

Run PowerShell or Windows Terminal as administrator if you want to clean system-level temp folders. The tool still works without admin rights, but some locked or protected files will be skipped.
