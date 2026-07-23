const CACHE_NAME = "schichtpilot-mobile-build-035";
const APP_SHELL = [
  "./",
  "./index.html",
  "./neue-schicht.html",
  "./vorschau.html",
  "./gespeichert.html",
  "./beenden.html",
  "./schichtkalender.html",
  "./betriebsstundenliste.html",
  "./datensicherung.html",
  "./css/main.css",
  "./js/calculation.js",
  "./js/storage.js",
  "./js/new-shift.js",
  "./js/preview.js",
  "./js/calendar.js",
  "./js/hours-list.js",
  "./js/pwa.js",
  "./js/app-exit.js",
  "./js/backup.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-64.png",
  "./offline.html"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("schichtpilot-mobile-") && key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function normalizeRequest(request) {
  const url = new URL(request.url);

  // Versionsparameter verändern den Inhalt nicht und sollen denselben Cache nutzen.
  url.searchParams.delete("v");
  url.searchParams.delete("mode");
  url.searchParams.delete("updated");

  return new Request(url.toString(), {
    method: "GET",
    headers: request.headers,
    mode: request.mode,
    credentials: request.credentials,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    cache: "default"
  });
}

async function cachedResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match(normalizeRequest(request), { ignoreSearch: true }))
  );
}

async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(normalizeRequest(request), networkResponse.clone()).catch(() => {});
    }

    return networkResponse;
  } catch {
    return (
      (await cachedResponse(request)) ||
      (await caches.match("./index.html")) ||
      (await caches.match("./offline.html"))
    );
  }
}

async function handleAsset(request) {
  const url = new URL(request.url);
  const updateCritical =
    url.pathname.endsWith("/js/pwa.js") ||
    url.pathname.endsWith("/manifest.webmanifest");

  if (!updateCritical) {
    const cached = await cachedResponse(request);
    if (cached) return cached;
  }

  try {
    const networkResponse = await fetch(request, {
      cache: updateCritical ? "no-store" : "default"
    });

    if (
      networkResponse &&
      networkResponse.ok &&
      new URL(request.url).origin === self.location.origin
    ) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(normalizeRequest(request), networkResponse.clone()).catch(() => {});
    }

    return networkResponse;
  } catch {
    return (
      (await cachedResponse(request)) ||
      new Response("", {
        status: 504,
        statusText: "Offline"
      })
    );
  }
}


self.addEventListener("message", event => {
  const message = event.data || {};

  if (message.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (message.type === "GET_BUILD" && event.source) {
    event.source.postMessage({
      type: "SCHICHTPILOT_BUILD",
      build: "035"
    });
  }
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(handleAsset(request));
});
