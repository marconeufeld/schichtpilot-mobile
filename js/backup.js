(() => {
  "use strict";

  const FORMAT_NAME = "SchichtPilot Backup";
  const FORMAT_VERSION = 1;
  const FILE_NAME = "SchichtPilot_Backup.spb";

  const shiftCount = document.getElementById("shiftCount");
  const exportButton = document.getElementById("exportButton");
  const backupFile = document.getElementById("backupFile");
  const chooseFileButton = document.getElementById("chooseFileButton");
  const importPreview = document.getElementById("importPreview");
  const importFileName = document.getElementById("importFileName");
  const importCount = document.getElementById("importCount");
  const mergeButton = document.getElementById("mergeButton");
  const replaceButton = document.getElementById("replaceButton");
  const backupMessage = document.getElementById("backupMessage");

  let pendingImport = null;

  function showMessage(message, type = "success") {
    backupMessage.textContent = message;
    backupMessage.className = `backup-message ${type}`;
    backupMessage.hidden = false;
    backupMessage.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideMessage() {
    backupMessage.hidden = true;
    backupMessage.textContent = "";
  }

  function updateCount() {
    const count = window.SchichtPilotStorage.readAll().length;
    shiftCount.textContent = `${count} ${count === 1 ? "Eintrag" : "Einträge"}`;
  }

  function buildBackup() {
    const shifts = window.SchichtPilotStorage.readAll();

    return {
      format: FORMAT_NAME,
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      application: {
        name: "SchichtPilot",
        platform: "mobile",
        build: "031"
      },
      data: {
        shifts
      }
    };
  }

  function downloadBackup() {
    hideMessage();

    try {
      const backup = buildBackup();
      const serialized = JSON.stringify(backup, null, 2);
      const blob = new Blob([serialized], {
        type: "application/json;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = FILE_NAME;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      showMessage(
        `${backup.data.shifts.length} Einträge wurden als ${FILE_NAME} bereitgestellt.`
      );
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Die Sicherung konnte nicht erstellt werden.",
        "error"
      );
    }
  }

  function extractShifts(payload) {
    if (Array.isArray(payload)) return payload;

    if (!payload || typeof payload !== "object") {
      throw new Error("Die ausgewählte Datei ist keine gültige SchichtPilot-Sicherung.");
    }

    if (
      payload.format &&
      payload.format !== FORMAT_NAME
    ) {
      throw new Error("Die Datei gehört nicht zu SchichtPilot.");
    }

    if (
      payload.formatVersion != null &&
      (!Number.isInteger(payload.formatVersion) ||
        payload.formatVersion < 1 ||
        payload.formatVersion > FORMAT_VERSION)
    ) {
      throw new Error(
        "Diese Sicherung wurde mit einem neueren, noch nicht unterstützten Format erstellt."
      );
    }

    if (payload.data && Array.isArray(payload.data.shifts)) {
      return payload.data.shifts;
    }

    if (Array.isArray(payload.shifts)) {
      return payload.shifts;
    }

    throw new Error("In der Sicherungsdatei wurde keine Schichtliste gefunden.");
  }

  async function readSelectedFile(file) {
    hideMessage();
    pendingImport = null;
    importPreview.hidden = true;

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".spb")) {
      showMessage("Bitte wähle eine Datei mit der Endung .spb aus.", "error");
      backupFile.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showMessage("Die Sicherungsdatei ist ungewöhnlich groß und wurde nicht geöffnet.", "error");
      backupFile.value = "";
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const shifts = extractShifts(payload);

      // Validierung ohne dauerhafte Änderung: Importdaten werden erst beim Klick gespeichert.
      if (!Array.isArray(shifts)) {
        throw new Error("Die Sicherungsdatei enthält keine gültigen Einträge.");
      }

      pendingImport = shifts;
      importFileName.textContent = file.name;
      importCount.textContent = String(shifts.length);
      importPreview.hidden = false;
      showMessage("Sicherungsdatei geprüft. Wähle nun die gewünschte Importart.");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Die Sicherungsdatei konnte nicht gelesen werden.",
        "error"
      );
      backupFile.value = "";
    }
  }

  function importMerged() {
    if (!pendingImport) return;

    const before = window.SchichtPilotStorage.readAll().length;

    if (!window.confirm(
      "Die Einträge aus der Sicherung werden mit deinen vorhandenen Daten zusammengeführt. Fortfahren?"
    )) {
      return;
    }

    try {
      const saved = window.SchichtPilotStorage.mergeAll(pendingImport);
      updateCount();
      showMessage(
        `Import abgeschlossen. Vorher: ${before}, jetzt: ${saved.length} Einträge.`
      );
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Die Daten konnten nicht importiert werden.",
        "error"
      );
    }
  }

  function importReplaced() {
    if (!pendingImport) return;

    if (!window.confirm(
      "Achtung: Alle derzeit gespeicherten Schichten werden durch diese Sicherung ersetzt. Wirklich fortfahren?"
    )) {
      return;
    }

    if (!window.confirm(
      "Letzte Bestätigung: Vorhandene Daten vollständig ersetzen?"
    )) {
      return;
    }

    try {
      const saved = window.SchichtPilotStorage.replaceAll(pendingImport);
      updateCount();
      showMessage(`${saved.length} Einträge wurden vollständig wiederhergestellt.`);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Die Daten konnten nicht wiederhergestellt werden.",
        "error"
      );
    }
  }

  exportButton.addEventListener("click", downloadBackup);
  chooseFileButton.addEventListener("click", () => backupFile.click());
  backupFile.addEventListener("change", event => {
    readSelectedFile(event.target.files && event.target.files[0]);
  });
  mergeButton.addEventListener("click", importMerged);
  replaceButton.addEventListener("click", importReplaced);

  updateCount();
})();
