"use strict";

const CACHE_NAME = "chat-local-v1.16.0";
const APP_SHELL = [
    "/",
    "/index.html",
    "/style.css",
    "/chat-logic.js",
    "/app.js",
    "/sysstats.js",
    "/manifest.json",
    "/favicon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/offline.html",
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames
                .filter(cacheName => cacheName !== CACHE_NAME)
                .map(cacheName => caches.delete(cacheName))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin ||
        url.pathname === "/stats") return;

    event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok && shouldCache(request)) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("/offline.html");
        return new Response("Resource unavailable offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }
}

function shouldCache(request) {
    return request.mode === "navigate" ||
        /\.(?:css|js|json|png|svg)$/i.test(new URL(request.url).pathname);
}
