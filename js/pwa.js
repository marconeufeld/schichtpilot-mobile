(() => {
  "use strict";

  const PWA_BUILD = "042";
  const RELOAD_KEY = `schichtPilot.pwaReloaded.${PWA_BUILD}`;
  let refreshing = false;
  let updateRegistration = null;

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function createUpdateBanner() {
    let banner = document.getElementById("pwaUpdateBanner");
    if (banner) return banner;

    banner = document.createElement("aside");
    banner.id = "pwaUpdateBanner";
    banner.className = "pwa-update-banner";
    banner.hidden = true;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.innerHTML = `
      <div class="pwa-update-copy">
        <strong>Neue Version verfügbar</strong>
        <span>SchichtPilot kann jetzt sicher aktualisiert werden.</span>
      </div>
      <button id="pwaUpdateButton" type="button">Jetzt aktualisieren</button>
    `;

    document.body.appendChild(banner);

    banner.querySelector("#pwaUpdateButton").addEventListener("click", () => {
      const waiting = updateRegistration && updateRegistration.waiting;
      if (!waiting) {
        window.location.reload();
        return;
      }

      banner.classList.add("is-updating");
      banner.querySelector("#pwaUpdateButton").textContent = "Aktualisiere …";
      waiting.postMessage({ type: "SKIP_WAITING" });
    });

    return banner;
  }

  function showUpdateBanner(registration) {
    updateRegistration = registration;
    const banner = createUpdateBanner();
    banner.hidden = false;
  }

  function watchInstallingWorker(registration) {
    const worker = registration.installing;
    if (!worker) return;

    worker.addEventListener("statechange", () => {
      if (
        worker.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        showUpdateBanner(registration);
      }
    });
  }

  async function checkForUpdate(registration) {
    try {
      await registration.update();
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration);
      }
    } catch (error) {
      console.warn("Updateprüfung war nicht möglich.", error);
    }
  }

  document.documentElement.classList.toggle("standalone-mode", isStandalone());

  if (!("serviceWorker" in navigator)) {
    console.warn("Service Worker werden von diesem Browser nicht unterstützt.");
    return;
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;

    try {
      if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
      sessionStorage.setItem(RELOAD_KEY, "1");
    } catch {
      // Auch ohne sessionStorage darf die Seite aktualisieren.
    }

    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `./service-worker.js?v=${PWA_BUILD}`,
        {
          scope: "./",
          updateViaCache: "none"
        }
      );

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration);
      }

      registration.addEventListener("updatefound", () => {
        watchInstallingWorker(registration);
      });

      await checkForUpdate(registration);

      // Bei Rückkehr zur App erneut prüfen.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          checkForUpdate(registration);
        }
      });

      // Während einer längeren Nutzung regelmäßig prüfen.
      window.setInterval(() => {
        if (document.visibilityState === "visible") {
          checkForUpdate(registration);
        }
      }, 60 * 60 * 1000);
    } catch (error) {
      console.error("Offline-Modus konnte nicht vorbereitet werden.", error);
    }
  });
})();
