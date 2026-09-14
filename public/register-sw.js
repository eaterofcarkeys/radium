"use strict";
const stockSW = "./sw.js?v=" + Date.now();

/**
 * List of hostnames that are allowed to run serviceworkers on http://
 */
const swAllowedHostnames = ["localhost", "127.0.0.1"];

/**
 * Global util
 * Used in 404.html and index.html
 */
async function registerSW() {
	if (!navigator.serviceWorker) {
		if (
			location.protocol !== "https:" &&
			!swAllowedHostnames.includes(location.hostname)
		)
			throw new Error("Service workers cannot be registered without https.");

		throw new Error("Your browser doesn't support service workers.");
	}

	const reg = await navigator.serviceWorker.register(stockSW);

	// When a new SW takes over, reload the page so it uses the latest version
	if (reg.waiting) {
		reg.waiting.postMessage({ type: "SKIP_WAITING" });
	}
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		window.location.reload();
	});
	reg.addEventListener("updatefound", () => {
		const newWorker = reg.installing;
		if (newWorker) {
			newWorker.addEventListener("statechange", () => {
				if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
					newWorker.postMessage({ type: "SKIP_WAITING" });
				}
			});
		}
	});
}
