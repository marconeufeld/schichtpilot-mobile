const calendarGrid = document.getElementById("calendarGrid");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const calendarSubtitle = document.getElementById("calendarSubtitle");
const monthShiftSummary = document.getElementById("monthShiftSummary");
const monthHoursSummary = document.getElementById("monthHoursSummary");
const monthNightSummary = document.getElementById("monthNightSummary");
const monthAverageSummary = document.getElementById("monthAverageSummary");
const monthWorkCount = document.getElementById("monthWorkCount");
const monthVacationCount = document.getElementById("monthVacationCount");
const monthSickCount = document.getElementById("monthSickCount");
const monthHolidayCount = document.getElementById("monthHolidayCount");
const earningsHiddenState = document.getElementById("earningsHiddenState");
const earningsValues = document.getElementById("earningsValues");
const earningsRevealButton = document.getElementById("earningsRevealButton");
const earningsHideButton = document.getElementById("earningsHideButton");
const earningsCountdown = document.getElementById("earningsCountdown");
const earningsProgressBar = document.getElementById("earningsProgressBar");
const monthEarningsGross = document.getElementById("monthEarningsGross");
const monthEarningsNet = document.getElementById("monthEarningsNet");
const monthPayoutForecast = document.getElementById("monthPayoutForecast");
const monthBaseGross = document.getElementById("monthBaseGross");
const monthNightBonus = document.getElementById("monthNightBonus");
const monthTravelAllowance=document.getElementById("monthTravelAllowance");
const monthDetailsToggle = document.getElementById("monthDetailsToggle");
const monthDetailsPanel = document.getElementById("monthDetailsPanel");
const previousMonthButton = document.getElementById("previousMonthButton");
const nextMonthButton = document.getElementById("nextMonthButton");
const todayButton = document.getElementById("todayButton");

const dayPanel = document.getElementById("dayPanel");
const selectedDateLabel = document.getElementById("selectedDateLabel");
const selectedShiftCount = document.getElementById("selectedShiftCount");
const selectedShiftList = document.getElementById("selectedShiftList");
const newShiftForDayButton = document.getElementById("newShiftForDayButton");
const calendarEmptyHint = document.getElementById("calendarEmptyHint");

const today = new Date();
today.setHours(12, 0, 0, 0);

const CALENDAR_VIEW_KEY = "schichtpilot_calendar_view";

function readRememberedCalendarView() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CALENDAR_VIEW_KEY));
    if (
      saved &&
      Number.isInteger(saved.year) &&
      Number.isInteger(saved.month) &&
      saved.month >= 0 &&
      saved.month <= 11
    ) {
      return saved;
    }
  } catch {
    // Ungültige Sitzungsdaten werden einfach ignoriert.
  }

  return {
    year: today.getFullYear(),
    month: today.getMonth()
  };
}

function rememberCalendarView() {
  try {
    sessionStorage.setItem(CALENDAR_VIEW_KEY, JSON.stringify({
      year: visibleYear,
      month: visibleMonth
    }));
  } catch {
    // Der Kalender funktioniert auch, wenn Safari Sitzungsdaten blockiert.
  }
}

const rememberedCalendarView = readRememberedCalendarView();

let visibleYear = rememberedCalendarView.year;
let visibleMonth = rememberedCalendarView.month;
let selectedDateKey = null;
let hasAutoSelectedToday = false;
let touchStartX = null;
let touchStartY = null;
let earningsHideTimer = null;
let earningsCountdownTimer = null;
const EARNINGS_VISIBLE_SECONDS = 8;

// Dieselben Lohn- und Prognosewerte wie in der Desktop-App.
const HOURLY_WAGE_EURO = 16.50;
const NIGHT_BONUS_RATE = 0.25;
const TRAVEL_PER_DAY_EURO = 3.04;
const BAV_EMPLOYEE_EURO = 182.75;
const BAV_EMPLOYER_EURO = 32.25;
const WAGE_TAX_RATE = 0.079;
const SOCIAL_CONTRIBUTION_RATE = 0.2153;
const PAID_ABSENCE_HOURS = 7.5;

function localDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateFromKey(key) {
  return new Date(`${key}T12:00:00`);
}

function formatLongDate(key) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(dateFromKey(key));
}

function formatShiftCount(count) {
  return count === 1 ? "1 Schicht" : `${count} Schichten`;
}

function normalizeStatus(status) {
  const value = String(status || "Arbeit").trim().toLowerCase();

  if (value === "urlaub") return "vacation";
  if (value === "krank" || value === "krankheit") return "sick";
  if (value === "feiertag") return "holiday";
  return "work";
}

function statusLabel(status) {
  const normalized = normalizeStatus(status);

  if (normalized === "vacation") return "Urlaub";
  if (normalized === "sick") return "Krank";
  if (normalized === "holiday") return "Feiertag";
  return "Arbeit";
}


function countMonthStatuses(shifts) {
  return shifts.reduce((counts, shift) => {
    const status = normalizeStatus(shift.status);
    counts[status] += 1;
    return counts;
  }, {
    work: 0,
    vacation: 0,
    sick: 0,
    holiday: 0
  });
}

function dayStatusClasses(shifts) {
  return [...new Set(shifts.map(shift => normalizeStatus(shift.status)))];
}

function getShiftsByDate() {
  return SchichtPilotStorage.readAll().reduce((map, shift) => {
    if (!map.has(shift.date)) map.set(shift.date, []);
    map.get(shift.date).push(shift);
    return map;
  }, new Map());
}

function euroText(value) {
  return Number(value || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function calculateEarnings(monthTotals) {
  const paidHours = monthTotals.paid / 60;
  const nightHours = monthTotals.night / 60;

  const baseGross = paidHours * HOURLY_WAGE_EURO;
  const absenceGross =
    monthTotals.absenceDays * PAID_ABSENCE_HOURS * HOURLY_WAGE_EURO;
  const nightBonus = nightHours * HOURLY_WAGE_EURO * NIGHT_BONUS_RATE;
  const travelAllowance = monthTotals.workedDays * TRAVEL_PER_DAY_EURO;

  // Die bAV-Werte werden – wie in der Desktop-App – einmal pro ausgewertetem
  // Monat berücksichtigt, sobald mindestens eine gültige Schicht vorhanden ist.
  const hasMonthEntries = monthTotals.validEntries > 0;
  const bavEmployee = hasMonthEntries ? BAV_EMPLOYEE_EURO : 0;
  const bavEmployer = hasMonthEntries ? BAV_EMPLOYER_EURO : 0;

  // Formeln entsprechen der Desktop-App.
  const grossTotal =
    baseGross + absenceGross + nightBonus + travelAllowance + bavEmployer;
  const taxableGross = Math.max(
    0,
    baseGross + absenceGross - bavEmployee
  );
  const estimatedWageTax = taxableGross * WAGE_TAX_RATE;
  const estimatedSocialContributions = taxableGross * SOCIAL_CONTRIBUTION_RATE;
  const estimatedNet = Math.max(
    0,
    grossTotal - estimatedWageTax - estimatedSocialContributions
  );

  // Wie in der Desktop-App: Die Netto-Prognose enthält die gesamte bAV.
  // Für den erwarteten Auszahlungsbetrag wird bAV gesamt wieder abgezogen.
  const bavTotal = bavEmployee + bavEmployer;
  const payoutForecast = Math.max(0, estimatedNet - bavTotal);

  return {
    baseGross,
    absenceGross,
    nightBonus,
    travelAllowance,
    grossTotal,
    estimatedNet,
    payoutForecast
  };
}

function calculateMonthTotals(shifts) {
  return shifts.reduce((totals, shift) => {
    const status = normalizeStatus(shift.status);

    if (status !== "work") {
      totals.validEntries += 1;
      totals.absenceDays += 1;
      return totals;
    }

    try {
      const result = SchichtPilotCalc.calculate(shift);
      totals.validEntries += 1;
      totals.workShifts += 1;
      totals.workedDays += 1;
      totals.paid += Number(result.paid || 0);
      totals.night +=
        Number(result.block2124 || 0) +
        Number(result.block0004 || 0) +
        Number(result.block0406 || 0);
    } catch {
      // Unvollständige synchronisierte Einträge verändern die Summen nicht.
    }

    return totals;
  }, {
    validEntries: 0,
    workShifts: 0,
    paid: 0,
    night: 0,
    workedDays: 0,
    absenceDays: 0
  });
}

function monthTransition(direction) {
  const className = direction > 0 ? "calendar-slide-next" : "calendar-slide-previous";
  calendarGrid.classList.remove("calendar-slide-next", "calendar-slide-previous");
  void calendarGrid.offsetWidth;
  calendarGrid.classList.add(className);

  window.setTimeout(() => {
    calendarGrid.classList.remove(className);
  }, 260);
}

function openShiftDetails(id, dateKey) {
  const params = new URLSearchParams({
    v: "038",
    shift: String(id),
    date: String(dateKey || "")
  });

  window.location.href = `betriebsstundenliste.html?${params.toString()}`;
}

function renderSelectedDay(shiftsByDate) {
  if (!selectedDateKey) {
    dayPanel.classList.add("hidden");
    return;
  }

  const shifts = (shiftsByDate.get(selectedDateKey) || [])
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));

  selectedDateLabel.textContent = formatLongDate(selectedDateKey);
  selectedShiftCount.textContent = formatShiftCount(shifts.length);
  selectedShiftList.innerHTML = "";

  newShiftForDayButton.href =
    `neue-schicht.html?v=035&mode=new&date=${encodeURIComponent(selectedDateKey)}`;

  if (!shifts.length) {
    const empty = document.createElement("div");
    empty.className = "selected-day-empty";
    empty.innerHTML = `
      <span>Keine Schicht eingetragen</span>
      <small>Über den Button unten kannst du direkt eine neue Schicht für diesen Tag anlegen.</small>
    `;
    selectedShiftList.appendChild(empty);
  }

  shifts.forEach(shift => {
    let result = null;

    if (normalizeStatus(shift.status) === "work") {
      try {
        result = SchichtPilotCalc.calculate(shift);
      } catch {
        result = null;
      }
    }

    const item = document.createElement("button");
    item.className = "calendar-shift-item";
    item.type = "button";
    item.setAttribute("aria-label", `Details zur Schicht ${shift.start} bis ${shift.end} öffnen`);

    const normalizedStatus = normalizeStatus(shift.status);

    item.classList.add(`status-${normalizedStatus}`);

    const isWork = normalizedStatus === "work";

    item.innerHTML = `
      <span class="calendar-shift-status-dot" aria-hidden="true"></span>
      <span class="calendar-shift-time">${
        isWork ? `${shift.start}–${shift.end}` : statusLabel(shift.status)
      }</span>
      <span class="calendar-shift-meta">
        ${
          isWork
            ? `Arbeit · ${result ? `${SchichtPilotCalc.decimalHoursText(result.paid, true)} bezahlt` : "Zeiten prüfen"}`
            : "7,5 h bezahlte Abwesenheit"
        }
      </span>
      <span class="calendar-shift-arrow">›</span>
    `;

    item.addEventListener("click", () => openShiftDetails(shift.id, selectedDateKey));
    selectedShiftList.appendChild(item);
  });

  dayPanel.classList.remove("hidden");
}

function selectDay(dateKey) {
  const isChangingDay = selectedDateKey && selectedDateKey !== dateKey;

  if (isChangingDay && !dayPanel.classList.contains("hidden")) {
    dayPanel.classList.add("day-panel-switching");
  }

  selectedDateKey = dateKey;

  window.setTimeout(() => {
    renderCalendar();
    dayPanel.classList.remove("day-panel-switching");

    requestAnimationFrame(() => {
      dayPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, isChangingDay ? 90 : 0);
}

function renderCalendar() {
  const shiftsByDate = getShiftsByDate();
  const firstDay = new Date(visibleYear, visibleMonth, 1, 12);
  const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0, 12).getDate();
  const mondayBasedOffset = (firstDay.getDay() + 6) % 7;
  const monthPrefix = `${visibleYear}-${String(visibleMonth + 1).padStart(2, "0")}`;

  calendarMonthLabel.textContent = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric"
  }).format(firstDay);

  const isCurrentVisibleMonth =
    visibleYear === today.getFullYear() &&
    visibleMonth === today.getMonth();

  todayButton.classList.toggle("hidden", isCurrentVisibleMonth);

  const allShifts = SchichtPilotStorage.readAll();
  const monthShifts = allShifts.filter(shift => shift.date.startsWith(monthPrefix));
  const monthShiftCount = monthShifts.length;
  const monthTotals = calculateMonthTotals(monthShifts);
  const monthStatusCounts = countMonthStatuses(monthShifts);

  calendarSubtitle.textContent =
    monthShiftCount === 0
      ? "Noch keine Schichten"
      : "Dein Monat auf einen Blick";

  monthShiftSummary.textContent = String(monthShiftCount);
  monthHoursSummary.textContent =
    SchichtPilotCalc.decimalHoursText(monthTotals.paid, true);
  monthNightSummary.textContent =
    SchichtPilotCalc.decimalHoursText(monthTotals.night, true);
  monthAverageSummary.textContent =
    SchichtPilotCalc.decimalHoursText(
      monthTotals.workShifts ? monthTotals.paid / monthTotals.workShifts : 0,
      true
    );

  monthWorkCount.textContent = String(monthStatusCounts.work);
  monthVacationCount.textContent = String(monthStatusCounts.vacation);
  monthSickCount.textContent = String(monthStatusCounts.sick);
  monthHolidayCount.textContent = String(monthStatusCounts.holiday);

  const earnings = calculateEarnings(monthTotals);
  monthEarningsGross.textContent = euroText(earnings.grossTotal);
  monthEarningsNet.textContent = euroText(earnings.estimatedNet);
  monthPayoutForecast.textContent = euroText(earnings.payoutForecast);
  monthBaseGross.textContent = euroText(earnings.baseGross);
  monthNightBonus.textContent = euroText(earnings.nightBonus);
  monthTravelAllowance.textContent=euroText(earnings.travelAllowance);

  calendarEmptyHint.classList.toggle("hidden", monthShiftCount > 0);
  calendarGrid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const dayNumber = index - mondayBasedOffset + 1;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    cell.setAttribute("role", "gridcell");

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cell.classList.add("calendar-day-empty");
      cell.disabled = true;
      cell.setAttribute("aria-hidden", "true");
      calendarGrid.appendChild(cell);
      continue;
    }

    const dateKey = localDateKey(visibleYear, visibleMonth, dayNumber);
    const shifts = shiftsByDate.get(dateKey) || [];
    const isToday = dateKey === localDateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const isSelected = dateKey === selectedDateKey;

    cell.innerHTML = `
      <span class="calendar-day-number">${dayNumber}</span>
      ${shifts.length ? `
        <span class="calendar-status-markers" aria-hidden="true">
          ${dayStatusClasses(shifts).map(statusClass =>
            `<i class="calendar-status-dot status-${statusClass}"></i>`
          ).join("")}
        </span>
        ${shifts.length > 1 ? `<span class="calendar-shift-count">${shifts.length}</span>` : ""}
      ` : ""}
    `;

    if (shifts.length) {
      cell.classList.add("has-shift");
      dayStatusClasses(shifts).forEach(statusClass => {
        cell.classList.add(`status-${statusClass}`);
      });
    }
    if (isToday) cell.classList.add("is-today");
    if (isSelected) cell.classList.add("is-selected");

    cell.setAttribute(
      "aria-label",
      `${formatLongDate(dateKey)}${
        shifts.length
          ? `, ${formatShiftCount(shifts.length)}, ${[...new Set(shifts.map(shift => statusLabel(shift.status)))].join(", ")}`
          : ", keine Schicht"
      }`
    );
    cell.setAttribute("aria-selected", String(isSelected));
    cell.addEventListener("click", () => selectDay(dateKey));

    calendarGrid.appendChild(cell);
  }

  const todayKey = localDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const isCurrentMonth =
    visibleYear === today.getFullYear() &&
    visibleMonth === today.getMonth();

  if (!hasAutoSelectedToday && !selectedDateKey && isCurrentMonth && shiftsByDate.has(todayKey)) {
    selectedDateKey = todayKey;
    hasAutoSelectedToday = true;
    renderCalendar();
    return;
  }

  renderSelectedDay(shiftsByDate);
}

function hideEarnings() {
  if (earningsHideTimer) {
    window.clearTimeout(earningsHideTimer);
    earningsHideTimer = null;
  }

  if (earningsCountdownTimer) {
    window.clearInterval(earningsCountdownTimer);
    earningsCountdownTimer = null;
  }

  earningsProgressBar.classList.remove("is-running");
  earningsProgressBar.style.removeProperty("--earnings-duration");
  earningsCountdown.textContent = String(EARNINGS_VISIBLE_SECONDS);

  earningsValues.classList.add("hidden");
  earningsHiddenState.classList.remove("hidden");
  earningsRevealButton.setAttribute("aria-expanded", "false");
}

function revealEarnings() {
  hideEarnings();

  earningsHiddenState.classList.add("hidden");
  earningsValues.classList.remove("hidden");
  earningsRevealButton.setAttribute("aria-expanded", "true");

  let remainingSeconds = EARNINGS_VISIBLE_SECONDS;
  earningsCountdown.textContent = String(remainingSeconds);

  earningsProgressBar.style.setProperty(
    "--earnings-duration",
    `${EARNINGS_VISIBLE_SECONDS}s`
  );

  requestAnimationFrame(() => {
    earningsProgressBar.classList.add("is-running");
  });

  earningsCountdownTimer = window.setInterval(() => {
    remainingSeconds -= 1;
    earningsCountdown.textContent = String(Math.max(remainingSeconds, 0));

    if (remainingSeconds <= 0 && earningsCountdownTimer) {
      window.clearInterval(earningsCountdownTimer);
      earningsCountdownTimer = null;
    }
  }, 1000);

  earningsHideTimer = window.setTimeout(
    hideEarnings,
    EARNINGS_VISIBLE_SECONDS * 1000
  );
}

function changeMonth(offset) {
  hideEarnings();
  monthTransition(offset);

  window.setTimeout(() => {
    const next = new Date(visibleYear, visibleMonth + offset, 1, 12);
    visibleYear = next.getFullYear();
    visibleMonth = next.getMonth();
    selectedDateKey = null;
    rememberCalendarView();
    renderCalendar();
  }, 110);
}

earningsRevealButton.addEventListener("click", revealEarnings);
earningsHideButton.addEventListener("click", hideEarnings);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) hideEarnings();
});

window.addEventListener("pagehide", hideEarnings);

monthDetailsToggle.addEventListener("click", () => {
  const willOpen = monthDetailsPanel.classList.contains("hidden");

  monthDetailsPanel.classList.toggle("hidden", !willOpen);
  monthDetailsToggle.classList.toggle("is-open", willOpen);
  monthDetailsToggle.setAttribute("aria-expanded", String(willOpen));
});

previousMonthButton.addEventListener("click", () => changeMonth(-1));
nextMonthButton.addEventListener("click", () => changeMonth(1));

todayButton.addEventListener("click", () => {
  hideEarnings();

  const direction =
    visibleYear < today.getFullYear() ||
    (visibleYear === today.getFullYear() && visibleMonth < today.getMonth())
      ? 1
      : -1;

  monthTransition(direction);

  window.setTimeout(() => {
    visibleYear = today.getFullYear();
    visibleMonth = today.getMonth();
    selectedDateKey = null;
    rememberCalendarView();
    renderCalendar();
  }, 110);
});

calendarGrid.addEventListener("touchstart", event => {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

calendarGrid.addEventListener("touchend", event => {
  if (touchStartX === null || touchStartY === null) return;

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;

  touchStartX = null;
  touchStartY = null;

  const isHorizontalSwipe =
    Math.abs(deltaX) >= 55 &&
    Math.abs(deltaX) > Math.abs(deltaY) * 1.35;

  if (!isHorizontalSwipe) return;

  changeMonth(deltaX < 0 ? 1 : -1);
}, { passive: true });

renderCalendar();
