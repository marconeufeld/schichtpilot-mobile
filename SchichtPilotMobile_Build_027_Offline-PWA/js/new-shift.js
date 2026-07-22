const shiftDate = document.getElementById("shiftDate");
const startTime = document.getElementById("startTime");
const endTime = document.getElementById("endTime");
const pauseStart = document.getElementById("pauseStart");
const pauseEnd = document.getElementById("pauseEnd");
const formMessage = document.getElementById("formMessage");
const statusInputs = [...document.querySelectorAll('input[name="shiftStatus"]')];
const workTimeFields = document.getElementById("workTimeFields");
const absenceNote = document.getElementById("absenceNote");
const absenceNoteTitle = document.getElementById("absenceNoteTitle");

const shiftDateDisplay = document.getElementById("shiftDateDisplay");
const startTimeDisplay = document.getElementById("startTimeDisplay");
const endTimeDisplay = document.getElementById("endTimeDisplay");
const pauseStartDisplay = document.getElementById("pauseStartDisplay");
const pauseEndDisplay = document.getElementById("pauseEndDisplay");

const params = new URLSearchParams(window.location.search);
const isNewMode = params.get("mode") === "new";
const requestedDate = params.get("date");

function selectedStatus() {
  return statusInputs.find(input => input.checked)?.value || "Arbeit";
}

function setSelectedStatus(value) {
  const wanted = ["Arbeit", "Urlaub", "Krank", "Feiertag"].includes(value)
    ? value
    : "Arbeit";

  statusInputs.forEach(input => {
    input.checked = input.value === wanted;
  });

  syncStatusMode();
}

function syncStatusMode() {
  const status = selectedStatus();
  const isWork = status === "Arbeit";

  workTimeFields.classList.toggle("hidden", !isWork);
  absenceNote.classList.toggle("hidden", isWork);

  [startTime, endTime, pauseStart, pauseEnd].forEach(input => {
    input.required = isWork;
    input.disabled = !isWork;
  });

  if (!isWork) {
    absenceNoteTitle.textContent = status;
  }

  document.getElementById("pageSubtitle").textContent =
    isWork ? "Zeiten eingeben" : "Bezahlte Abwesenheit erfassen";
}

function todayForInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDateForDisplay(value) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value + "T12:00:00"));
}

function syncDisplays() {
  shiftDateDisplay.textContent = formatDateForDisplay(shiftDate.value);
  startTimeDisplay.textContent = startTime.value || "–";
  endTimeDisplay.textContent = endTime.value || "–";
  pauseStartDisplay.textContent = pauseStart.value || "–";
  pauseEndDisplay.textContent = pauseEnd.value || "–";
}

function setDefaultStart() {
  if (!shiftDate.value) return;
  const selectedDate = new Date(shiftDate.value + "T12:00:00");
  startTime.value = selectedDate.getDay() === 6 ? "23:00" : "21:00";
  syncDisplays();
}

function fillForm(data) {
  shiftDate.value = data.date || todayForInput();
  startTime.value = data.start || "21:00";
  endTime.value = data.end || "06:00";
  pauseStart.value = data.pauseStart || "00:30";
  pauseEnd.value = data.pauseEnd || "01:00";
  setSelectedStatus(data.status || "Arbeit");
  syncDisplays();
}

function loadForm() {
  if (isNewMode) {
    SchichtPilotStorage.setEditId(null);
    SchichtPilotStorage.clearDraft();
  }

  const editId = SchichtPilotStorage.getEditId();

  if (editId) {
    const shift = SchichtPilotStorage.getById(editId);
    if (shift) {
      document.getElementById("pageTitle").textContent = "Schicht bearbeiten";
      document.getElementById("pageSubtitle").textContent = "Gespeicherte Schicht ändern";
      fillForm(shift);
      return;
    }
    SchichtPilotStorage.setEditId(null);
  }

  const draft = SchichtPilotStorage.readDraft();
  if (draft && !isNewMode) {
    fillForm(draft);
    return;
  }

  shiftDate.value = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : todayForInput();
  endTime.value = "06:00";
  pauseStart.value = "00:30";
  pauseEnd.value = "01:00";
  setDefaultStart();
  setSelectedStatus("Arbeit");
  syncDisplays();
}

statusInputs.forEach(input => {
  input.addEventListener("change", syncStatusMode);
});

shiftDate.addEventListener("change", () => {
  if (!SchichtPilotStorage.getEditId()) setDefaultStart();
  syncDisplays();
});

[startTime, endTime, pauseStart, pauseEnd].forEach(input => {
  input.addEventListener("input", syncDisplays);
  input.addEventListener("change", syncDisplays);
});

document.getElementById("shiftForm").addEventListener("submit", event => {
  event.preventDefault();
  formMessage.textContent = "";

  const status = selectedStatus();
  const isWork = status === "Arbeit";

  if (!shiftDate.value) {
    formMessage.textContent = "Bitte ein Datum auswählen.";
    return;
  }

  if (isWork && (!startTime.value || !endTime.value || !pauseStart.value || !pauseEnd.value)) {
    formMessage.textContent = "Bitte alle Zeiten ausfüllen.";
    return;
  }

  try {
    SchichtPilotStorage.saveDraft({
      id: SchichtPilotStorage.getEditId() || undefined,
      date: shiftDate.value,
      start: isWork ? startTime.value : "00:00",
      end: isWork ? endTime.value : "00:00",
      pauseStart: isWork ? pauseStart.value : "00:00",
      pauseEnd: isWork ? pauseEnd.value : "00:00",
      status
    });

    window.location.href = "vorschau.html?v=027";
  } catch {
    formMessage.textContent = "Die Eingaben konnten nicht für die Vorschau gespeichert werden.";
  }
});

loadForm();
