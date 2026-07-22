(() => {
  const PWA_BUILD = "027";

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  document.documentElement.classList.toggle("standalone-mode", isStandalone());

  if (!("serviceWorker" in navigator)) {
    console.warn("Service Worker werden von diesem Browser nicht unterstützt.");
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `./service-worker.js?v=${PWA_BUILD}`,
        { scope: "./" }
      );

      // Bei jedem App-Start nach einem neuen Build suchen.
      registration.update().catch(() => {});

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (sessionStorage.getItem("schichtPilot.pwaReloaded") === PWA_BUILD) return;

        try {
          sessionStorage.setItem("schichtPilot.pwaReloaded", PWA_BUILD);
        } catch {
          // Ein blockiertes sessionStorage verhindert das Update nicht.
        }

        window.location.reload();
      });
    } catch (error) {
      console.error("Offline-Modus konnte nicht vorbereitet werden.", error);
    }
  });
})();
