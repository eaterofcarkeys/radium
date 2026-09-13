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
				const text = await response.clone().text();
				const hasBodyTag = text.includes("<body");
				const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/);
				const bodyContent = bodyMatch ? bodyMatch[1].trim() : "";
				const ct = response.headers.get("content-type") || "NONE";

				return new Response(
					`<html><body>
					<h1>DEBUG INFO</h1>
					<p>textLen: ${text.length}</p>
					<p>ct: ${ct}</p>
					<p>hasBodyTag: ${hasBodyTag}</p>
					<p>bodyLen: ${bodyContent.length}</p>
					<p>bodyPreview: ${bodyContent.substring(0, 300).replace(/</g, "&lt;")}</p>
					<hr>
					<p>textPreview (first 1000 chars):</p>
					<pre>${text.substring(0, 1000).replace(/</g, "&lt;")}</pre>
					</body></html>`,
					{ status: 200, headers: { "content-type": "text/html; charset=UTF-8" } }
				);
			} catch (e) {
				return new Response(
					`<html><body><pre>ERROR: ${e.message}\n${e.stack}</pre></body></html>`,
					{ status: 200, headers: { "content-type": "text/html; charset=UTF-8" } }
				);
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
