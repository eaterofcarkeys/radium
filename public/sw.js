importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const CAMBRIDGE_HOST = "dictionary.cambridge.org";

async function handleRequest(event) {
	await scramjet.loadConfig();
	if (scramjet.route(event)) {
		const response = await scramjet.fetch(event);

		// Add visible debug comment to ALL HTML responses to verify SW is active
		const ct = response.headers.get("content-type") || "";
		if (ct.includes("text/html")) {
			try {
				const text = await response.clone().text();
				const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/);
				const bodyContent = bodyMatch ? bodyMatch[1].trim() : "";
				const hasBodyTag = text.includes("<body");
				const debug = `<!-- SW-DEBUG: url=${event.request.url.substring(0, 120)} dest=${event.request.destination} ct=${ct} hasBodyTag=${hasBodyTag} bodyLen=${bodyContent.length} textLen=${text.length} -->`;

				// If Cambridge and body is empty, try the fix
				if (event.request.url.includes(CAMBRIDGE_HOST) && (bodyContent.length < 50 || !hasBodyTag)) {
					const prefix = scramjet.config.prefix;
					const url = new URL(event.request.url);
					const prefixIndex = url.pathname.indexOf(prefix);
					const encodedTarget = url.pathname.substring(prefixIndex + prefix.length);
					const targetUrl = decodeURIComponent(encodedTarget);

					const rawResponse = await scramjet.client.fetch(targetUrl, {
						method: "GET",
						headers: {
							Accept: "text/html,application/xhtml+xml",
							"User-Agent": navigator.userAgent,
						},
						redirect: "follow",
					});
					const rawHtml = await rawResponse.text();
					const fixedHtml = rewriteHtmlUrls(rawHtml, targetUrl, prefix);

					const headers = new Headers(response.headers);
					headers.set("content-type", "text/html; charset=UTF-8");

					return new Response(fixedHtml + debug, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
				}

				return new Response(text + debug, {
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
				});
			} catch (e) {
				return new Response(`<html><body><pre>SW ERROR: ${e.message}\n${e.stack}</pre></body></html>`, {
					status: 200,
					headers: { "content-type": "text/html; charset=UTF-8" },
				});
			}
		}

		return response;
	}
	return fetch(event.request);
}

function rewriteHtmlUrls(html, baseUrl, prefix) {
	const enc = (url) => prefix + encodeURIComponent(url);
	const skip = (url) =>
		url.startsWith("data:") ||
		url.startsWith("javascript:") ||
		url.startsWith("blob:") ||
		url.startsWith("mailto:") ||
		url.startsWith("#") ||
		url.startsWith(prefix);

	const attrs = "src|href|action|poster|data-src|data-href|data-origin";

	html = html.replace(
		new RegExp(`(\\b(?:${attrs})\\s*=\\s*)((https?:)?//[^"]+)`, "g"),
		(m, attr, url) => {
			if (skip(url)) return m;
			if (url.startsWith("//")) url = "https:" + url;
			return `${attr}"${enc(url)}"`;
		}
	);

	html = html.replace(
		new RegExp(`(\\b(?:${attrs})\\s*=\\s*")(/[^"]+)"`, "g"),
		(m, attr, url) => {
			if (skip(url)) return m;
			try {
				return `${attr}${enc(new URL(url, baseUrl).href)}"`;
			} catch (e) {
				return m;
			}
		}
	);

	html = html.replace(
		/(\b(?:src|href|action)\s*=\s*")([^"\/:?#][^"]*?)"/g,
		(m, attr, url) => {
			if (skip(url) || url.includes("(") || url.includes("{")) return m;
			try {
				return `${attr}${enc(new URL(url, baseUrl).href)}"`;
			} catch (e) {
				return m;
			}
		}
	);

	html = html.replace(
		new RegExp(`(\\b(?:${attrs})\\s*=\\s*)((https?:)?//[^']+)`, "g"),
		(m, attr, url) => {
			if (skip(url)) return m;
			if (url.startsWith("//")) url = "https:" + url;
			return `${attr}'${enc(url)}'`;
		}
	);
	html = html.replace(
		new RegExp(`(\\b(?:${attrs})\\s*=\\s*')(/[^']+)'`, "g"),
		(m, attr, url) => {
			if (skip(url)) return m;
			try {
				return `${attr}${enc(new URL(url, baseUrl).href)}'`;
			} catch (e) {
				return m;
			}
		}
	);

	html = html.replace(/url\((['"]?)(https?:\/\/[^'")]+)(['"]?)\)/g, (m, q1, url, q2) => {
		if (skip(url)) return m;
		return `url(${q1}${enc(url)}${q2})`;
	});
	html = html.replace(/url\((['"]?)(\/\/[^'")]+)(['"]?)\)/g, (m, q1, url, q2) => {
		return `url(${q1}${enc("https:" + url)}${q2})`;
	});

	return html;
}

self.addEventListener("activate", (event) => {
	event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event));
});
