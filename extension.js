const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");

function activate(context) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1000
  );
  item.tooltip = "Git blame (ligne courante)";
  context.subscriptions.push(item);

  function updateBlame() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      item.hide();
      return;
    }

    const doc = editor.document;

    if (doc.isUntitled || doc.isDirty) {
      item.text = "$(person) fichier non sauvegardé";
      item.show();
      return;
    }

    const line = editor.selection.active.line + 1;
    const filePath = doc.fileName;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const cwd = workspaceFolder
      ? workspaceFolder.uri.fsPath
      : path.dirname(filePath);

    const args = ["blame", "-L", `${line},${line}`, "--porcelain", filePath];

    cp.execFile("git", args, { cwd }, (err, stdout) => {
      if (err || !stdout) {
        item.hide();
        return;
      }

      const authorMatch = stdout.match(/^author (.+)$/m);
      const summaryMatch = stdout.match(/^summary (.+)$/m);

      const author = authorMatch ? authorMatch[1] : "Inconnu";
      const summary = summaryMatch ? summaryMatch[1] : "";

      item.text = "$(person) " + author + (summary ? " — " + summary : "");
      item.show();
    });
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateBlame),
    vscode.window.onDidChangeTextEditorSelection(updateBlame)
  );

  updateBlame();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
