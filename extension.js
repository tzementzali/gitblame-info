const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");

// Stockage des informations de blame pour l'affichage détaillé
let blameInfo = {
  author: "",
  date: "",
  commitId: "", // Hash complet du commit
  commitMessage: "",
};

function activate(context) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1000
  );
  item.command = "gitblame-info.showDetails";
  context.subscriptions.push(item);

  // Fonction pour mettre à jour le tooltip avec toutes les informations
  function updateTooltip() {
    if (!blameInfo.commitId) {
      item.tooltip = "Cliquez pour voir les détails du commit";
      return;
    }

    const dateTime = blameInfo.date || "Date inconnue";
    const author = blameInfo.author || "Auteur inconnu";
    const commitId = blameInfo.commitId
      ? blameInfo.commitId.substring(0, 7)
      : "N/A";
    const message = blameInfo.commitMessage || "Aucun message";

    // Format exact : <NOM UTILISATEUR> - <DATE HEURE DU COMMIT>
    // <COMMIT ID>
    // <COMMIT MESSAGE>
    item.tooltip = new vscode.MarkdownString(
      `**${author} - ${dateTime}**\n\n\`${commitId}\`\n\n${message}`
    );
  }

  // Commande pour afficher les détails du commit dans une tooltip
  const showDetailsCommand = vscode.commands.registerCommand(
    "gitblame-info.showDetails",
    () => {
      if (!blameInfo.commitId) {
        return;
      }

      const dateTime = blameInfo.date || "Date inconnue";
      const author = blameInfo.author || "Auteur inconnu";
      const commitId = blameInfo.commitId
        ? blameInfo.commitId.substring(0, 7)
        : "N/A";
      const message = blameInfo.commitMessage || "Aucun message";

      // Créer une tooltip compacte avec QuickPick stylisé comme un bloc
      const tooltip = vscode.window.createQuickPick();
      
      // Format exact demandé : <NOM UTILISATEUR> - <DATE HEURE DU COMMIT>
      // <COMMIT ID>
      // <COMMIT MESSAGE>
      tooltip.title = `${author} - ${dateTime}`;
      tooltip.placeholder = commitId;
      
      // Afficher le message comme un item unique
      tooltip.items = [
        {
          label: message,
          description: "",
          alwaysShow: true,
        },
      ];
      
      // Configuration pour ressembler à une tooltip
      tooltip.canSelectMany = false;
      tooltip.ignoreFocusOut = false;
      tooltip.matchOnDescription = false;
      tooltip.matchOnDetail = false;
      tooltip.buttons = [];
      
      // Afficher la tooltip
      tooltip.show();

      // Fermer automatiquement quand on perd le focus ou après un court délai
      let timeoutId = setTimeout(() => {
        tooltip.dispose();
      }, 5000);

      tooltip.onDidHide(() => {
        clearTimeout(timeoutId);
        tooltip.dispose();
      });

      tooltip.onDidAccept(() => {
        clearTimeout(timeoutId);
        tooltip.dispose();
      });

      // Fermer aussi avec Escape
      tooltip.onDidTriggerButton(() => {
        clearTimeout(timeoutId);
        tooltip.dispose();
      });
    }
  );

  context.subscriptions.push(showDetailsCommand);

  function formatDateTime(timestamp, timezone) {
    if (!timestamp) return "";
    try {
      // Le timestamp est en secondes depuis epoch
      const date = new Date(parseInt(timestamp) * 1000);
      // Format: DD/MM/YYYY HH:MM
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) {
      return "";
    }
  }

  function getCommitMessage(cwd, commitId, callback) {
    if (!commitId) {
      callback("");
      return;
    }
    cp.execFile(
      "git",
      ["show", "-s", "--format=%B", commitId],
      { cwd },
      (err, stdout) => {
        if (err || !stdout) {
          callback("");
          return;
        }
        // Récupérer le message complet du commit
        const message = stdout.trim();
        callback(message);
      }
    );
  }

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
      blameInfo = { author: "", date: "", commitId: "", commitMessage: "" };
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
        blameInfo = { author: "", date: "", commitId: "", commitMessage: "" };
        return;
      }

      // Extraire le commit hash (première ligne, 40 caractères)
      const commitHashMatch = stdout.match(/^([a-f0-9]{40})/);
      const commitHashFull = commitHashMatch ? commitHashMatch[1] : "";
      const commitIdShort = commitHashFull ? commitHashFull.substring(0, 7) : "";

      const authorMatch = stdout.match(/^author (.+)$/m);
      const authorTimeMatch = stdout.match(/^author-time (\d+)$/m);
      const authorTzMatch = stdout.match(/^author-tz ([+-]\d{4})$/m);
      const summaryMatch = stdout.match(/^summary (.+)$/m);

      const author = authorMatch ? authorMatch[1] : "Inconnu";
      const timestamp = authorTimeMatch ? authorTimeMatch[1] : null;
      const timezone = authorTzMatch ? authorTzMatch[1] : null;
      const dateTime = formatDateTime(timestamp, timezone);
      const summary = summaryMatch ? summaryMatch[1] : "";

      // Stocker les informations pour l'affichage détaillé (hash complet)
      blameInfo.author = author;
      blameInfo.date = dateTime;
      blameInfo.commitId = commitHashFull;

      // Récupérer le message complet du commit
      if (commitHashFull) {
        getCommitMessage(cwd, commitHashFull, (message) => {
          blameInfo.commitMessage = message || summary;
          // Mettre à jour l'affichage dans la barre de statut : auteur + date/heure
          const displayText =
            "$(person) " + author + (dateTime ? " — " + dateTime : "");
          item.text = displayText;
          updateTooltip();
          item.show();
        });
      } else {
        blameInfo.commitMessage = summary;
        const displayText =
          "$(person) " + author + (dateTime ? " — " + dateTime : "");
        item.text = displayText;
        updateTooltip();
        item.show();
      }
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
