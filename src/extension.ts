// src/extension.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { copyYamlDependenciesRecursively } from './dependencyCopy';

let svgPreviewPanel: vscode.WebviewPanel | undefined;
let yamlFilePath: string | undefined;
let wordWrap: number | undefined;
let lastSvgContent: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('gsn2xPreview');
  const defaultPath = process.platform === 'win32' ? 'gsn2x.exe' : 'gsn2x';
  const path_gsn2x = config.get<string>('gsn2xPath') ?? defaultPath;
  wordWrap = config.get<number>('wordWrap');

  // Create a temporary directory for SVG files
  let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsn2x'));
  let yamlWatcher: vscode.FileSystemWatcher | undefined;

  const isYamlFile = (filePath: string) => /\.(ya?ml)$/i.test(filePath);

  const watchYamlFile = (filePath: string) => {
    yamlWatcher?.dispose();
    yamlWatcher = vscode.workspace.createFileSystemWatcher(filePath);
    yamlWatcher.onDidChange(async (e) => {
      if (e.fsPath === filePath) {
        const svg = await run_gsn2x(path_gsn2x, tempDir, filePath);
        showSvgPreview(svg);
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

    yamlFilePath = filePath;
    watchYamlFile(filePath);

    try {
      const svg = await run_gsn2x(path_gsn2x, tempDir, filePath);
      showSvgPreview(svg);
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
        const html = generateHtmlFromSvg(lastSvgContent);
        svgPreviewPanel.webview.html = html;
      }
    })
  );

  // Render current active editor if it is YAML at startup
  if (vscode.window.activeTextEditor) {
    renderYamlEditor(vscode.window.activeTextEditor);
  }
}

async function run_gsn2x(
  command: string,
  outputPath: string,
  yamlFilePath: string
): Promise<string> {
  // Execute the configured command-line tool
  return new Promise<string>((resolve, reject) => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const yamlintemp = copyYamlDependenciesRecursively(yamlFilePath, outputPath, workspaceFolder);
    const directory = path.dirname(yamlintemp);
    const baseName = path.basename(yamlintemp, path.extname(yamlintemp));
    const svgOutputPath = path.join(directory, `${baseName}.svg`);
    let args = ['-E', yamlintemp, `-o=${outputPath}`];
    if (wordWrap) {
      args.push('-w=' + wordWrap.toString());
    }
    const childProcess = cp.execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        resolve(`<html>
                            <head>
                                <style>body { color: red; }</style>
                            </head>
                            <body>
                                <h1>Error</h1>
                                <pre>${command}</pre>
                                <pre>${stderr}</pre>
                            </body>
                        </html>`);
      } else {
        const svgContent = fs.readFileSync(svgOutputPath, 'utf8');
        resolve(svgContent);
      }
    });

    // Capture standard error output
    childProcess.stderr?.on('data', (data) => {
      console.error(data.toString());
    });
  });
}

function generateHtmlFromSvg(svgContent: string): string {
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
                            padding: 20px;
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
                            top: 10px;
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
                    </style>
                </head>
                <body>
                    <div class="zoom-controls">
                        <button id="zoom-in">+</button>
                        <button id="zoom-out">-</button>
                        <button id="zoom-reset">Reset</button>
                        <span class="zoom-info" id="zoom-level">100%</span>
                    </div>
                    <div class="svg-container" id="svg-container">
                        ${svgContent}
                    </div>
                    <script>
                        window.addEventListener('DOMContentLoaded', () => {
                            let currentZoom = 1.0;
                            const zoomStep = 0.1;
                            const minZoom = 0.02;
                            const maxZoom = 50.0;
                            const svgContainer = document.getElementById('svg-container');
                            const zoomInfo = document.getElementById('zoom-level');
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
                                if (e.ctrlKey) {
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

                            updateZoom();
                        });
                    </script>
                </body>
             </html>`;
}

function showSvgPreview(svg: string) {
  lastSvgContent = svg;
  const html = generateHtmlFromSvg(svg);
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
    svgPreviewPanel.webview.html = html;

    // Dispose the panel when closed
    svgPreviewPanel.onDidDispose(() => {
      svgPreviewPanel = undefined;
    });
  }
}

export function deactivate() {
  // Clean up resources when the extension is deactivated
  // Remove the temporary directory if needed
}
