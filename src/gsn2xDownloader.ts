// src/gsn2xDownloader.ts
//
// Handles locating, downloading, and updating the gsn2x binary.
//
// Flow on activation:
//   resolveGsn2xExecutable()
//     ├─ if user-configured path exists → use it directly
//     ├─ if default binary is on PATH   → use it, then schedule weekly update check
//     ├─ if local download exists       → use it, then schedule weekly update check
//     └─ binary not found anywhere     → prompt to download
//
// Storage layout (inside context.globalStoragePath):
//   gsn2x/
//     bin/
//       gsn2x[.exe]          ← downloaded binary
//     meta.json              ← { version, downloadedAt, channel }

import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ───────────────────────────────────────────────────────────────

const REPO_OWNER = 'jonasthewolf';
const REPO_NAME = 'gsn2x';
const RELEASES_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`;
const NIGHTLY_RELEASES_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`;

/** How often (ms) to check for updates: 7 days */
const UPDATE_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const LAST_UPDATE_CHECK_KEY = 'gsn2x.lastUpdateCheck';
const INSTALLED_VERSION_KEY = 'gsn2x.installedVersion';
const INSTALLED_CHANNEL_KEY = 'gsn2x.installedChannel';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReleaseChannel = 'stable' | 'nightly';

interface GitHubRelease {
  tag_name: string;
  name: string;
  prerelease: boolean;
  assets: GitHubAsset[];
  html_url: string;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface LocalMeta {
  version: string;
  downloadedAt: string;
  channel: ReleaseChannel;
}

// ─── Platform helpers ─────────────────────────────────────────────────────────

function binaryName(): string {
  return process.platform === 'win32' ? 'gsn2x.exe' : 'gsn2x';
}

/**
 * Returns the expected asset name in a GitHub release for the current platform.
 * gsn2x ships exactly three assets:
 *   gsn2x-Linux
 *   gsn2x-macOS
 *   gsn2x-Windows.exe
 */
function expectedAssetName(): string {
  if (process.platform === 'win32') {
    return 'gsn2x-Windows.exe';
  } else if (process.platform === 'darwin') {
    return 'gsn2x-macOS';
  } else {
    return 'gsn2x-Linux';
  }
}

// ─── Paths ────────────────────────────────────────────────────────────────────

function localBinDir(globalStoragePath: string): string {
  return path.join(globalStoragePath, 'gsn2x', 'bin');
}

function localBinaryPath(globalStoragePath: string): string {
  return path.join(localBinDir(globalStoragePath), binaryName());
}

function localMetaPath(globalStoragePath: string): string {
  return path.join(globalStoragePath, 'gsn2x', 'meta.json');
}

// ─── Metadata helpers ─────────────────────────────────────────────────────────

function readLocalMeta(globalStoragePath: string): LocalMeta | undefined {
  const metaFile = localMetaPath(globalStoragePath);
  try {
    const raw = fs.readFileSync(metaFile, 'utf8');
    return JSON.parse(raw) as LocalMeta;
  } catch {
    return undefined;
  }
}

function writeLocalMeta(globalStoragePath: string, meta: LocalMeta): void {
  const metaFile = localMetaPath(globalStoragePath);
  fs.mkdirSync(path.dirname(metaFile), { recursive: true });
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf8');
}

// ─── Binary existence check ────────────────────────────────────────────────────

/** Returns true if the binary at `binaryPath` is executable. */
function binaryExists(binaryPath: string): boolean {
  try {
    fs.accessSync(binaryPath, fs.constants.X_OK);
    return true;
  } catch {
    // On Windows, X_OK is not meaningful – fall back to existence check
    return fs.existsSync(binaryPath);
  }
}

/** Returns true if `name` resolves to an executable on PATH. */
function isOnPath(name: string): boolean {
  const paths = (process.env.PATH ?? '').split(path.delimiter);
  return paths.some((dir) => binaryExists(path.join(dir, name)));
}

// ─── GitHub API ───────────────────────────────────────────────────────────────

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'vscode-gsn2x-preview',
        Accept: 'application/vnd.github+json',
      },
    };
    https
      .get(url, options, (res) => {
        // Follow redirects (GitHub API can 301/302)
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          resolve(httpsGet(res.headers.location));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/**
 * Fetches the latest stable release from GitHub.
 */
async function fetchLatestStableRelease(): Promise<GitHubRelease> {
  const data = await httpsGet(`${RELEASES_API}/latest`);
  return JSON.parse(data) as GitHubRelease;
}

/**
 * Fetches the latest nightly / pre-release from GitHub.
 * Falls back to latest stable if no pre-release is found.
 */
async function fetchLatestNightlyRelease(): Promise<GitHubRelease> {
  const data = await httpsGet(NIGHTLY_RELEASES_API);
  const releases = JSON.parse(data) as GitHubRelease[];
  const prerelease = releases.find((r) => r.prerelease);
  return prerelease ?? releases[0];
}

async function fetchLatestRelease(channel: ReleaseChannel): Promise<GitHubRelease> {
  return channel === 'nightly' ? fetchLatestNightlyRelease() : fetchLatestStableRelease();
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Downloads `url` to `destPath`, following redirects and showing a VS Code
 * progress notification.
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return Promise.resolve(
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Downloading gsn2x…',
        cancellable: false,
      },
      () =>
        new Promise<void>((resolve, reject) => {
          const doGet = (currentUrl: string) => {
            https
              .get(currentUrl, { headers: { 'User-Agent': 'vscode-gsn2x-preview' } }, (res) => {
                if (
                  res.statusCode &&
                  res.statusCode >= 300 &&
                  res.statusCode < 400 &&
                  res.headers.location
                ) {
                  doGet(res.headers.location);
                  return;
                }
                if (res.statusCode !== 200) {
                  reject(new Error(`HTTP ${res.statusCode} while downloading ${currentUrl}`));
                  return;
                }
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => file.close(() => resolve()));
                file.on('error', (err) => {
                  fs.unlink(destPath, () => {});
                  reject(err);
                });
              })
              .on('error', reject);
          };
          doGet(url);
        })
    )
  );
}

/**
 * Downloads the gsn2x binary for the current release into globalStoragePath
 * and records metadata. Returns the local binary path on success.
 */
async function downloadGsn2x(
  release: GitHubRelease,
  globalStoragePath: string,
  channel: ReleaseChannel
): Promise<string> {
  const assetName = expectedAssetName();
  const asset = release.assets.find((a) => a.name === assetName);

  if (!asset) {
    const available = release.assets.map((a) => a.name).join(', ');
    throw new Error(
      `No asset found for your platform (expected "${assetName}"). ` +
        `Available assets: ${available || 'none'}. ` +
        `Visit ${release.html_url} to download manually.`
    );
  }

  const destPath = localBinaryPath(globalStoragePath);
  await downloadFile(asset.browser_download_url, destPath);

  // Make executable on Unix
  if (process.platform !== 'win32') {
    fs.chmodSync(destPath, 0o755);
  }

  writeLocalMeta(globalStoragePath, {
    version: release.tag_name,
    downloadedAt: new Date().toISOString(),
    channel,
  });

  return destPath;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolves the path to the gsn2x executable, downloading it if needed.
 *
 * Priority:
 *   1. User-configured `gsn2xPreview.gsn2xPath` (if the file exists)
 *   2. `gsn2x` / `gsn2x.exe` on system PATH
 *   3. Previously downloaded local copy in globalStoragePath
 *   4. Offer to download; return undefined if the user declines
 *
 * @param context  The extension context (provides globalStoragePath and globalState)
 * @param channel  Which release channel to use when downloading
 */
export async function resolveGsn2xExecutable(
  context: vscode.ExtensionContext,
  channel: ReleaseChannel
): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('gsn2xPreview');
  const userConfiguredPath = config.get<string>('gsn2xPath');

  // 1. Explicit user path
  if (userConfiguredPath && userConfiguredPath !== 'gsn2x' && userConfiguredPath !== 'gsn2x.exe') {
    if (binaryExists(userConfiguredPath)) {
      return userConfiguredPath;
    }
    vscode.window.showWarningMessage(
      `gsn2x not found at configured path "${userConfiguredPath}". Falling back to PATH / local download.`
    );
  }

  // 2. System PATH
  if (isOnPath(binaryName())) {
    scheduleUpdateCheck(context, channel);
    return binaryName();
  }

  // 3. Previously downloaded binary
  const localPath = localBinaryPath(context.globalStoragePath);
  if (binaryExists(localPath)) {
    scheduleUpdateCheck(context, channel);
    return localPath;
  }

  // 4. Not found – offer to download
  return offerDownload(context, channel);
}

/**
 * Prompts the user to download gsn2x and performs the download.
 * Returns the local binary path on success, or undefined if declined / failed.
 */
async function offerDownload(
  context: vscode.ExtensionContext,
  channel: ReleaseChannel
): Promise<string | undefined> {
  const channelLabel = channel === 'nightly' ? 'latest nightly' : 'latest stable';
  const download = 'Download';
  const openSettings = 'Set Path in Settings';
  const dismiss = 'Dismiss';

  const choice = await vscode.window.showInformationMessage(
    `gsn2x was not found on your system. Would you like to download the ${channelLabel} release automatically?`,
    { modal: false },
    download,
    openSettings,
    dismiss
  );

  if (choice === openSettings) {
    vscode.commands.executeCommand('workbench.action.openSettings', 'gsn2xPreview.gsn2xPath');
    return undefined;
  }

  if (choice !== download) {
    return undefined;
  }

  try {
    const release = await fetchLatestRelease(channel);
    const localPath = await downloadGsn2x(release, context.globalStoragePath, channel);

    // Persist installed version in global state
    await context.globalState.update(INSTALLED_VERSION_KEY, release.tag_name);
    await context.globalState.update(INSTALLED_CHANNEL_KEY, channel);
    await context.globalState.update(LAST_UPDATE_CHECK_KEY, Date.now());

    vscode.window.showInformationMessage(`gsn2x ${release.tag_name} downloaded successfully.`);
    return localPath;
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to download gsn2x: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
}

// ─── Weekly update check ──────────────────────────────────────────────────────

/**
 * Schedules a background update check if more than UPDATE_CHECK_INTERVAL_MS
 * has elapsed since the last check. Runs asynchronously – never blocks activation.
 */
export function scheduleUpdateCheck(
  context: vscode.ExtensionContext,
  channel: ReleaseChannel
): void {
  const lastCheck = context.globalState.get<number>(LAST_UPDATE_CHECK_KEY, 0);
  const now = Date.now();

  if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) {
    return; // Checked recently – skip
  }

  // Run in the background so activation is not delayed
  void (async () => {
    try {
      await context.globalState.update(LAST_UPDATE_CHECK_KEY, now);
      await performUpdateCheck(context, channel);
    } catch (err) {
      // Update checks are best-effort; swallow errors silently
      console.error('[gsn2x] Update check failed:', err);
    }
  })();
}

/**
 * Checks whether a newer release is available and, if so, notifies the user
 * with options to update or view the release on GitHub.
 */
async function performUpdateCheck(
  context: vscode.ExtensionContext,
  channel: ReleaseChannel
): Promise<void> {
  const installedVersion =
    context.globalState.get<string>(INSTALLED_VERSION_KEY) ??
    readLocalMeta(context.globalStoragePath)?.version;

  if (!installedVersion) {
    // Binary on system PATH – cannot reliably determine installed version,
    // so skip the automated update prompt (the user manages it themselves).
    return;
  }

  const release = await fetchLatestRelease(channel);
  const latestVersion = release.tag_name;

  if (latestVersion === installedVersion) {
    return; // Already up to date
  }

  const channelLabel = channel === 'nightly' ? 'nightly' : 'stable';
  const update = 'Update Now';
  const viewRelease = 'View Release';
  const ignore = 'Ignore';

  const choice = await vscode.window.showInformationMessage(
    `A new ${channelLabel} version of gsn2x is available: ${latestVersion} (installed: ${installedVersion}).`,
    update,
    viewRelease,
    ignore
  );

  if (choice === viewRelease) {
    vscode.env.openExternal(vscode.Uri.parse(release.html_url));
    return;
  }

  if (choice === update) {
    try {
      await downloadGsn2x(release, context.globalStoragePath, channel);
      await context.globalState.update(INSTALLED_VERSION_KEY, latestVersion);
      await context.globalState.update(LAST_UPDATE_CHECK_KEY, Date.now());
      vscode.window
        .showInformationMessage(
          `gsn2x updated to ${latestVersion}. Reload the window to apply.`,
          'Reload Window'
        )
        .then((sel) => {
          if (sel === 'Reload Window') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
    } catch (err) {
      vscode.window.showErrorMessage(
        `Update failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
