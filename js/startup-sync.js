(() => {
  "use strict";

  const dialog = document.getElementById("startupSyncDialog");
  const fileInput = document.getElementById("startupSyncFile");
  const chooseButton = document.getElementById("startupSyncChoose");
  const importButton = document.getElementById("startupSyncImport");
  const laterButton = document.getElementById("startupSyncLater");
  const details = document.getElementById("startupSyncDetails");
  const message = document.getElementById("startupSyncMessage");
  const text = document.getElementById("startupSyncText");

  if (!dialog || !fileInput || !window.SchichtPilotStorage) return;

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  let pendingShifts = null;
  let pendingMeta = null;
  let pendingAnalysis = null;

  function setMessage(value, type = "info") {
    message.textContent = value;
    message.className = `startup-sync-message ${type}`;
    message.hidden = !value;
  }

  function showDialog() {
    dialog.hidden = false;
    document.documentElement.classList.add("startup-sync-open");
  }

  function closeDialog() {
    dialog.hidden = true;
    document.documentElement.classList.remove("startup-sync-open");
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unbekannt";
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "medium"
    }).format(date);
  }

  function newestLocalTimestamp(shifts) {
    return shifts.reduce((latest, shift) => {
      const candidate = Date.parse(shift.updatedAt || shift.createdAt || "");
      return Number.isNaN(candidate) ? latest : Math.max(latest, candidate);
    }, 0);
  }

  function extractBackup(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Die Datei ist keine gültige SchichtPilot-Sicherung.");
    }

    const application = payload.application && typeof payload.application === "object"
      ? payload.application
      : {};
    const shifts = Array.isArray(payload?.data?.shifts)
      ? payload.data.shifts
      : Array.isArray(payload.shifts)
        ? payload.shifts
        : null;

    if (!shifts) {
      throw new Error("In der Sicherung wurde keine Schichtliste gefunden.");
    }

    return {
      shifts,
      meta: {
        platform: String(application.platform || "").toLowerCase(),
        build: application.build || null,
        createdAt: payload.createdAt || null
      }
    };
  }

  function renderAnalysis(file, extracted) {
    const { shifts, meta } = extracted;
    if (meta.platform !== "desktop") {
      throw new Error("Bitte wähle ein Desktop-Backup aus.");
    }

    const analysis = window.SchichtPilotStorage.analyzeAuthoritativeSnapshot(shifts);
    const localShifts = window.SchichtPilotStorage.readAll();
    const localLatest = newestLocalTimestamp(localShifts);
    const backupTime = Date.parse(meta.createdAt || "");

    pendingShifts = shifts;
    pendingMeta = meta;
    pendingAnalysis = analysis;

    document.getElementById("startupSyncFileName").textContent = file.name;
    document.getElementById("startupSyncCreatedAt").textContent = meta.createdAt
      ? formatDate(meta.createdAt)
      : "Unbekannt";
    document.getElementById("startupSyncAdded").textContent = String(analysis.added);
    document.getElementById("startupSyncUpdated").textContent = String(analysis.updated);
    document.getElementById("startupSyncDeleted").textContent = String(analysis.deleted);
    document.getElementById("startupSyncFinal").textContent = String(analysis.finalCount);
    details.hidden = false;

    const hasChanges = analysis.added > 0 || analysis.updated > 0 || analysis.deleted > 0;
    importButton.hidden = !hasChanges;
    chooseButton.textContent = hasChanges ? "Andere Datei wählen" : "Andere Datei wählen";

    if (!hasChanges) {
      setMessage("Deine Mobile-App ist bereits auf dem gleichen Datenstand.", "success");
      text.textContent = "Das gewählte Desktop-Backup enthält keine abweichenden Schichten.";
      return;
    }

    if (!Number.isNaN(backupTime) && localLatest && backupTime < localLatest) {
      setMessage(
        "Das Desktop-Backup ist zeitlich älter als eine mobile Änderung. Prüfe die Angaben besonders sorgfältig.",
        "warning"
      );
    } else {
      setMessage("Neuer oder abweichender Desktop-Datenstand erkannt.", "warning");
    }

    text.textContent = "Prüfe die Änderungen und übernimm den Desktop-Datenstand nur, wenn die Angaben stimmen.";
  }

  async function readFile(file) {
    pendingShifts = null;
    pendingMeta = null;
    pendingAnalysis = null;
    details.hidden = true;
    importButton.hidden = true;
    setMessage("");

    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setMessage("Die ausgewählte Datei ist ungewöhnlich groß.", "error");
      return;
    }

    try {
      const payload = JSON.parse(await file.text());
      renderAnalysis(file, extractBackup(payload));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die Sicherung konnte nicht gelesen werden.", "error");
    } finally {
      fileInput.value = "";
    }
  }

  function importDesktopSnapshot() {
    if (!pendingShifts || !pendingAnalysis) return;

    const a = pendingAnalysis;
    const confirmation =
      `Desktop-Datenstand übernehmen?\n\n` +
      `${a.added} neue Schichten\n` +
      `${a.updated} geänderte Schichten\n` +
      `${a.deleted} auf dem Desktop gelöschte Schichten\n` +
      `Endbestand: ${a.finalCount}`;

    if (!window.confirm(confirmation)) return;

    try {
      const saved = window.SchichtPilotStorage.syncFromAuthoritativeSnapshot(pendingShifts);
      try {
        localStorage.setItem("schichtPilotMobile.lastDesktopImport", JSON.stringify({
          importedAt: new Date().toISOString(),
          backupCreatedAt: pendingMeta?.createdAt || null,
          finalCount: saved.length
        }));
      } catch {
        // Metadaten sind optional.
      }

      setMessage(`Desktop-Datenstand erfolgreich übernommen. ${saved.length} Schichten sind jetzt gespeichert.`, "success");
      importButton.hidden = true;
      chooseButton.textContent = "Weitere Sicherung prüfen";
      text.textContent = "Die mobilen Daten wurden aktualisiert.";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Import ist fehlgeschlagen.", "error");
    }
  }

  chooseButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", event => readFile(event.target.files?.[0]));
  importButton.addEventListener("click", importDesktopSnapshot);
  laterButton.addEventListener("click", closeDialog);

  window.setTimeout(showDialog, 500);
})();
