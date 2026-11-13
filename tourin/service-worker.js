"use strict";

const CACHE_NAME = "tourin-shell-v5";
const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./supabase-config.js",
    "./manifest.webmanifest",
    "./icons/tourin-192.png",
    "./icons/tourin-512.png",
    "./icons/apple-touch-icon.png",
    "./icons/tourin.svg",
    "./images/cape-comorin-sunset.webp"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName.startsWith("tourin-shell-") && cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const requestUrl = new URL(request.url);

    if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).then((response) => {
                if (response.ok) {
                    const responseCopy = response.clone();
                    event.waitUntil(
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(request, responseCopy))
                    );
                }
                return response;
            }).catch(async () => (
                await caches.match(request) || caches.match("./index.html")
            ))
        );
        return;
    }

    event.respondWith(
        fetch(request).then((response) => {
            if (response.ok) {
                const responseCopy = response.clone();
                event.waitUntil(
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(request, responseCopy))
                );
            }
            return response;
        }).catch(() => caches.match(request))
    );
});
