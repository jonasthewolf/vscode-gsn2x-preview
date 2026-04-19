const vscode = acquireVsCodeApi();

function simpleMarkdownParse(md) {
    const lines = md.split("\n");
    let html = "";
    let inCodeBlock = false;
    let codeBlock = "";
    const listStack = [];
    let currentListItem = null;

    function getIndent(line) {
        let indent = 0;
        while (indent < line.length && line[indent] === " ") indent++;
        return indent;
    }

    function isListMarker(line) {
        // Check for ordered list (1., 2., etc.) or unordered list (-)
        return /^\d+\.\s/.test(line) || /^-\s/.test(line);
    }

    function flushCurrentListItem() {
        if (currentListItem && listStack.length > 0) {
            const list = listStack[listStack.length - 1];
            if (currentListItem.content) {
                html += "<li>" + currentListItem.content + "</li>";
            }
            currentListItem = null;
        }
    }

    function closeLists(targetIndent) {
        flushCurrentListItem();
        while (listStack.length > 0 && listStack[listStack.length - 1].indent >= targetIndent) {
            const list = listStack.pop();
            html += list.type === "ol" ? "</ol>" : "</ul>";
        }
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Code blocks
        if (line.trim().startsWith("```")) {
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

        // Check if this is a list item continuation (indented content within a list item)
        if (listStack.length > 0 && currentListItem && indent > listStack[listStack.length - 1].indent) {
            // This is a continuation of the current list item
            const content = trimmed;
            if (content) {
                if (currentListItem.content) {
                    currentListItem.content += "<br>" + content;
                } else {
                    currentListItem.content = content;
                }
            }
            continue;
        }

        // Headers
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
            // Ordered list item
            flushCurrentListItem();
            // Only close lists nested deeper than this item's indent
            while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {
                const list = listStack.pop();
                html += list.type === "ol" ? "</ol>" : "</ul>";
            }
            if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {
                html += "<ol>";
                listStack.push({ type: "ol", indent });
            }
            const itemContent = trimmed.replace(/^\d+\.\s/, "");
            currentListItem = { content: itemContent };
        } else if (trimmed.startsWith("- ")) {
            // Unordered list item
            flushCurrentListItem();
            while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {
                const list = listStack.pop();
                html += list.type === "ul" ? "</ul>" : "</ol>";
            }
            if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {
                html += "<ul>";
                listStack.push({ type: "ul", indent });
            }
            const itemContent = trimmed.substring(2);
            currentListItem = { content: itemContent };
        } else if (trimmed === "") {
            // Empty line - preserve it in list items, but don't close lists
            if (currentListItem) {
                // currentListItem.content += "<br>";
            } else {
                closeLists(0);
                html += "<br>";
            }
        } else {
            // Regular paragraph
            closeLists(0);
            let content = trimmed;
            content = content.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
            content = content.replace(/\*(.*?)\*/g, "<i>$1</i>");
            content = content.replace(/`([^`]+)`/g, "<code>$1</code>");
            html += "<p>" + content + "</p>";
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
