const vscode = acquireVsCodeApi();

function simpleMarkdownParse(md) {
    const lines = md.split("\n");
    let html = "";
    let inCodeBlock = false;
    let codeBlock = "";
    const listStack = [];

    function getIndent(line) {
        let indent = 0;
        while (indent < line.length && line[indent] === " ") indent++;
        return indent;
    }

    function closeLists(targetIndent) {
        while (listStack.length > 0 && listStack[listStack.length - 1].indent >= targetIndent) {
            const list = listStack.pop();
            html += list.type === "ol" ? "</ol>" : "</ul>";
        }
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.startsWith("```")) {
            closeLists(0);
            if (inCodeBlock) {
                html += "<pre><code>" + codeBlock + "</code></pre>";
                inCodeBlock = false;
                codeBlock = "";
            } else {
                inCodeBlock = true;
            }
            continue;
        }
        if (inCodeBlock) {
            codeBlock += line + "\n";
            continue;
        }

        const indent = getIndent(line);
        const trimmed = line.substring(indent);

        if (trimmed.startsWith("# ")) {
            closeLists(0);
            html += "<h1>" + trimmed.substring(2) + "</h1>";
        } else if (trimmed.startsWith("## ")) {
            closeLists(0);
            html += "<h2>" + trimmed.substring(3) + "</h2>";
        } else if (trimmed.startsWith("### ")) {
            closeLists(0);
            html += "<h3>" + trimmed.substring(4) + "</h3>";
        } else if (trimmed.startsWith("#### ")) {
            closeLists(0);
            html += "<h4>" + trimmed.substring(5) + "</h4>";
        } else if (trimmed.match(/^\d+\. /)) {
            closeLists(indent);
            if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {
                html += "<ol>";
                listStack.push({ type: "ol", indent });
            }
            html += "<li>" + trimmed.replace(/^\d+\. /, "") + "</li>";
        } else if (trimmed.startsWith("- ")) {
            closeLists(indent);
            if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {
                html += "<ul>";
                listStack.push({ type: "ul", indent });
            }
            html += "<li>" + trimmed.substring(2) + "</li>";
        } else if (trimmed === "") {
            closeLists(0);
            html += "<br>";
        } else {
            closeLists(0);
            line = trimmed;
            line = line.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
            line = line.replace(/\*(.*?)\*/g, "<i>$1</i>");
            line = line.replace(/`([^`]+)`/g, "<code>$1</code>");
            html += "<p>" + line + "</p>";
        }
    }

    closeLists(0);
    return html;
}

function renderMarkdown() {
    const contentDiv = document.getElementById("content");
    if (!contentDiv) {
        return;
    }
    const content = window.markdownContent || "";
    contentDiv.innerHTML = simpleMarkdownParse(content);
}

function attachBackButtonHandler() {
    const backButton = document.getElementById("back-to-diagram");
    if (backButton) {
        backButton.addEventListener("click", () => {
            vscode.postMessage({ command: "backToDiagram" });
        });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    renderMarkdown();
    attachBackButtonHandler();
});
