# GSN Preview for VS Code

A VS Code extension that provides live preview of GSN (Goal Structuring Notation) YAML files using the `gsn2x` tool. This extension allows you to visualize and navigate GSN diagrams directly within VS Code.

## Features

### Core Functionality

- **Live Preview**: Automatically generates and displays SVG diagrams from GSN YAML files using `gsn2x`
- **Interactive Navigation**: Click on links in diagrams to navigate between related GSN elements
- **Navigation History**: Use back/forward buttons to navigate through diagram history
- **Zoom Controls**: Zoom in/out and reset zoom with mouse wheel or keyboard shortcuts (Ctrl+Scroll, Ctrl+/-, Ctrl+0)

### Additional Views

- **Statistics**: View generated statistics about the GSN model
- **Evidence**: Display evidence files associated with the GSN model
- **Complete View**: Access the complete diagram view (if generated)
- **Architecture View**: View the architecture diagram (if generated)


## Requirements

- **gsn2x**: The `gsn2x` command-line tool must be installed and available in your PATH, or configured via extension settings
- **VS Code**: Version 1.87.0 or higher

### Installing gsn2x

Download the appropriate version for your platform from the [gsn2x releases](https://github.com/gsn2x/gsn2x/releases).

## Extension Settings

This extension contributes the following settings:

- `gsn2xPreview.gsn2xPath`: Path to the `gsn2x` executable (default: "gsn2x")
- `gsn2xPreview.wordWrap`: Word wrap width for diagram text (default: 15)

## Usage

1. Open a GSN YAML file in VS Code
2. Use Command Palette (`Ctrl+Shift+P`) and select "Preview file using gsn2x"
3. The diagram will be generated and displayed in a side panel
4. Click on elements to navigate to linked diagrams
5. Use the buttons at the bottom to view statistics, evidence, or additional diagram views

### Keyboard Shortcuts

- `Ctrl+Scroll`: Zoom in/out
- `Ctrl++`: Zoom in
- `Ctrl+-`: Zoom out
- `Ctrl+0`: Reset zoom

## Known Issues

- The extension requires `gsn2x` to be properly installed and configured
- Some complex GSN models may take time to render

## Release Notes

### 0.0.1

Initial release with core GSN preview functionality:

- Basic SVG diagram rendering
- Link navigation
- Zoom controls
- Statistics and evidence viewing
- Complete and architecture view support
- Custom markdown renderer with nested list support

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

- Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
- Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
- Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

- [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
- [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
