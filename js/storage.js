window.SchichtPilotStorage = (() => {
  const KEY = "schichtPilotMobile.shifts.v1";
  const BACKUP_KEY = "schichtPilotMobile.shifts.v1.backup";
  const TEMP_KEY = "schichtPilotMobile.shifts.v1.pending";
  const CORRUPT_KEY = "schichtPilotMobile.shifts.v1.corrupt";
  const DRAFT_KEY = "schichtPilotDraft";
  const EDIT_KEY = "schichtPilotEditId";

  const VALID_STATUSES = new Set(["Arbeit", "Urlaub", "Krank", "Feiertag"]);

  function storageError(message, cause) {
    const error = new Error(message);
    if (cause) error.cause = cause;
    return error;
  }

  function localGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      throw storageError(
        "Der lokale Speicher ist in diesem Browser nicht verfügbar. Bitte den privaten Modus prüfen.",
        error
      );
    }
  }

  function localSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      const quotaExceeded =
        error &&
        (error.name === "QuotaExceededError" ||
          error.name === "NS_ERROR_DOM_QUOTA_REACHED");

      throw storageError(
        quotaExceeded
          ? "Der lokale Speicher ist voll. Es konnten keine weiteren Daten gespeichert werden."
          : "Die Daten konnten in diesem Browser nicht lokal gespeichert werden.",
        error
      );
    }
  }

  function localRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Das Entfernen temporärer Daten darf die App nicht blockieren.
    }
  }

  function sessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function sessionSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function sessionRemove(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Sitzungsdaten sind optional.
    }
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return (
      "shift-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2) +
      "-" +
      Math.random().toString(16).slice(2)
    );
  }

  function normalizeStatus(status) {
    const value = String(status || "Arbeit").trim().toLowerCase();

    if (value === "urlaub" || value === "vacation") return "Urlaub";
    if (value === "krank" || value === "krankheit" || value === "sick") return "Krank";
    if (value === "feiertag" || value === "holiday") return "Feiertag";
    return "Arbeit";
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(`${value}T12:00:00`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  function validTime(value) {
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
      return false;
    }

    const [hours, minutes] = value.split(":").map(Number);
    return (
      Number.isInteger(hours) &&
      Number.isInteger(minutes) &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    );
  }

  function validIsoTimestamp(value) {
    return (
      typeof value === "string" &&
      value.length <= 40 &&
      !Number.isNaN(Date.parse(value))
    );
  }

  function sanitizeShift(raw, usedIds) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const status = normalizeStatus(raw.status);
    if (!validDate(raw.date)) return null;

    let id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 160)
        : makeId();

    if (usedIds.has(id)) id = makeId();
    usedIds.add(id);

    const comment = typeof raw.comment === "string"
      ? raw.comment.trim().slice(0, 1000)
      : "";

    const now = new Date().toISOString();
    const createdAt = validIsoTimestamp(raw.createdAt) ? raw.createdAt : now;
    const updatedAt = validIsoTimestamp(raw.updatedAt) ? raw.updatedAt : createdAt;

    if (status !== "Arbeit") {
      return {
        id,
        date: raw.date,
        start: "00:00",
        end: "00:00",
        pauseStart: "00:00",
        pauseEnd: "00:00",
        status,
        comment,
        createdAt,
        updatedAt
      };
    }

    const start = validTime(raw.start) ? raw.start : null;
    const end = validTime(raw.end) ? raw.end : null;

    if (!start || !end) return null;

    // Build 044: automatische Reparatur älterer/importierter Arbeitsschichten.
    // Fehlende oder identische Pausenzeiten (häufig 00:00–00:00) erhalten
    // wieder die SchichtPilot-Standardpause 00:30–01:00.
    // Abweichende, bewusst eingetragene Pausen bleiben unverändert.
    const rawPauseStart = validTime(raw.pauseStart) ? raw.pauseStart : null;
    const rawPauseEnd = validTime(raw.pauseEnd) ? raw.pauseEnd : null;
    const needsDefaultPause =
      !rawPauseStart ||
      !rawPauseEnd ||
      rawPauseStart === rawPauseEnd;

    const pauseStart = needsDefaultPause ? "00:30" : rawPauseStart;
    const pauseEnd = needsDefaultPause ? "01:00" : rawPauseEnd;

    return {
      id,
      date: raw.date,
      start,
      end,
      pauseStart,
      pauseEnd,
      status: "Arbeit",
      comment,
      createdAt,
      updatedAt
    };
  }

  function sanitizeShiftList(data) {
    if (!Array.isArray(data)) {
      throw new Error("Gespeicherte Schichtdaten haben ein ungültiges Format.");
    }

    const usedIds = new Set();
    const shifts = [];
    let changed = false;

    data.forEach(raw => {
      const sanitized = sanitizeShift(raw, usedIds);

      if (!sanitized) {
        changed = true;
        return;
      }

      shifts.push(sanitized);

      if (JSON.stringify(raw) !== JSON.stringify(sanitized)) {
        changed = true;
      }
    });

    shifts.sort((a, b) =>
      `${b.date}${b.start}${b.updatedAt}`.localeCompare(
        `${a.date}${a.start}${a.updatedAt}`
      )
    );

    return { shifts, changed };
  }

  function parseShiftList(raw) {
    if (!raw) return { shifts: [], changed: false };
    return sanitizeShiftList(JSON.parse(raw));
  }

  function preserveCorruptData(raw) {
    if (!raw) return;

    try {
      localSet(
        CORRUPT_KEY,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          raw
        })
      );
    } catch {
      // Eine nicht mögliche Quarantäne darf die Wiederherstellung nicht verhindern.
    }
  }

  function commitSerialized(serialized) {
    const previous = localGet(KEY);

    // Phase 1: neuen Stand temporär schreiben und prüfen.
    localSet(TEMP_KEY, serialized);
    if (localGet(TEMP_KEY) !== serialized) {
      throw new Error("Die temporäre Datensicherung konnte nicht bestätigt werden.");
    }

    // Phase 2: den letzten bestätigten Stand sichern.
    if (previous) {
      localSet(BACKUP_KEY, previous);
      if (localGet(BACKUP_KEY) !== previous) {
        throw new Error("Die Sicherung der bisherigen Daten konnte nicht bestätigt werden.");
      }
    }

    // Phase 3: Hauptstand übernehmen und nochmals prüfen.
    localSet(KEY, serialized);
    if (localGet(KEY) !== serialized) {
      throw new Error("Die lokale Speicherung wurde vom Browser nicht bestätigt.");
    }

    localRemove(TEMP_KEY);
  }

  function recoverPendingWrite() {
    const pending = localGet(TEMP_KEY);
    if (!pending) return false;

    try {
      const parsedPending = parseShiftList(pending);
      const normalized = JSON.stringify(parsedPending.shifts);
      commitSerialized(normalized);
      return true;
    } catch {
      preserveCorruptData(pending);
      localRemove(TEMP_KEY);
      return false;
    }
  }

  function readAll() {
    recoverPendingWrite();

    const raw = localGet(KEY);

    try {
      const parsed = parseShiftList(raw);

      if (parsed.changed) {
        commitSerialized(JSON.stringify(parsed.shifts));
      }

      return parsed.shifts;
    } catch (primaryError) {
      preserveCorruptData(raw);

      const backupRaw = localGet(BACKUP_KEY);

      try {
        const backup = parseShiftList(backupRaw);
        commitSerialized(JSON.stringify(backup.shifts));
        return backup.shifts;
      } catch (backupError) {
        console.error(
          "Schichtdaten und Sicherung konnten nicht gelesen werden.",
          primaryError,
          backupError
        );
        return [];
      }
    }
  }

  function writeAll(shifts) {
    const sanitized = sanitizeShiftList(shifts).shifts;
    commitSerialized(JSON.stringify(sanitized));
    return sanitized;
  }

  function replaceAll(shifts) {
    if (!Array.isArray(shifts)) {
      throw new Error("Die Sicherungsdatei enthält keine gültige Schichtliste.");
    }

    return writeAll(shifts);
  }

  function normalizeMergeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function shiftMergeKey(shift) {
    const status = VALID_STATUSES.has(shift.status) ? shift.status : "Arbeit";
    if (status !== "Arbeit") {
      return [shift.date, status].join("|");
    }

    return [
      shift.date,
      status,
      shift.start || "00:00",
      shift.end || "00:00",
    ].join("|");
  }

  function shiftContentSignature(shift) {
    return [
      shiftMergeKey(shift),
      shift.pauseStart || "00:00",
      shift.pauseEnd || "00:00",
      normalizeMergeText(shift.comment),
    ].join("|");
  }

  function shiftTimestamp(shift) {
    return Date.parse(shift.updatedAt) || Date.parse(shift.createdAt) || 0;
  }

  function chooseNewerShift(first, second) {
    const firstTime = shiftTimestamp(first);
    const secondTime = shiftTimestamp(second);

    if (secondTime > firstTime) return second;
    if (firstTime > secondTime) return first;

    const firstComment = String(first.comment || "").trim().length;
    const secondComment = String(second.comment || "").trim().length;
    return secondComment > firstComment ? second : first;
  }

  function analyzeMerge(importedShifts) {
    if (!Array.isArray(importedShifts)) {
      throw new Error("Die Sicherungsdatei enthält keine gültige Schichtliste.");
    }

    const existing = readAll();
    const imported = sanitizeShiftList(importedShifts).shifts;
    const mergedByKey = new Map();
    let existingDuplicates = 0;

    existing.forEach(shift => {
      const key = shiftMergeKey(shift);
      if (mergedByKey.has(key)) {
        existingDuplicates += 1;
        mergedByKey.set(key, chooseNewerShift(mergedByKey.get(key), shift));
      } else {
        mergedByKey.set(key, shift);
      }
    });

    let added = 0;
    let identical = 0;
    let updated = 0;
    let importDuplicates = 0;
    const importKeys = new Set();

    imported.forEach(importedShift => {
      const key = shiftMergeKey(importedShift);

      if (importKeys.has(key)) {
        importDuplicates += 1;
      }
      importKeys.add(key);

      const existingShift = mergedByKey.get(key);
      if (!existingShift) {
        added += 1;
        mergedByKey.set(key, importedShift);
        return;
      }

      if (shiftContentSignature(existingShift) === shiftContentSignature(importedShift)) {
        identical += 1;
        return;
      }

      updated += 1;
      const selected = chooseNewerShift(existingShift, importedShift);

      // Die bestehende ID bleibt erhalten, damit bestehende Verknüpfungen stabil bleiben.
      mergedByKey.set(key, {
        ...selected,
        id: existingShift.id,
        createdAt: existingShift.createdAt || selected.createdAt,
      });
    });

    return {
      added,
      identical,
      updated,
      importDuplicates,
      existingDuplicates,
      finalCount: mergedByKey.size,
      merged: Array.from(mergedByKey.values()),
    };
  }

  // DEV 2.7.1: Ein Desktop-Backup ist ein vollständiger Datenstand.
  // Beim intelligenten Zusammenführen werden deshalb auch Schichten entfernt,
  // die auf dem Desktop bereits gelöscht wurden. IDs haben Vorrang; ältere
  // Backups ohne stabile ID werden zusätzlich über den bisherigen Schlüssel erkannt.
  function analyzeAuthoritativeSnapshot(importedShifts) {
    if (!Array.isArray(importedShifts)) {
      throw new Error("Die Sicherungsdatei enthält keine gültige Schichtliste.");
    }

    const existing = readAll();
    const imported = sanitizeShiftList(importedShifts).shifts;
    const existingById = new Map(existing.map(shift => [shift.id, shift]));
    const existingByKey = new Map(existing.map(shift => [shiftMergeKey(shift), shift]));
    const matchedExistingIds = new Set();

    let added = 0;
    let identical = 0;
    let updated = 0;

    const synced = imported.map(importedShift => {
      let existingShift = existingById.get(importedShift.id) || null;
      if (!existingShift) existingShift = existingByKey.get(shiftMergeKey(importedShift)) || null;

      if (!existingShift) {
        added += 1;
        return importedShift;
      }

      matchedExistingIds.add(existingShift.id);
      if (shiftContentSignature(existingShift) === shiftContentSignature(importedShift)) {
        identical += 1;
      } else {
        updated += 1;
      }

      return {
        ...importedShift,
        id: existingShift.id || importedShift.id,
        createdAt: existingShift.createdAt || importedShift.createdAt
      };
    });

    const deleted = existing.filter(shift => !matchedExistingIds.has(shift.id)).length;

    return {
      added,
      identical,
      updated,
      deleted,
      finalCount: synced.length,
      synced
    };
  }

  function syncFromAuthoritativeSnapshot(importedShifts) {
    const analysis = analyzeAuthoritativeSnapshot(importedShifts);
    return writeAll(analysis.synced);
  }

  function mergeAll(importedShifts) {
    const analysis = analyzeMerge(importedShifts);
    return writeAll(analysis.merged);
  }

  function save(shift) {
    if (!shift || typeof shift !== "object") {
      throw new Error("Der Eintrag enthält keine gültigen Daten.");
    }

    const shifts = readAll();
    const now = new Date().toISOString();
    const requestedId =
      typeof shift.id === "string" && shift.id.trim() ? shift.id.trim() : null;

    let savedId = requestedId || makeId();
    const index = requestedId
      ? shifts.findIndex(item => item.id === requestedId)
      : -1;

    if (index >= 0) {
      shifts[index] = {
        ...shifts[index],
        ...shift,
        id: savedId,
        updatedAt: now
      };
    } else {
      shifts.push({
        ...shift,
        id: savedId,
        createdAt: now,
        updatedAt: now
      });
    }

    const savedShifts = writeAll(shifts);
    const saved = savedShifts.find(item => item.id === savedId) || null;

    if (!saved) {
      throw new Error("Der gespeicherte Eintrag konnte nicht bestätigt werden.");
    }

    return saved;
  }

  function getById(id) {
    if (!id) return null;
    return readAll().find(item => item.id === id) || null;
  }

  function remove(id) {
    if (!id) return false;

    const current = readAll();
    const remaining = current.filter(item => item.id !== id);

    if (remaining.length === current.length) return false;

    writeAll(remaining);
    return true;
  }

  function saveDraft(draft) {
    if (!draft || typeof draft !== "object") {
      throw new Error("Die Eingaben konnten nicht zwischengespeichert werden.");
    }

    if (!sessionSet(DRAFT_KEY, JSON.stringify(draft))) {
      throw new Error(
        "Die Vorschau ist im privaten Browsermodus möglicherweise nicht verfügbar."
      );
    }
  }

  function readDraft() {
    try {
      const raw = sessionGet(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearDraft() {
    sessionRemove(DRAFT_KEY);
  }

  function setEditId(id) {
    if (id) {
      if (!sessionSet(EDIT_KEY, String(id))) {
        throw new Error("Der Bearbeitungsmodus konnte nicht geöffnet werden.");
      }
    } else {
      sessionRemove(EDIT_KEY);
    }
  }

  function getEditId() {
    return sessionGet(EDIT_KEY);
  }

  function checkStorageHealth() {
    const probeKey = "schichtPilotMobile.storageProbe";
    const probeValue = `${Date.now()}-${Math.random()}`;

    try {
      localSet(probeKey, probeValue);
      const localStorageAvailable = localGet(probeKey) === probeValue;
      localRemove(probeKey);

      const sessionProbe = sessionSet(probeKey, probeValue);
      const sessionStorageAvailable =
        sessionProbe && sessionGet(probeKey) === probeValue;
      sessionRemove(probeKey);

      return {
        localStorageAvailable,
        sessionStorageAvailable,
        backupAvailable: Boolean(localGet(BACKUP_KEY)),
        pendingWriteAvailable: Boolean(localGet(TEMP_KEY))
      };
    } catch (error) {
      return {
        localStorageAvailable: false,
        sessionStorageAvailable: false,
        backupAvailable: false,
        pendingWriteAvailable: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    readAll,
    replaceAll,
    analyzeMerge,
    analyzeAuthoritativeSnapshot,
    syncFromAuthoritativeSnapshot,
    mergeAll,
    save,
    getById,
    remove,
    saveDraft,
    readDraft,
    clearDraft,
    setEditId,
    getEditId,
    checkStorageHealth
  };
})();
