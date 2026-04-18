// src/extension.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { tmpdir } from 'os';


let svgPreviewPanel: vscode.WebviewPanel | undefined;
let yamlFilePath:string | undefined;
let wordWrap: number | undefined;
let lastSvgContent: string | undefined;

export function activate(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('gsn2xPreview');
    const defaultPath = process.platform === 'win32' ? 'gsn2x.exe' : 'gsn2x';
    const path_gsn2x = config.get<string>('gsn2xPath') ?? defaultPath;
    wordWrap = config.get<number>('wordWrap');

    // Create a temporary directory for SVG files
    let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsn2x"));

    context.subscriptions.push(
        vscode.commands.registerCommand('gsn2xPreview.open', async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('No active editor.');
                return;
            }

			yamlFilePath = activeEditor.document.uri.fsPath;
            // Set up a file watcher to update the preview on changes
			const yamlWatcher = vscode.workspace.createFileSystemWatcher(yamlFilePath);
			yamlWatcher.onDidChange(async (e) => {
				let svg = await run_gsn2x(path_gsn2x, tempDir, e.fsPath);
				showSvgPreview(svg);
			});

            try {
                let svg = await run_gsn2x(path_gsn2x, tempDir, yamlFilePath);
				showSvgPreview(svg);
            } catch (error) {
                console.error(error);
            }
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

}

async function run_gsn2x(command: string, outputPath: string, yamlFilePath: string): Promise<string> {
    // Execute the configured command-line tool
    return new Promise<string>((resolve, reject) => {
		let yamlintemp = path.join(outputPath, path.basename(yamlFilePath));
		fs.copyFileSync(yamlFilePath, yamlintemp);
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
    const isDark = theme.kind === vscode.ColorThemeKind.Dark || theme.kind === vscode.ColorThemeKind.HighContrast;
    const svgFilter = isDark ? 'filter: invert(1);' : '';

    return `<html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=20, user-scalable=yes">
                    <style>
                        body {
                            background-color: ${isDark ? '#1e1e1e' : 'white'};
                            color: ${isDark ? 'white' : 'black'};
                        }
                        svg {
                            ${svgFilter}
                        }
                    </style>
                </head>
                <body>${svgContent}</body>
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
            {}
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
