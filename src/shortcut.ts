import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const SHORTCUT_NAME = 'OBS Studio (Browser Click)'

function defaultReadRegistry(): string | undefined {
	try {
		const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\OBS Studio', '/ve'], { encoding: 'utf8', windowsHide: true })
		return /REG_SZ\s+(.+)/.exec(out)?.[1].trim()
	} catch {
		return undefined
	}
}

/** obs64.exe from the installer's registry entry, or the default install folder. */
export function findObs(readRegistry = defaultReadRegistry, exists: (path: string) => boolean = existsSync): string | undefined {
	const dirs = [readRegistry(), 'C:\\Program Files\\obs-studio'].filter((d): d is string => !!d)
	return dirs.map((d) => join(d, 'bin', '64bit', 'obs64.exe')).find(exists)
}

// Paths and the port arrive as environment variables, never pasted into the script, so quotes or spaces in them cannot break it.
const SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$sh = New-Object -ComObject WScript.Shell
$arg = '--remote-debugging-port=' + $env:OBS_PORT
$made = @()
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
	$path = Join-Path $folder ($env:SC_NAME + '.lnk')
	$link = $sh.CreateShortcut($path)
	$link.TargetPath = $env:OBS_EXE
	$link.Arguments = $arg
	$link.WorkingDirectory = $env:OBS_DIR
	$link.IconLocation = $env:OBS_EXE + ',0'
	$link.Save()
	$made += $path
}
$pinned = 0
$taskbar = Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'
if (Test-Path -LiteralPath $taskbar) {
	foreach ($file in Get-ChildItem -LiteralPath $taskbar -Filter *.lnk) {
		$link = $sh.CreateShortcut($file.FullName)
		if ([IO.Path]::GetFileName($link.TargetPath) -ine 'obs64.exe') { continue }
		$rest = (($link.Arguments -replace '--remote-debugging-port=\\S*', '') -replace '\\s+', ' ').Trim()
		$link.Arguments = ($rest + ' ' + $arg).Trim()
		$link.Save()
		$pinned++
	}
}
@{ desktop = $made[0]; startMenu = $made[1]; taskbar = $pinned } | ConvertTo-Json -Compress
`

type Run = (script: string, env: Record<string, string>) => Promise<string>

const runPowerShell: Run = (script, env) =>
	new Promise((resolve, reject) => {
		// -EncodedCommand (UTF-16LE base64) keeps the script's quotes away from Windows argument quoting.
		const encoded = Buffer.from(script, 'utf16le').toString('base64')
		execFile(
			'powershell.exe',
			['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
			{ env: { ...process.env, ...env }, timeout: 15000, windowsHide: true, encoding: 'utf8' },
			(error, stdout, stderr) => (error ? reject(new Error(stderr.trim() || error.message.split('\n')[0])) : resolve(stdout)),
		)
	})

export type ShortcutResult = { ok: true; desktop: string; startMenu: string; taskbar: number } | { ok: false; reason: 'noObs' | 'failed' }

/** Makes "OBS Studio (Browser Click)" on the user's desktop and Start menu and adds the flag to a pinned OBS on the taskbar. */
export async function setupShortcuts(port: number, run: Run = runPowerShell, find: () => string | undefined = findObs): Promise<ShortcutResult> {
	const exe = find()
	if (!exe) return { ok: false, reason: 'noObs' }
	try {
		const out = await run(SCRIPT, { OBS_EXE: exe, OBS_DIR: dirname(exe), OBS_PORT: String(port), SC_NAME: SHORTCUT_NAME })
		const line = out.split(/\r?\n/).reverse().find((l) => l.trim().startsWith('{'))
		const { desktop, startMenu, taskbar } = JSON.parse(line ?? '') as { desktop: string; startMenu: string; taskbar: number }
		return { ok: true, desktop, startMenu, taskbar }
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		return { ok: false, reason: 'failed' }
	}
}
