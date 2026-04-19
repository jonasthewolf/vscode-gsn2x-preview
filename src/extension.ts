// src/extension.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { copyYamlDependenciesRecursively } from './dependencyCopy';
import { generateMarkdownHtml } from './markdownRenderer';

let svgPreviewPanel: vscode.WebviewPanel | undefined;
let tempDir: string | undefined;
let wordWrap: number | undefined;
let lastSvgContent: string | undefined;
let previewHistory: string[] = [];
let historyIndex = -1;
let currentSvgPath: string | undefined;
let currentYamlPath: string | undefined;
let svgToYaml: Map<string, string> = new Map();
let statisticsPath: string | undefined;
let evidencePath: string | undefined;
let completePath: string | undefined;
let architecturePath: string | undefined;
let extensionUri: vscode.Uri | undefined;

export function activate(context: vscode.ExtensionContext) {
  extensionUri = context.extensionUri;
  const config = vscode.workspace.getConfiguration('gsn2xPreview');
  const defaultPath = process.platform === 'win32' ? 'gsn2x.exe' : 'gsn2x';
  const path_gsn2x = config.get<string>('gsn2xPath') ?? defaultPath;
  wordWrap = config.get<number>('wordWrap');

  // Create a temporary directory for SVG files
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsn2x'));
  let yamlWatcher: vscode.FileSystemWatcher | undefined;

  const isYamlFile = (filePath: string) => /\.(ya?ml)$/i.test(filePath);

  const watchYamlFile = (filePath: string) => {
    yamlWatcher?.dispose();
    yamlWatcher = vscode.workspace.createFileSystemWatcher(filePath);
    yamlWatcher.onDidChange(async (e) => {
      if (e.fsPath === filePath) {
        const result = await run_gsn2x(path_gsn2x, tempDir!, filePath);
        showSvgPreview(result.svgContent, result.svgPath, false, filePath);
      }
    });
    context.subscriptions.push(yamlWatcher);
  };

  const renderYamlEditor = async (editor: vscode.TextEditor | undefined) => {
    if (!editor) {
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!isYamlFile(filePath)) {
      return;
    }

    watchYamlFile(filePath);

    try {
      if (filePath !== currentSvgPath) {
        previewHistory = [];
        historyIndex = -1;
      }
      const result = await run_gsn2x(path_gsn2x, tempDir!, filePath);
      showSvgPreview(result.svgContent, result.svgPath, true, filePath);
    } catch (error) {
      console.error(error);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('gsn2xPreview.open', async () => {
      await renderYamlEditor(vscode.window.activeTextEditor);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      await renderYamlEditor(editor);
    })
  );

  // Listen for theme changes and update the webview
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (svgPreviewPanel && lastSvgContent) {
        const html = generateHtmlFromSvg(lastSvgContent, canNavigateBack(), canNavigateForward(), currentYamlPath);
        svgPreviewPanel.webview.html = html;
      }
    })
  );

  // Render current active editor if it is YAML at startup
  if (vscode.window.activeTextEditor) {
    renderYamlEditor(vscode.window.activeTextEditor);
  }
}

interface SvgResult {
  svgContent: string;
  svgPath: string;
}

async function run_gsn2x(
  command: string,
  outputPath: string,
  yamlFilePath: string
): Promise<SvgResult> {
  // Execute the configured command-line tool
  return new Promise<SvgResult>((resolve) => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const { copiedEntryPath, copiedToOriginal } = copyYamlDependenciesRecursively(yamlFilePath, outputPath, workspaceFolder);
    const yamlintemp = copiedEntryPath;
    const directory = path.dirname(yamlintemp);
    const baseName = path.basename(yamlintemp, path.extname(yamlintemp));
    const svgOutputPath = path.join(directory, `${baseName}.svg`);
    const args = [yamlintemp, `-o=${outputPath}`, '--statistics=statistics.md', '--evidence=evidence.md'];
    if (wordWrap) {
      args.push('-w=' + wordWrap.toString());
    }
    const childProcess = cp.execFile(command, args, { cwd: outputPath }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          svgContent: `<html>
                            <head>
                                <style>
                                    body { color: red; }
                                    .error-msg { white-space: pre-wrap; font-family: monospace; }
                                </style>
                            </head>
                            <body>
                                <h1>Error</h1>
                                <div>Command: <code>${command}</code></div>
                                <div class="error-msg">${stderr}</div>
                            </body>
                        </html>`,
          svgPath: svgOutputPath,
        });
      } else {
        const svgContent = fs.readFileSync(svgOutputPath, 'utf8');
        for (const [copiedYaml, originalYaml] of copiedToOriginal) {
          const dir = path.dirname(copiedYaml);
          const baseName = path.basename(copiedYaml, path.extname(copiedYaml));
          const svgPath = path.join(dir, baseName + '.svg');
          if (fs.existsSync(svgPath)) {
            svgToYaml.set(svgPath, originalYaml);
          }
        }
        statisticsPath = path.join(outputPath, 'statistics.md');
        if (!fs.existsSync(statisticsPath)) statisticsPath = undefined;
        evidencePath = path.join(outputPath, 'evidence.md');
        if (!fs.existsSync(evidencePath)) evidencePath = undefined;
        completePath = path.join(outputPath, 'complete.svg');
        if (!fs.existsSync(completePath)) completePath = undefined;
        architecturePath = path.join(outputPath, 'architecture.svg');
        if (!fs.existsSync(architecturePath)) architecturePath = undefined;
        resolve({ svgContent, svgPath: svgOutputPath });
      }
    });

    // Capture standard error output
    childProcess.stderr?.on('data', (data) => {
      console.error(data.toString());
    });
  });
}

function generateHtmlFromSvg(
  svgContent: string,
  backEnabled: boolean,
  forwardEnabled: boolean,
  yamlPath?: string,
  anchor?: string
): string {
  const theme = vscode.window.activeColorTheme;
  const isDark =
    theme.kind === vscode.ColorThemeKind.Dark || theme.kind === vscode.ColorThemeKind.HighContrast;
  const svgFilter = isDark ? 'filter: invert(1);' : '';

  return `<html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=20, user-scalable=yes">
                    <style>
                        body {
                            background-color: ${isDark ? '#1e1e1e' : 'white'};
                            color: ${isDark ? 'white' : 'black'};
                            margin: 0;
                            padding: 40px 20px 20px 20px;
                            overflow: auto;
                            min-height: 100vh;
                        }
                        .svg-container {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            width: 100%;
                            height: calc(100vh - 100px);
                            margin: 0;
                            padding: 0;
                            overflow: hidden;
                            transform-origin: center center;
                            transition: transform 0.1s ease;
                            transform: scale(1);
                        }
                        svg {
                            ${svgFilter}
                            max-width: 100%;
                            max-height: 100%;
                            width: auto;
                            height: auto;
                            display: block;
                            transform-origin: center center;
                            transform-box: fill-box;
                        }
                        .zoom-controls {
                            position: fixed;
                            top: 35px;
                            right: 10px;
                            background: ${isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
                            border: 1px solid ${isDark ? '#555' : '#ccc'};
                            border-radius: 4px;
                            padding: 5px;
                            z-index: 1000;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                        }
                        .zoom-controls button {
                            background: ${isDark ? '#444' : '#f0f0f0'};
                            color: ${isDark ? 'white' : 'black'};
                            border: 1px solid ${isDark ? '#666' : '#ccc'};
                            padding: 5px 10px;
                            margin: 0 2px;
                            border-radius: 3px;
                            cursor: pointer;
                            font-size: 14px;
                        }
                        .zoom-controls button:hover {
                            background: ${isDark ? '#555' : '#e0e0e0'};
                        }
                        .zoom-info {
                            display: inline-block;
                            margin: 0 10px;
                            font-family: monospace;
                            font-size: 12px;
                            font-weight: bold;
                        }
                        .file-path-bar {
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            background-color: ${isDark ? '#1e1e1e' : 'white'};
                            color: ${isDark ? 'white' : 'black'};
                            padding: 5px 10px;
                            font-family: var(--vscode-font-family);
                            font-size: 12px;
                            border-bottom: 1px solid ${isDark ? '#3e3e42' : '#cccccc'};
                            z-index: 1001;
                        }
                        .file-path {
                            font-weight: 600;
                        }
                        .extra-links-bar {
                            display: flex;
                            justify-content: flex-end;
                            padding: 10px;
                            background-color: ${isDark ? '#252526' : '#f3f3f3'};
                            border-top: 1px solid ${isDark ? '#3e3e42' : '#cccccc'};
                        }
                        .extra-links-bar button {
                            background: ${isDark ? '#0e639c' : '#007acc'};
                            color: white;
                            border: none;
                            padding: 5px 10px;
                            margin: 0 5px;
                            border-radius: 3px;
                            cursor: pointer;
                            font-size: 12px;
                        }
                        .extra-links-bar button:hover {
                            background: ${isDark ? '#1177bb' : '#005a9e'};
                        }
                    </style>
                </head>
                <body>
                    <div class="file-path-bar">
                        <span class="file-path">${yamlPath ? vscode.workspace.asRelativePath(yamlPath) : 'Unknown'}</span>
                    </div>
                    <div class="zoom-controls">
                        <button id="nav-back" ${backEnabled ? '' : 'disabled'}>&larr;</button>
                        <button id="nav-forward" ${forwardEnabled ? '' : 'disabled'}>&rarr;</button>
                        <button id="zoom-in">+</button>
                        <button id="zoom-out">-</button>
                        <button id="zoom-reset">Reset</button>
                        <span class="zoom-info" id="zoom-level">100%</span>
                    </div>
                    <div class="svg-container" id="svg-container">
                        ${svgContent}
                    </div>
                    <div class="extra-links-bar">
                        ${statisticsPath ? '<button id="show-statistics">Statistics</button>' : ''}
                        ${evidencePath ? '<button id="show-evidence">Evidence</button>' : ''}
                        ${completePath ? '<button id="show-complete">Complete View</button>' : ''}
                        ${architecturePath ? '<button id="show-architecture">Architecture View</button>' : ''}
                    </div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        window.addEventListener('DOMContentLoaded', () => {
                            let currentZoom = 1.0;
                            const zoomStep = 0.1;
                            const minZoom = 0.02;
                            const maxZoom = 50.0;
                            const svgContainer = document.getElementById('svg-container');
                            const zoomInfo = document.getElementById('zoom-level');
                            const navBackButton = document.getElementById('nav-back');
                            const navForwardButton = document.getElementById('nav-forward');
                            const zoomInButton = document.getElementById('zoom-in');
                            const zoomOutButton = document.getElementById('zoom-out');
                            const resetButton = document.getElementById('zoom-reset');

                            function updateZoom() {
                                if (svgContainer) {
                                    svgContainer.style.transform = 'scale(' + currentZoom + ')';
                                }
                                if (zoomInfo) {
                                    zoomInfo.textContent = Math.round(currentZoom * 100) + '%';
                                }
                            }

                            function zoomIn() {
                                if (currentZoom < maxZoom) {
                                    currentZoom = Math.min(maxZoom, currentZoom + zoomStep);
                                    updateZoom();
                                }
                            }

                            function zoomOut() {
                                if (currentZoom > minZoom) {
                                    currentZoom = Math.max(minZoom, currentZoom - zoomStep);
                                    updateZoom();
                                }
                            }

                            function resetZoom() {
                                currentZoom = 1.0;
                                updateZoom();
                            }

                            if (navBackButton) {
                                navBackButton.addEventListener('click', () => {
                                    vscode.postMessage({ command: 'goBack' });
                                });
                            }
                            if (navForwardButton) {
                                navForwardButton.addEventListener('click', () => {
                                    vscode.postMessage({ command: 'goForward' });
                                });
                            }
                            if (zoomInButton) {
                                zoomInButton.addEventListener('click', zoomIn);
                            }
                            if (zoomOutButton) {
                                zoomOutButton.addEventListener('click', zoomOut);
                            }
                            if (resetButton) {
                                resetButton.addEventListener('click', resetZoom);
                            }

                            document.addEventListener('wheel', function(e) {
                                if (e.ctrlKey) {
                                    e.preventDefault();
                                    if (e.deltaY < 0) {
                                        zoomIn();
                                    } else {
                                        zoomOut();
                                    }
                                }
                            });

                            document.addEventListener('keydown', function(e) {
                                if (e.ctrlKey || e.metaKey) {
                                    switch (e.key) {
                                        case '=':
                                        case '+':
                                            e.preventDefault();
                                            zoomIn();
                                            break;
                                        case '-':
                                            e.preventDefault();
                                            zoomOut();
                                            break;
                                        case '0':
                                            e.preventDefault();
                                            resetZoom();
                                            break;
                                    }
                                }
                            });

                            document.addEventListener('click', function(e) {
                                if (e.target.tagName === 'A' || e.target.closest('a')) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    document.querySelectorAll('a').forEach(a => a.style.pointerEvents = 'none');
                                    const anchor = e.target.tagName === 'A' ? e.target : e.target.closest('a');
                                    const href = anchor.getAttribute('href') || anchor.getAttribute('xlink:href');
                                    if (href) {
                                        vscode.postMessage({ command: 'navigateLink', href });
                                    }
                                }
                            }, true);

                            window.addEventListener('message', event => {
                                const message = event.data;
                                if (message.command === 'enableLinks') {
                                    document.querySelectorAll('a').forEach(a => a.style.pointerEvents = 'auto');
                                }
                            });

                            updateZoom();

                            if ('${anchor}') {
                                const element = document.getElementById('${anchor}');
                                if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            }

                            const showStatisticsButton = document.getElementById('show-statistics');
                            if (showStatisticsButton) {
                                showStatisticsButton.addEventListener('click', () => {
                                    vscode.postMessage({ command: 'showStatistics' });
                                });
                            }
                            const showEvidenceButton = document.getElementById('show-evidence');
                            if (showEvidenceButton) {
                                showEvidenceButton.addEventListener('click', () => {
                                    vscode.postMessage({ command: 'showEvidence' });
                                });
                            }
                            const showCompleteButton = document.getElementById('show-complete');
                            if (showCompleteButton) {
                                showCompleteButton.addEventListener('click', () => {
                                    vscode.postMessage({ command: 'showComplete' });
                                });
                            }
                            const showArchitectureButton = document.getElementById('show-architecture');
                            if (showArchitectureButton) {
                                showArchitectureButton.addEventListener('click', () => {
                                    vscode.postMessage({ command: 'showArchitecture' });
                                });
                            }
                        });
                    </script>
                </body>
             </html>`;
}

function showSvgPreview(svg: string, svgPath?: string, addToHistory = false, yamlPath?: string, anchor?: string) {
  lastSvgContent = svg;

  if (svgPath) {
    currentSvgPath = svgPath;
    if (addToHistory) {
      if (historyIndex < previewHistory.length - 1) {
        previewHistory = previewHistory.slice(0, historyIndex + 1);
      }
      previewHistory.push(svgPath);
      historyIndex = previewHistory.length - 1;
    }
  }

  if (yamlPath) {
    currentYamlPath = yamlPath;
  } else if (svgPath && svgToYaml.has(svgPath)) {
    currentYamlPath = svgToYaml.get(svgPath)!;
  }

  const html = generateHtmlFromSvg(svg, canNavigateBack(), canNavigateForward(), currentYamlPath, anchor);
  if (svgPreviewPanel) {
    // Update existing preview
    svgPreviewPanel.webview.html = html;
  } else {
    // Create a new preview panel
    svgPreviewPanel = vscode.window.createWebviewPanel(
      'gsnPreview',
      'GSN Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
      }
    );

    svgPreviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (!message || !message.command) {
        return;
      }

      switch (message.command) {
        case 'navigateLink': {
          await handleSvgLink(message.href);
          if (svgPreviewPanel) {
            svgPreviewPanel.webview.postMessage({ command: 'enableLinks' });
          }
          break;
        }
        case 'goBack': {
          navigateHistory(-1);
          break;
        }
        case 'goForward': {
          navigateHistory(1);
          break;
        }
        case 'showStatistics': {
          if (statisticsPath && svgPreviewPanel && extensionUri) {
            const content = fs.readFileSync(statisticsPath, 'utf8');
            const html = generateMarkdownHtml(content, svgPreviewPanel.webview, extensionUri);
            svgPreviewPanel.webview.html = html;
          }
          break;
        }
        case 'showEvidence': {
          if (evidencePath && svgPreviewPanel && extensionUri) {
            const content = fs.readFileSync(evidencePath, 'utf8');
            const html = generateMarkdownHtml(content, svgPreviewPanel.webview, extensionUri);
            svgPreviewPanel.webview.html = html;
          }
          break;
        }
        case 'showComplete': {
          if (completePath && svgPreviewPanel) {
            const svgContent = fs.readFileSync(completePath, 'utf8');
            showSvgPreview(svgContent, completePath, true, currentYamlPath);
          }
          break;
        }
        case 'showArchitecture': {
          if (architecturePath && svgPreviewPanel) {
            const svgContent = fs.readFileSync(architecturePath, 'utf8');
            showSvgPreview(svgContent, architecturePath, true, currentYamlPath);
          }
          break;
        }
        case 'backToDiagram': {
          if (svgPreviewPanel && lastSvgContent) {
            const html = generateHtmlFromSvg(lastSvgContent, canNavigateBack(), canNavigateForward(), currentYamlPath);
            svgPreviewPanel.webview.html = html;
          }
          break;
        }
      }
    });

    svgPreviewPanel.webview.html = html;

    // Dispose the panel when closed
    svgPreviewPanel.onDidDispose(() => {
      svgPreviewPanel = undefined;
    });
  }
}

async function handleSvgLink(href: string): Promise<void> {
  if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
    return;
  }

  const [fileHref, anchor] = href.split('#');
  const isExternal = /^(https?:|mailto:|tel:|ftp:)/i.test(fileHref);
  if (isExternal) {
    const open = { title: 'Open externally' };
    const cancel = { title: 'Cancel' };
    const choice = await vscode.window.showInformationMessage(
      'This link points outside the preview. Open in your browser?',
      { modal: true },
      open,
      cancel
    );
    if (choice === open) {
      vscode.env.openExternal(vscode.Uri.parse(fileHref));
    }
    return;
  }

  const baseDir = currentSvgPath ? path.dirname(currentSvgPath) : tempDir || '';
  const targetPath = path.isAbsolute(fileHref) ? fileHref : path.join(baseDir, fileHref);

  if (!fs.existsSync(targetPath)) {
    vscode.window.showWarningMessage(`Referenced file not found: ${fileHref}`);
    return;
  }

  if (!targetPath.toLowerCase().endsWith('.svg')) {
    vscode.window.showWarningMessage('Only SVG files can be previewed.');
    return;
  }

  if (tempDir && !targetPath.startsWith(tempDir)) {
    const open = { title: 'Open externally' };
    const cancel = { title: 'Cancel' };
    const choice = await vscode.window.showInformationMessage(
      'The referenced file is outside the preview folder. Open it externally?',
      { modal: true },
      open,
      cancel
    );
    if (choice === open) {
      vscode.env.openExternal(vscode.Uri.file(targetPath));
    }
    return;
  }

  try {
    const svgContent = fs.readFileSync(targetPath, 'utf8');
    showSvgPreview(svgContent, targetPath, true, svgToYaml.get(targetPath), anchor);
  } catch (error) {
    console.error(error);
  }
}

function canNavigateBack(): boolean {
  return historyIndex > 0;
}

function canNavigateForward(): boolean {
  return historyIndex < previewHistory.length - 1;
}

function navigateHistory(step: number) {
  const newIndex = historyIndex + step;
  if (newIndex < 0 || newIndex >= previewHistory.length) {
    return;
  }

  historyIndex = newIndex;
  const targetPath = previewHistory[historyIndex];
  try {
    const svgContent = fs.readFileSync(targetPath, 'utf8');
    showSvgPreview(svgContent, targetPath, false, svgToYaml.get(targetPath));
  } catch (error) {
    console.error(error);
  }
}

export function deactivate() {
  // Clean up resources when the extension is deactivated
  // Remove the temporary directory if needed
}
