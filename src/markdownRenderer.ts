import * as vscode from 'vscode';

export function generateMarkdownHtml(content: string, webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const theme = vscode.window.activeColorTheme;
    const isDark = theme.kind === vscode.ColorThemeKind.Dark || theme.kind === vscode.ColorThemeKind.HighContrast;

    const escapedContent = JSON.stringify(content);
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'markdown.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'markdown.js'));
    const bodyClass = isDark ? 'theme-dark' : 'theme-light';

    return `<html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" href="${styleUri}">
                </head>
                <body class="${bodyClass}">
                    <button class="back-button" id="back-to-diagram">← Back to Diagram</button>
                    <div class="markdown-content" id="content"></div>
                    <script>window.markdownContent = ${escapedContent};</script>
                    <script src="${scriptUri}"></script>
                </body>
             </html>`;
}