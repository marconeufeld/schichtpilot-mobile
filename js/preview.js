const previewDate = document.getElementById("previewDate");
const previewStatus = document.getElementById("previewStatus");
const previewWorkDetails = document.getElementById("previewWorkDetails");
const previewAbsenceDetails = document.getElementById("previewAbsenceDetails");
const previewWorkTime = document.getElementById("previewWorkTime");
const previewPause = document.getElementById("previewPause");
const previewPaid = document.getElementById("previewPaid");
const preview2124 = document.getElementById("preview2124");
const preview0004 = document.getElementById("preview0004");
const preview0406 = document.getElementById("preview0406");
const previewMessage = document.getElementById("previewMessage");
const saveButton = document.getElementById("saveShiftButton");
const previewCommentBlock = document.getElementById("previewCommentBlock");
const previewComment = document.getElementById("previewComment");

let draft = null;
const editingExisting = Boolean(SchichtPilotStorage.getEditId());

function loadPreview() {
  draft = SchichtPilotStorage.readDraft();
  if (editingExisting) saveButton.textContent = "Änderungen speichern";

  if (!draft) {
    previewMessage.textContent = "Keine Schichtdaten gefunden.";
    saveButton.disabled = true;
    return;
  }

  try {
    const date = new Date(draft.date + "T12:00:00");
    const status = draft.status || "Arbeit";
    const isWork = status === "Arbeit";

    previewDate.textContent = new Intl.DateTimeFormat("de-DE", {
      weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"
    }).format(date);

    previewStatus.textContent = status;
    previewStatus.classList.remove("hidden");
    previewStatus.dataset.status = status.toLowerCase();

    const comment = String(draft.comment || "").trim();
    previewCommentBlock.classList.toggle("hidden", !comment);
    previewComment.textContent = comment;

    previewWorkDetails.classList.toggle("hidden", !isWork);
    previewAbsenceDetails.classList.toggle("hidden", isWork);
    saveButton.textContent = editingExisting
      ? "Änderungen speichern"
      : isWork ? "Schicht speichern" : `${status} speichern`;

    if (isWork) {
      const result = SchichtPilotCalc.calculate(draft);
      previewWorkTime.textContent = `${draft.start}–${draft.end}`;
      previewPause.textContent = `${draft.pauseStart}–${draft.pauseEnd}`;
      previewPaid.textContent = SchichtPilotCalc.decimalHoursText(result.paid, true);
      preview2124.textContent = SchichtPilotCalc.decimalHoursText(result.block2124);
      preview0004.textContent = SchichtPilotCalc.decimalHoursText(result.block0004);
      preview0406.textContent = SchichtPilotCalc.decimalHoursText(result.block0406);
    }
  } catch (error) {
    previewMessage.textContent = error.message;
    saveButton.disabled = true;
  }
}

let isSaving = false;

saveButton.addEventListener("click", () => {
  if (!draft || isSaving) return;

  isSaving = true;
  saveButton.disabled = true;
  previewMessage.textContent = "";

  try {
    const savedShift = SchichtPilotStorage.save(draft);

    if (!savedShift || !savedShift.id) {
      throw new Error("Die gespeicherte Schicht konnte nicht bestätigt werden.");
    }

    SchichtPilotStorage.clearDraft();
    SchichtPilotStorage.setEditId(null);
    window.location.href = editingExisting
      ? "gespeichert.html?v=028&updated=1"
      : "gespeichert.html?v=028";
  } catch (error) {
    previewMessage.textContent =
      error instanceof Error
        ? error.message
        : "Die Schicht konnte nicht gespeichert werden.";
    saveButton.disabled = false;
    isSaving = false;
  }
});

loadPreview();
