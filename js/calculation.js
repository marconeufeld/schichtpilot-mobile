window.SchichtPilotCalc = (() => {
  function minutesFromTime(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);

    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    return hours * 60 + minutes;
  }

  function overlap(aStart, aEnd, bStart, bEnd) {
    return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  }

  function normalizeEnd(start, end) {
    return end <= start ? end + 1440 : end;
  }

  function normalizePoint(point, shiftStart) {
    return point < shiftStart ? point + 1440 : point;
  }

  function decimalHoursText(minutes, withUnit = false) {
    if (!Number.isFinite(minutes) || minutes < 0) return "–";
    const value = minutes / 60;
    const formatted = value.toLocaleString("de-DE", {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
      maximumFractionDigits: 2
    });
    return withUnit ? `${formatted} h` : formatted;
  }

  function calculate(data) {
    const start = minutesFromTime(data.start);
    let end = minutesFromTime(data.end);
    let pauseStart = minutesFromTime(data.pauseStart);
    let pauseEnd = minutesFromTime(data.pauseEnd);

    if ([start, end, pauseStart, pauseEnd].some(value => value === null)) {
      throw new Error("Bitte die eingegebenen Zeiten prüfen.");
    }

    end = normalizeEnd(start, end);
    pauseStart = normalizePoint(pauseStart, start);
    pauseEnd = normalizePoint(pauseEnd, start);
    if (pauseEnd <= pauseStart) pauseEnd += 1440;

    const gross = end - start;
    if (gross <= 0 || gross > 18 * 60) throw new Error("Die Schichtdauer ist unplausibel.");

    const pauseMinutes = overlap(start, end, pauseStart, pauseEnd);
    const paid = gross - pauseMinutes;

    const netBlock = (blockStart, blockEnd) => {
      const worked = overlap(start, end, blockStart, blockEnd);
      const pauseInBlock = overlap(pauseStart, pauseEnd, blockStart, blockEnd);
      return Math.max(0, worked - pauseInBlock);
    };

    return {
      gross,
      pauseMinutes,
      paid,
      block2124: netBlock(1260, 1440),
      block0004: netBlock(1440, 1680),
      block0406: netBlock(1680, 1800)
    };
  }

  return { calculate, decimalHoursText };
})();
