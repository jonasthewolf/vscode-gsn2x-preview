import * as vscode from 'vscode';

export function generateMarkdownHtml(content: string): string {
  const theme = vscode.window.activeColorTheme;
  const isDark = theme.kind === vscode.ColorThemeKind.Dark || theme.kind === vscode.ColorThemeKind.HighContrast;


  const escapedContent = JSON.stringify(content);
  const scriptContent = 'function simpleMarkdownParse(md) {' +
    'const lines = md.split("\\n");' +
    'let html = "";' +
    'let inCodeBlock = false;' +
    'let codeBlock = "";' +
    'let listStack = [];' + // stack of {type: "ul"|"ol", indent: number}
    'function getIndent(line) {' +
    'let indent = 0;' +
    'while (indent < line.length && line[indent] === " ") indent++;' +
    'return indent;' +
    '}' +
    'function closeLists(targetIndent) {' +
    'while (listStack.length > 0 && listStack[listStack.length - 1].indent >= targetIndent) {' +
    'const list = listStack.pop();' +
    'html += list.type === "ol" ? "</ol>" : "</ul>";' +
    '}' +
    '}' +
    'for (let i = 0; i < lines.length; i++) {' +
    'let line = lines[i];' +
    'if (line.startsWith("```")) {' +
    'closeLists(0);' +
    'if (inCodeBlock) {' +
    'html += "<pre><code>" + codeBlock + "</code></pre>";' +
    'inCodeBlock = false;' +
    'codeBlock = "";' +
    '} else {' +
    'inCodeBlock = true;' +
    '}' +
    'continue;' +
    '}' +
    'if (inCodeBlock) {' +
    'codeBlock += line + "\\n";' +
    'continue;' +
    '}' +
    'const indent = getIndent(line);' +
    'const trimmed = line.substring(indent);' +
    'if (trimmed.startsWith("# ")) {' +
    'closeLists(0);' +
    'html += "<h1>" + trimmed.substring(2) + "</h1>";' +
    '} else if (trimmed.startsWith("## ")) {' +
    'closeLists(0);' +
    'html += "<h2>" + trimmed.substring(3) + "</h2>";' +
    '} else if (trimmed.startsWith("### ")) {' +
    'closeLists(0);' +
    'html += "<h3>" + trimmed.substring(4) + "</h3>";' +
    '} else if (trimmed.startsWith("#### ")) {' +
    'closeLists(0);' +
    'html += "<h4>" + trimmed.substring(5) + "</h4>";' +
    '} else if (trimmed.match(/^\\d+\\. /)) {' +
    'closeLists(indent);' +
    'while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {' +
    'closeLists(listStack[listStack.length - 1].indent);' +
    '}' +
    'if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {' +
    'html += "<ol>";' +
    'listStack.push({type: "ol", indent: indent});' +
    '}' +
    'html += "<li>" + trimmed.replace(/^\\d+\\. /, "") + "</li>";' +
    '} else if (trimmed.startsWith("- ")) {' +
    'closeLists(indent);' +
    'while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {' +
    'closeLists(listStack[listStack.length - 1].indent);' +
    '}' +
    'if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {' +
    'html += "<ul>";' +
    'listStack.push({type: "ul", indent: indent});' +
    '}' +
    'html += "<li>" + trimmed.substring(2) + "</li>";' +
    '} else if (trimmed === "") {' +
    'closeLists(0);' +
    'html += "<br>";' +
    '} else {' +
    'closeLists(0);' +
    'line = trimmed;' +
    'line = line.replace(/\\*\\*(.*?)\\*\\*/g, "<b>$1</b>");' +
    'line = line.replace(/\\*(.*?)\\*/g, "<i>$1</i>");' +
    'line = line.replace(/`([^`]+)`/g, "<code>$1</code>");' +
    'html += "<p>" + line + "</p>";' +
    '}' +
    '}' +
    'closeLists(0);' +
    'console.log(html);' +
    'return html;' +
    '}' +
    'const content = ' + escapedContent + ';' +
    'const contentDiv = document.getElementById("content");' +
    'contentDiv.innerHTML = simpleMarkdownParse(content);';

  const css = 'body { background-color: ' + (isDark ? '#1e1e1e' : 'white') + '; color: ' + (isDark ? 'white' : 'black') + '; margin: 20px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }' +
    'h1, h2, h3, h4, h5, h6 { color: ' + (isDark ? '#ffffff' : '#000000') + '; margin-top: 1.5em; margin-bottom: 0.5em; }' +
    'h1 { border-bottom: 2px solid ' + (isDark ? '#ffffff' : '#000000') + '; padding-bottom: 0.3em; }' +
    'p { line-height: 1.6; margin-bottom: 1em; }' +
    'code { background-color: ' + (isDark ? '#2d2d30' : '#f3f3f3') + '; padding: 2px 4px; border-radius: 3px; font-family: \'Courier New\', monospace; }' +
    'pre { background-color: ' + (isDark ? '#2d2d30' : '#f3f3f3') + '; padding: 1em; border-radius: 5px; overflow-x: auto; margin: 1em 0; }' +
    'pre code { background: none; padding: 0; }' +
    'ul, ol { margin-left: 2em; margin-bottom: 1em; }' +
    'blockquote { border-left: 4px solid ' + (isDark ? '#555' : '#ccc') + '; padding-left: 1em; margin: 1em 0; color: ' + (isDark ? '#ccc' : '#666') + '; }' +
    'table { border-collapse: collapse; margin: 1em 0; width: 100%; }' +
    'th, td { border: 1px solid ' + (isDark ? '#555' : '#ccc') + '; padding: 8px 12px; text-align: left; }' +
    'th { background-color: ' + (isDark ? '#2d2d30' : '#f3f3f3') + '; font-weight: bold; }' +
    '.back-button { background: ' + (isDark ? '#0e639c' : '#007acc') + '; color: white; border: none; padding: 8px 16px; border-radius: 3px; cursor: pointer; margin-bottom: 20px; font-size: 14px; }' +
    '.back-button:hover { background: ' + (isDark ? '#1177bb' : '#005a9e') + '; }' +
    '.markdown-content { max-width: 800px; }';

  return `<html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>${css}</style>
                </head>
                <body>
                    <button class="back-button" onclick="vscode.postMessage({ command: 'backToDiagram' })">← Back to Diagram</button>
                    <div class="markdown-content" id="content"></div>
                    <script>const vscode = acquireVsCodeApi();</script>
                    <script>${scriptContent}</script>
                </body>
             </html>`;
}