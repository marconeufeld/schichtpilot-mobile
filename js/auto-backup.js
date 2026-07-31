(() => {
  "use strict";

  const FORMAT_NAME = "SchichtPilot Backup";
  const FORMAT_VERSION = 1;
  const BUILD = "042";

  function fileName() {
    const now = new Date();
    const value = number => String(number).padStart(2, "0");
    return (
      `SchichtPilot_Mobile_${now.getFullYear()}-${value(now.getMonth() + 1)}-${value(now.getDate())}` +
      `_${value(now.getHours())}-${value(now.getMinutes())}-${value(now.getSeconds())}.spb`
    );
  }

  function buildPayload(shifts, reason) {
    return {
      format: FORMAT_NAME,
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      application: {
        name: "SchichtPilot",
        platform: "mobile",
        build: BUILD
      },
      purpose: "automatic",
      reason: String(reason || "data-change"),
      data: { shifts }
    };
  }

  function triggerDownload(payload, name) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function create(reason = "data-change") {
    if (!window.SchichtPilotStorage) {
      throw new Error("Die gespeicherten Daten sind für die Sicherung nicht verfügbar.");
    }

    const shifts = window.SchichtPilotStorage.readAll();
    const name = fileName();
    triggerDownload(buildPayload(shifts, reason), name);
    return { fileName: name, count: shifts.length };
  }

  function showToast(message, type = "success") {
    let toast = document.getElementById("autoBackupToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "autoBackupToast";
      toast.setAttribute("role", "status");
      Object.assign(toast.style, {
        position: "fixed",
        left: "16px",
        right: "16px",
        bottom: "calc(18px + env(safe-area-inset-bottom))",
        zIndex: "9999",
        padding: "13px 15px",
        borderRadius: "14px",
        fontWeight: "700",
        textAlign: "center",
        boxShadow: "0 14px 40px rgba(0,0,0,.35)",
        transition: "opacity .2s ease"
      });
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.background = type === "error" ? "#7f1d1d" : "#14532d";
    toast.style.color = "#fff";
    toast.style.opacity = "1";
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.style.opacity = "0";
    }, 3200);
  }

  window.SchichtPilotAutoBackup = { create, showToast };
})();
