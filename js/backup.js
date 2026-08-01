(() => {
  "use strict";

  const FORMAT_NAME = "SchichtPilot Backup";
  const FORMAT_VERSION = 1;
  const CURRENT_BUILD = 44;
  function createBackupFileName(prefix = "SchichtPilot_Mobile") {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("de-DE", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(now);

    const value = type =>
      parts.find(part => part.type === type)?.value ?? "00";

    return `${prefix}_${value("year")}-${value("month")}-${value("day")}_${value("hour")}-${value("minute")}.spb`;
  }
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_STATUSES = new Set(["Arbeit", "Urlaub", "Krank", "Feiertag"]);

  const shiftCount = document.getElementById("shiftCount");
  const exportButton = document.getElementById("exportButton");
  const backupFile = document.getElementById("backupFile");
  const chooseFileButton = document.getElementById("chooseFileButton");
  const importPreview = document.getElementById("importPreview");
  const importFileName = document.getElementById("importFileName");
  const importCreatedAt = document.getElementById("importCreatedAt");
  const importBuild = document.getElementById("importBuild");
  const importPlatform = document.getElementById("importPlatform");
  const importCount = document.getElementById("importCount");
  const importFormatVersion = document.getElementById("importFormatVersion");
  const versionWarning = document.getElementById("versionWarning");
  const downloadSafetyCopy = document.getElementById("downloadSafetyCopy");
  const mergeButton = document.getElementById("mergeButton");
  const replaceButton = document.getElementById("replaceButton");
  const backupMessage = document.getElementById("backupMessage");

  let pendingImport = null;
  let pendingMeta = null;
  let pendingAnalysis = null;

  function isDesktopBackup(meta) {
    return String(meta?.platform || "").trim().toLowerCase() === "desktop";
  }

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

  function buildBackup(shifts, filePurpose = "manual") {
    return {
      format: FORMAT_NAME,
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      application: {
        name: "SchichtPilot",
        platform: "mobile",
        build: "044"
      },
      purpose: filePurpose,
      data: {
        shifts
      }
    };
  }

  function triggerDownload(payload, fileName) {
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], {
      type: "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadBackup() {
    hideMessage();

    try {
      const shifts = window.SchichtPilotStorage.readAll();
      const fileName = createBackupFileName();
      triggerDownload(buildBackup(shifts), fileName);
      showMessage(`${shifts.length} Einträge wurden als ${fileName} bereitgestellt.`);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Die Sicherung konnte nicht erstellt werden.",
        "error"
      );
    }
  }

  function downloadCurrentDataAsSafetyCopy() {
    const currentShifts = window.SchichtPilotStorage.readAll();
    triggerDownload(buildBackup(currentShifts, "before-import"), createBackupFileName("SchichtPilot_Mobile_vor_Import"));
    return currentShifts.length;
  }

  function parseBuildNumber(value) {
    const match = String(value ?? "").match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unbekannt";

    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function normalizeMeta(payload) {
    const application = payload && typeof payload.application === "object"
      ? payload.application
      : {};

    return {
      createdAt: typeof payload?.createdAt === "string" ? payload.createdAt : null,
      build: application.build ?? null,
      platform: application.platform ?? "Unbekannt",
      formatVersion: payload?.formatVersion ?? 1
    };
  }

  function extractShifts(payload) {
    if (Array.isArray(payload)) {
      return {
        shifts: payload,
        meta: {
          createdAt: null,
          build: null,
          platform: "Unbekannt",
          formatVersion: 1
        }
      };
    }

    if (!payload || typeof payload !== "object") {
      throw new Error("Die ausgewählte Datei ist keine gültige SchichtPilot-Sicherung.");
    }

    if (payload.format && payload.format !== FORMAT_NAME) {
      throw new Error("Die Datei gehört nicht zu SchichtPilot.");
    }

    if (
      payload.formatVersion != null &&
      (!Number.isInteger(payload.formatVersion) ||
        payload.formatVersion < 1 ||
        payload.formatVersion > FORMAT_VERSION)
    ) {
      throw new Error(
        "Diese Sicherung verwendet ein noch nicht unterstütztes Backupformat."
      );
    }

    if (payload.data && Array.isArray(payload.data.shifts)) {
      return { shifts: payload.data.shifts, meta: normalizeMeta(payload) };
    }

    if (Array.isArray(payload.shifts)) {
      return { shifts: payload.shifts, meta: normalizeMeta(payload) };
    }

    throw new Error("In der Sicherungsdatei wurde keine Schichtliste gefunden.");
  }

  function validateIsoDateTime(value, fieldName, index) {
    if (value == null || value === "") return;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      throw new Error(`Eintrag ${index + 1}: ${fieldName} ist ungültig.`);
    }
  }

  function validateDate(value, index) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`Eintrag ${index + 1}: Das Datum ist ungültig.`);
    }

    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Eintrag ${index + 1}: Das Datum ist ungültig.`);
    }
  }

  function validateTime(value, fieldName, index) {
    if (value == null || value === "") return;
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
      throw new Error(`Eintrag ${index + 1}: ${fieldName} ist ungültig.`);
    }

    const [hours, minutes] = value.split(":").map(Number);
    if (hours > 23 || minutes > 59) {
      throw new Error(`Eintrag ${index + 1}: ${fieldName} ist ungültig.`);
    }
  }

  function validateShifts(shifts) {
    if (!Array.isArray(shifts)) {
      throw new Error("Die Sicherungsdatei enthält keine gültige Schichtliste.");
    }

    const ids = new Set();

    shifts.forEach((shift, index) => {
      if (!shift || typeof shift !== "object" || Array.isArray(shift)) {
        throw new Error(`Eintrag ${index + 1} ist beschädigt.`);
      }

      if (typeof shift.id !== "string" || !shift.id.trim()) {
        throw new Error(`Eintrag ${index + 1}: Die ID fehlt.`);
      }

      if (ids.has(shift.id)) {
        throw new Error(`Doppelte ID gefunden: ${shift.id}`);
      }
      ids.add(shift.id);

      validateDate(shift.date, index);
      validateTime(shift.start, "Startzeit", index);
      validateTime(shift.end, "Endzeit", index);
      validateTime(shift.pauseStart, "Pausenbeginn", index);
      validateTime(shift.pauseEnd, "Pausenende", index);

      if (!ALLOWED_STATUSES.has(shift.status)) {
        throw new Error(
          `Eintrag ${index + 1}: Unbekannter Status „${String(shift.status)}“.`
        );
      }

      if (shift.comment != null && typeof shift.comment !== "string") {
        throw new Error(`Eintrag ${index + 1}: Der Kommentar ist ungültig.`);
      }

      validateIsoDateTime(shift.createdAt, "Erstellungszeit", index);
      validateIsoDateTime(shift.updatedAt, "Änderungszeit", index);
    });

    return shifts;
  }

  function showPreview(file, shifts, meta) {
    pendingImport = shifts;
    pendingMeta = meta;
    const authoritative = isDesktopBackup(meta);
    const mergeAnalysis = authoritative
      ? window.SchichtPilotStorage.analyzeAuthoritativeSnapshot(shifts)
      : window.SchichtPilotStorage.analyzeMerge(shifts);
    pendingAnalysis = mergeAnalysis;

    const backupBuild = parseBuildNumber(meta.build);
    const isNewerBuild = backupBuild != null && backupBuild > CURRENT_BUILD;

    importFileName.textContent = file.name;
    importCreatedAt.textContent = meta.createdAt ? formatDate(meta.createdAt) : "Unbekannt";
    importBuild.textContent = meta.build ? String(meta.build) : "Unbekannt";
    importPlatform.textContent = String(meta.platform || "Unbekannt");
    importCount.textContent = String(shifts.length);
    importFormatVersion.textContent = String(meta.formatVersion ?? 1);
    document.getElementById("mergeNewCount").textContent = String(mergeAnalysis.added);
    document.getElementById("mergeExistingCount").textContent = String(mergeAnalysis.identical);
    document.getElementById("mergeUpdatedCount").textContent = String(mergeAnalysis.updated);
    const deletedRow = document.getElementById("mergeDeletedRow");
    const deletedCount = document.getElementById("mergeDeletedCount");
    if (deletedRow && deletedCount) {
      deletedRow.hidden = !authoritative;
      deletedCount.textContent = String(authoritative ? mergeAnalysis.deleted : 0);
    }
    document.getElementById("mergeFinalCount").textContent = String(mergeAnalysis.finalCount);
    mergeButton.textContent = authoritative
      ? "Desktop-Datenstand intelligent übernehmen"
      : "Mit vorhandenen Daten zusammenführen";

    const duplicateWarning = document.getElementById("duplicateWarning");
    const duplicateParts = [];
    if (mergeAnalysis.importDuplicates > 0) {
      duplicateParts.push(`${mergeAnalysis.importDuplicates} doppelte Einträge im Backup`);
    }
    if (mergeAnalysis.existingDuplicates > 0) {
      duplicateParts.push(`${mergeAnalysis.existingDuplicates} bereits doppelte Einträge in der App`);
    }
    duplicateWarning.hidden = duplicateParts.length === 0;
    duplicateWarning.textContent = duplicateParts.length
      ? `Hinweis: ${duplicateParts.join(" und ")} werden beim Zusammenführen bereinigt.`
      : "";

    versionWarning.hidden = !isNewerBuild;
    importPreview.hidden = false;

    showMessage(
      isNewerBuild
        ? "Sicherungsdatei geprüft. Beachte die Versionswarnung."
        : "Sicherungsdatei vollständig geprüft. Wähle nun die gewünschte Importart.",
      isNewerBuild ? "warning" : "success"
    );
  }

  async function readSelectedFile(file) {
    hideMessage();
    pendingImport = null;
    pendingMeta = null;
    pendingAnalysis = null;
    importPreview.hidden = true;
    versionWarning.hidden = true;

    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const supportedName =
      lowerName.endsWith(".spb") ||
      lowerName.endsWith(".spb.json") ||
      lowerName.endsWith(".json");

    if (!supportedName) {
      showMessage(
        "Bitte wähle eine SchichtPilot-Sicherung mit .spb, .spb.json oder .json aus.",
        "error"
      );
      backupFile.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showMessage("Die Sicherungsdatei ist ungewöhnlich groß und wurde nicht geöffnet.", "error");
      backupFile.value = "";
      return;
    }

    try {
      const text = await file.text();
      let payload;

      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("Die Sicherungsdatei ist beschädigt oder kein gültiges JSON.");
      }

      const extracted = extractShifts(payload);
      validateShifts(extracted.shifts);
      showPreview(file, extracted.shifts, extracted.meta);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Die Sicherungsdatei konnte nicht gelesen werden.",
        "error"
      );
      backupFile.value = "";
    }
  }

  function confirmNewerBuildIfNeeded() {
    const backupBuild = parseBuildNumber(pendingMeta?.build);
    if (backupBuild == null || backupBuild <= CURRENT_BUILD) return true;

    return window.confirm(
      `Dieses Backup stammt aus Build ${backupBuild}, installiert ist Build 044. Trotzdem fortfahren?`
    );
  }

  function importMerged() {
    if (!pendingImport || !confirmNewerBuildIfNeeded()) return;

    const authoritative = isDesktopBackup(pendingMeta);
    const analysis = pendingAnalysis || (authoritative
      ? window.SchichtPilotStorage.analyzeAuthoritativeSnapshot(pendingImport)
      : window.SchichtPilotStorage.analyzeMerge(pendingImport));

    const confirmation = authoritative
      ? `Desktop-Datenstand intelligent übernehmen?\n\n` +
        `${analysis.added} neue Schichten\n` +
        `${analysis.identical} unveränderte Schichten\n` +
        `${analysis.updated} geänderte Schichten\n` +
        `${analysis.deleted} auf dem Desktop gelöschte Schichten werden auch mobil entfernt\n` +
        `Endbestand: ${analysis.finalCount}`
      : `Dublettenfrei zusammenführen?\n\n` +
        `${analysis.added} neue Schichten\n` +
        `${analysis.identical} bereits vorhandene Schichten\n` +
        `${analysis.updated} Schichten mit abweichenden Details\n` +
        `Endbestand: ${analysis.finalCount}`;

    if (!window.confirm(confirmation)) return;

    try {
      let safetyCount = null;
      if (downloadSafetyCopy.checked) {
        safetyCount = downloadCurrentDataAsSafetyCopy();
      }

      const saved = authoritative
        ? window.SchichtPilotStorage.syncFromAuthoritativeSnapshot(pendingImport)
        : window.SchichtPilotStorage.mergeAll(pendingImport);
      updateCount();

      const safetyText = safetyCount == null
        ? ""
        : ` Sicherheitskopie mit ${safetyCount} Einträgen wurde heruntergeladen.`;

      const resultText = authoritative
        ? `Desktop-Datenstand übernommen: ${analysis.added} neu, ` +
          `${analysis.updated} aktualisiert, ${analysis.deleted} entfernt. ` +
          `Jetzt sind ${saved.length} Einträge gespeichert.${safetyText}`
        : `Zusammenführen abgeschlossen: ${analysis.added} neu, ` +
          `${analysis.identical} bereits vorhanden, ${analysis.updated} aktualisiert. ` +
          `Jetzt sind ${saved.length} eindeutige Einträge gespeichert.${safetyText}`;

      showMessage(resultText, "success");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Die Daten konnten nicht importiert werden.",
        "error"
      );
    }
  }

  function importReplaced() {
    if (!pendingImport || !confirmNewerBuildIfNeeded()) return;

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
      let safetyCount = null;
      if (downloadSafetyCopy.checked) {
        safetyCount = downloadCurrentDataAsSafetyCopy();
      }

      const saved = window.SchichtPilotStorage.replaceAll(pendingImport);
      updateCount();

      const safetyText = safetyCount == null
        ? ""
        : ` Zuvor wurde eine Sicherheitskopie mit ${safetyCount} Einträgen heruntergeladen.`;

      showMessage(
        `${saved.length} Einträge wurden vollständig wiederhergestellt.${safetyText}`
      );
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
