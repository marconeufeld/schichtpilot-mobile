const shiftList = document.getElementById("shiftList");
const emptyState = document.getElementById("emptyState");
const monthLabel = document.getElementById("monthLabel");
const monthSummary = document.getElementById("monthSummary");
const summaryShiftCount = document.getElementById("summaryShiftCount");
const summaryPaidHours = document.getElementById("summaryPaidHours");

const deleteDialog = document.getElementById("deleteDialog");
const deleteText = document.getElementById("deleteText");
const cancelDeleteButton = document.getElementById("cancelDeleteButton");
const confirmDeleteButton = document.getElementById("confirmDeleteButton");

let pendingDeleteId = null;
const requestParams = new URLSearchParams(window.location.search);
const requestedShiftId = requestParams.get("shift");
const requestedDate = requestParams.get("date");

function normalizeStatus(status) {
  const value = String(status || "Arbeit").trim().toLowerCase();
  if (value === "urlaub") return "Urlaub";
  if (value === "krank" || value === "krankheit") return "Krank";
  if (value === "feiertag") return "Feiertag";
  return "Arbeit";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(dateValue) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(dateValue + "T12:00:00"));
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function editShift(id) {
  SchichtPilotStorage.setEditId(id);
  SchichtPilotStorage.clearDraft();
  window.location.href = "neue-schicht.html?v=045&mode=edit";
}

function openDeleteDialog(id) {
  const shift = SchichtPilotStorage.getById(id);
  if (!shift) return;

  pendingDeleteId = id;
  const status = normalizeStatus(shift.status);
  deleteText.textContent =
    status === "Arbeit"
      ? `Die Schicht vom ${formatDate(shift.date)} (${shift.start}–${shift.end}) wird dauerhaft gelöscht.`
      : `${status} am ${formatDate(shift.date)} wird dauerhaft gelöscht.`;

  deleteDialog.classList.remove("hidden");
  document.body.classList.add("dialog-open");
  confirmDeleteButton.focus();
}

function closeDeleteDialog() {
  pendingDeleteId = null;
  deleteDialog.classList.add("hidden");
  document.body.classList.remove("dialog-open");
}

function confirmDelete() {
  if (!pendingDeleteId) return;

  // Die Sicherung muss noch innerhalb des direkten Klick-Ereignisses gestartet
  // werden. Besonders iOS/PWA kann Downloads blockieren, sobald zuerst Dialog
  // oder Liste neu gerendert wurden.
  const deleteId = pendingDeleteId;
  const removed = SchichtPilotStorage.remove(deleteId);

  if (!removed) {
    closeDeleteDialog();
    render();
    return;
  }

  let backupSucceeded = false;
  try {
    SchichtPilotAutoBackup.create("shift-deleted");
    backupSucceeded = true;
  } catch (error) {
    console.error("Automatisches Mobile-Backup nach dem Löschen fehlgeschlagen.", error);
  }

  closeDeleteDialog();
  render();

  if (backupSucceeded) {
    SchichtPilotAutoBackup.showToast("Gelöscht und automatisch für den Desktop gesichert.");
  } else {
    SchichtPilotAutoBackup.showToast(
      "Eintrag gelöscht. Die automatische Sicherung konnte nicht erstellt werden.",
      "error"
    );
  }
}

function setCardOpen(card, open) {
  const header = card.querySelector(".shift-card-header");
  const details = card.querySelector(".shift-card-details");

  card.classList.toggle("is-open", open);
  header.setAttribute("aria-expanded", String(open));

  if (open) {
    details.style.maxHeight = details.scrollHeight + "px";
    details.style.opacity = "1";
  } else {
    details.style.maxHeight = "0px";
    details.style.opacity = "0";
  }
}

function toggleCard(card) {
  const shouldOpen = !card.classList.contains("is-open");

  document.querySelectorAll(".shift-card.is-open").forEach(openCard => {
    if (openCard !== card) setCardOpen(openCard, false);
  });

  setCardOpen(card, shouldOpen);
}

function getVisibleMonthData() {
  const allShifts = SchichtPilotStorage.readAll()
    .slice()
    .sort((a, b) => {
      const aKey = `${a.date}T${a.start}`;
      const bKey = `${b.date}T${b.start}`;
      return bKey.localeCompare(aKey);
    });

  const requestedShift = requestedShiftId
    ? allShifts.find(shift => String(shift.id) === String(requestedShiftId))
    : null;

  let requestedMonthKey = null;

  if (requestedShift && /^\d{4}-\d{2}-\d{2}$/.test(requestedShift.date)) {
    requestedMonthKey = requestedShift.date.slice(0, 7);
  } else if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    requestedMonthKey = requestedDate.slice(0, 7);
  }

  const monthKey = requestedMonthKey || currentMonthKey();
  let shifts = allShifts.filter(shift => shift.date.startsWith(monthKey));
  let displayDate = requestedMonthKey
    ? new Date(`${requestedMonthKey}-01T12:00:00`)
    : new Date();

  if (!shifts.length && allShifts.length && !requestedMonthKey) {
    const newest = allShifts[0];
    const fallbackMonth = newest.date.slice(0, 7);
    shifts = allShifts.filter(shift => shift.date.startsWith(fallbackMonth));
    displayDate = new Date(newest.date + "T12:00:00");
  }

  return { shifts, displayDate };
}

function renderSummary(shifts) {
  let paidMinutes = 0;

  shifts.forEach(shift => {
    if (normalizeStatus(shift.status) !== "Arbeit") return;

    try {
      paidMinutes += SchichtPilotCalc.calculate(shift).paid;
    } catch {
      // Fehlerhafte Arbeitseinträge werden in der Summe ignoriert.
    }
  });

  summaryShiftCount.textContent = String(shifts.length);
  summaryPaidHours.textContent = SchichtPilotCalc.decimalHoursText(paidMinutes, true);
  monthSummary.classList.toggle("hidden", shifts.length === 0);
}

function render() {
  const { shifts, displayDate } = getVisibleMonthData();

  monthLabel.textContent = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric"
  }).format(displayDate);

  shiftList.innerHTML = "";
  emptyState.classList.toggle("hidden", shifts.length > 0);
  renderSummary(shifts);

  if (!shifts.length) return;

  shifts.forEach((shift, index) => {
    const status = normalizeStatus(shift.status);
    const isWork = status === "Arbeit";
    let result = null;

    if (isWork) {
      try {
        result = SchichtPilotCalc.calculate(shift);
      } catch {
        return;
      }
    }

    const card = document.createElement("article");
    card.className = "shift-card";
    card.dataset.shiftId = shift.id;

    card.classList.add(`status-${status.toLowerCase()}`);

    card.innerHTML = `
      <button class="shift-card-header" type="button" aria-expanded="false">
        <span class="chevron">›</span>
        <span class="shift-card-date">${formatDate(shift.date)}</span>
        <strong>${isWork ? `${shift.start}–${shift.end}` : status}</strong>
      </button>

      <div class="shift-card-details">
        <div class="details-inner">
          ${
            isWork
              ? `
                <div class="result-row"><span>Pause</span><strong>${shift.pauseStart}–${shift.pauseEnd}</strong></div>
                <div class="result-row emphasized"><span>Bezahlte Stunden</span><strong>${SchichtPilotCalc.decimalHoursText(result.paid, true)}</strong></div>
                <div class="divider"></div>
                <div class="result-row"><span>21–24 Uhr</span><strong>${SchichtPilotCalc.decimalHoursText(result.block2124)}</strong></div>
                <div class="result-row"><span>00–04 Uhr</span><strong>${SchichtPilotCalc.decimalHoursText(result.block0004)}</strong></div>
                <div class="result-row"><span>04–06 Uhr</span><strong>${SchichtPilotCalc.decimalHoursText(result.block0406)}</strong></div>
              `
              : `
                <div class="result-row emphasized"><span>Bezahlte Abwesenheit</span><strong>7,5 h</strong></div>
                <div class="result-row"><span>Brutto</span><strong>123,75 €</strong></div>
                <div class="result-row"><span>Nachtzuschlag</span><strong>0,00 €</strong></div>
                <div class="result-row"><span>Fahrgeld</span><strong>0,00 €</strong></div>
              `
          }


          ${
            shift.comment
              ? `<div class="shift-comment"><span>Kommentar</span><p>${escapeHtml(shift.comment)}</p></div>`
              : ""
          }

          <button class="edit-button" type="button">✏️ Eintrag bearbeiten</button>
          <button class="delete-button" type="button">Eintrag löschen</button>
        </div>
      </div>
    `;

    const header = card.querySelector(".shift-card-header");
    header.addEventListener("click", () => toggleCard(card));
    card.querySelector(".edit-button").addEventListener("click", () => editShift(shift.id));
    card.querySelector(".delete-button").addEventListener("click", () => openDeleteDialog(shift.id));

    shiftList.appendChild(card);

    requestAnimationFrame(() => {
      const shouldFocus =
        requestedShiftId !== null &&
        String(requestedShiftId) === String(shift.id);
      setCardOpen(card, shouldFocus || (!requestedShiftId && index === 0));

      if (shouldFocus) {
        card.classList.add("is-focused");
        window.setTimeout(() => {
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
      }
    });
  });
}

cancelDeleteButton.addEventListener("click", closeDeleteDialog);
confirmDeleteButton.addEventListener("click", confirmDelete);

deleteDialog.addEventListener("click", event => {
  if (event.target === deleteDialog) closeDeleteDialog();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !deleteDialog.classList.contains("hidden")) {
    closeDeleteDialog();
  }
});

window.addEventListener("resize", () => {
  const openCard = document.querySelector(".shift-card.is-open");
  if (!openCard) return;
  const details = openCard.querySelector(".shift-card-details");
  details.style.maxHeight = details.scrollHeight + "px";
});

render();
