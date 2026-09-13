importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const CAMBRIDGE_HOST = "dictionary.cambridge.org";

async function handleRequest(event) {
	await scramjet.loadConfig();
	if (scramjet.route(event)) {
		const response = await scramjet.fetch(event);

		// Cambridge dictionary is an AMP page whose body content gets stripped
		// by Scramjet's WASM HTML parser. Detect the empty body and re-fetch
		// the raw HTML with simple regex-based URL rewriting as a fallback.
		if (event.request.url.includes(CAMBRIDGE_HOST)) {
			try {
				const cloned = response.clone();
				const text = await cloned.text();
				const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/);
				const bodyContent = bodyMatch ? bodyMatch[1].trim() : "";
				const dest = event.request.destination;

				if (bodyContent.length < 50) {
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

					return new Response(fixedHtml, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
				}
			} catch (e) {
				// Inject error into response for debugging
				const errorHtml = `<html><body><pre>Cambridge fix error: ${e.message}\n${e.stack}</pre></body></html>`;
				return new Response(errorHtml, {
					status: 200,
					headers: { "content-type": "text/html; charset=UTF-8" },
				});
			}
		}

		return response;
	}
	return fetch(event.request);
}

/**
 * Simple regex-based HTML URL rewriter.
 * Rewrites absolute, protocol-relative, and absolute-path URLs in common
 * attributes to use the Scramjet proxy prefix.
 */
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

	// Absolute and protocol-relative URLs in double quotes
	html = html.replace(
		new RegExp(`(\\b(?:${attrs})\\s*=\\s*)((https?:)?//[^"]+)`, "g"),
		(m, attr, url) => {
			if (skip(url)) return m;
			if (url.startsWith("//")) url = "https:" + url;
			return `${attr}"${enc(url)}"`;
		}
	);

	// Absolute path URLs in double quotes
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

	// Relative URLs in double quotes (src/href/action only — skip data-* to avoid false positives)
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

	// Same for single quotes
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

	// CSS url() with absolute URLs
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
