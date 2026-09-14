importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const CAMBRIDGE_HOST = "dictionary.cambridge.org";

async function handleRequest(event) {
	await scramjet.loadConfig();
	if (scramjet.route(event)) {
		if (event.request.url.includes(CAMBRIDGE_HOST)) {
			const response = await scramjet.fetch(event);
			try {
				const ct = response.headers.get("content-type") || "";
				if (ct.includes("text/html")) {
					let html = await response.text();

					// Ensure the page has an opaque background so the proxy
					// homepage doesn't show through the transparent iframe
					html = html.replace(
						/<head([^>]*)>/i,
						'<head$1><style>html,body{background:#fff !important;}</style>'
					);

					// Make all blocking scripts async so the parser isn't stuck
					// waiting on slow/unproxied script loads
					html = html.replace(
						/<script(\s[^>]*)?\ssrc=([^>]+)>(\s*<\/script>)?/g,
						(match, attrs, src) => {
							// Already async or defer? Leave it
							if (/\b(async|defer)\b/i.test(attrs || "")) return match;
							// Don't async Scramjet's own scripts — they must load in order
							if (src.includes("/scram/") || src.includes("data:")) return match;
							return `<script${attrs || ""} async src=${src}></script>`;
						}
					);

					const headers = new Headers(response.headers);
					return new Response(html, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
				}
				return response;
			} catch (e) {
				return response;
			}
		}
		return scramjet.fetch(event);
	}
	return fetch(event.request);
}

self.addEventListener("activate", (event) => {
	event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event));
});
