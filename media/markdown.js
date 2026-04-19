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

    // Apply inline formatting: bold, italic, code, and links.
    function inlineFormat(text) {
        // Markdown links: [label](url)
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
            const escaped = url.replace(/'/g, "\\'");
            return `<a href="#" onclick="vscode.postMessage({command:'navigateLink',href:'${escaped}'});return false;">${label}</a>`;
        });
        // Bare URLs not already wrapped in an <a> tag.
        text = text.replace(/(?<!href=['"])https?:\/\/[^\s<"')]+/g, (url) => {
            const escaped = url.replace(/'/g, "\\'");
            return `<a href="#" onclick="vscode.postMessage({command:'navigateLink',href:'${escaped}'});return false;">${url}</a>`;
        });
        text = text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
        text = text.replace(/\*(.*?)\*/g, "<i>$1</i>");
        text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
        return text;
    }

    function flushCurrentListItem() {
        if (currentListItem && listStack.length > 0) {
            if (currentListItem.content) {
                html += "<li>" + inlineFormat(currentListItem.content) + "</li>";
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

        // List item continuation (indented content within a list item)
        if (listStack.length > 0 && currentListItem && indent > listStack[listStack.length - 1].indent) {
            if (trimmed) {
                currentListItem.content += "<br>" + trimmed;
            }
            continue;
        }

        // Explicit Markdown headers
        if (trimmed.startsWith("# ")) {
            closeLists(0);
            html += "<h1>" + inlineFormat(trimmed.substring(2)) + "</h1>";
        } else if (trimmed.startsWith("## ")) {
            closeLists(0);
            html += "<h2>" + inlineFormat(trimmed.substring(3)) + "</h2>";
        } else if (trimmed.startsWith("### ")) {
            closeLists(0);
            html += "<h3>" + inlineFormat(trimmed.substring(4)) + "</h3>";
        } else if (trimmed.startsWith("#### ")) {
            closeLists(0);
            html += "<h4>" + inlineFormat(trimmed.substring(5)) + "</h4>";

        // Treat known section titles as implicit h1 headings.
        } else if (trimmed === "Statistics" || trimmed === "List of Evidence") {
            closeLists(0);
            html += "<h1>" + trimmed + "</h1>";

        } else if (trimmed.match(/^\d+\. /)) {
            // Ordered list item
            flushCurrentListItem();
            while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {
                const list = listStack.pop();
                html += list.type === "ol" ? "</ol>" : "</ul>";
            }
            if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {
                html += "<ol>";
                listStack.push({ type: "ol", indent });
            }
            currentListItem = { content: trimmed.replace(/^\d+\.\s/, "") };
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
            currentListItem = { content: trimmed.substring(2) };
        } else if (trimmed === "") {
            if (!currentListItem) {
                closeLists(0);
                html += "<br>";
            }
        } else {
            // Regular paragraph
            closeLists(0);
            html += "<p>" + inlineFormat(trimmed) + "</p>";
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