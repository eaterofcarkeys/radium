"use strict";
/**
 * @type {HTMLFormElement}
 */
const form = document.getElementById("sj-form");
/**
 * @type {HTMLInputElement}
 */
const address = document.getElementById("sj-address");
/**
 * @type {HTMLInputElement}
 */
const searchEngineInput = document.getElementById("sj-search-engine");
/**
 * @type {HTMLParagraphElement}
 */
const error = document.getElementById("sj-error");
/**
 * @type {HTMLPreElement}
 */
const errorCode = document.getElementById("sj-error-code");

const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
	flags: {
		allowInvalidJs: true,
		allowFailedIntercepts: true,
	},
});

scramjet.init();
scramjet.modifyConfig({
	siteFlags: {
		"dictionary\\.cambridge\\.org": {
			strictRewrites: false,
			destructureRewrites: false,
		},
	},
});

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

let currentFrame = null;

function resolveUrl(input) {
	let currentEngineBase = searchEngineInput.value.trim();
	if (!currentEngineBase.includes("?q=") && !currentEngineBase.includes("?query=")) {
		currentEngineBase = currentEngineBase.replace(/\/+$/, "") + "/?q=";
	}
	if (/^(http|https):\/\//i.test(input)) {
		try { return new URL(input).toString(); } catch (e) { return currentEngineBase + encodeURIComponent(input); }
	} else if (input.includes(".") && !input.includes(" ") && !input.endsWith(".")) {
		try { return new URL(`https://${input}`).toString(); } catch (e) { return currentEngineBase + encodeURIComponent(input); }
	} else {
		return currentEngineBase + encodeURIComponent(input);
	}
}

let loadingTimeout = null;

function showLoading() {
	document.getElementById("loadingOverlay").style.display = "flex";
	clearTimeout(loadingTimeout);
	loadingTimeout = setTimeout(hideLoading, 15000);
}

function hideLoading() {
	document.getElementById("loadingOverlay").style.display = "none";
	clearTimeout(loadingTimeout);
}

form.addEventListener("submit", (event) => {
	event.preventDefault();
	showLoading();
	const finalUrl = resolveUrl(address.value.trim());

	document.getElementById("bbUrl").value = finalUrl;
	document.getElementById("browserBar").style.display = "flex";

	(async () => {
		try {
			await registerSW();
		} catch (err) {
			error.textContent = "Failed to register service worker.";
			errorCode.textContent = err.toString();
			hideLoading();
			throw err;
		}

		let wispUrl =
			(location.protocol === "https:" ? "wss" : "ws") +
			"://" +
			location.host +
			"/wisp/";
			
		if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
			await connection.setTransport("/libcurl/index.mjs", [
				{ websocket: wispUrl },
			]);
		}
		
		const oldFrame = document.getElementById("sj-frame");
		if (oldFrame) oldFrame.remove();

		const frame = scramjet.createFrame();
		frame.frame.id = "sj-frame";
		
		document.body.appendChild(frame.frame);
		frame.go(finalUrl);

		currentFrame = frame;

		frame.addEventListener("navigate", () => hideLoading());
		frame.addEventListener("urlchange", () => hideLoading());
		frame.addEventListener("contextInit", () => {
			hideLoading();
			setTimeout(() => { document.getElementById("bbUrl").value = finalUrl; }, 300);
		});
		frame.frame.addEventListener("load", () => {
			hideLoading();
			setTimeout(() => { document.getElementById("bbUrl").value = finalUrl; }, 300);
		});
	})();
});

// ==========================================================================
// BROWSER NAVIGATION BAR
// ==========================================================================
const browserBar = document.getElementById("browserBar");
const urlBar = document.getElementById("bbUrl");

document.getElementById("bbBack").addEventListener("click", () => { showLoading(); currentFrame?.back(); });
document.getElementById("bbForward").addEventListener("click", () => { showLoading(); currentFrame?.forward(); });
document.getElementById("bbReload").addEventListener("click", () => { showLoading(); currentFrame?.reload(); });
document.getElementById("bbHome").addEventListener("click", () => {
	if (currentFrame) {
		currentFrame.frame.remove();
		currentFrame = null;
	}
	browserBar.style.display = "none";
	address.value = "";
	hideLoading();
});

urlBar.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && currentFrame) {
		e.preventDefault();
		showLoading();
		currentFrame.go(resolveUrl(urlBar.value.trim()));
	}
});

// ==========================================================================
// SEARCH ENGINE AGGREGATOR SWITCHER SYSTEM
// ==========================================================================
const engineSelector = document.getElementById("engineSelector");

function applySearchEngine(engineBaseUrl) {
	let cleanUrl = engineBaseUrl.trim();
	
	// Defensive Guard: If an old or broken plain URL got stuck in cache, auto-repair it
	if (!cleanUrl.includes("?q=") && !cleanUrl.includes("?query=")) {
		if (cleanUrl.includes("brave.com")) {
			cleanUrl = "https://brave.com";
		} else if (cleanUrl.includes("startpage.com")) {
			cleanUrl = "https://startpage.com";
		} else {
			cleanUrl = "https://duckduckgo.com";
		}
	}

	searchEngineInput.value = cleanUrl;
	engineSelector.value = cleanUrl;
	localStorage.setItem("radium_engine", cleanUrl);
}

engineSelector.addEventListener("change", (e) => applySearchEngine(e.target.value));

// Pull saved value, falling back strictly to the formatted parameter URL path string
const savedEngine = localStorage.getItem("radium_engine") || "https://duckduckgo.com";
applySearchEngine(savedEngine);

// ==========================================================================
// DYNAMIC RGB PALETTE INTERACTIVE TRANSITION SYSTEM
// ==========================================================================
const colorPicker = document.getElementById("themeColorPicker");
const b1 = document.getElementById("blobOne");
const b2 = document.getElementById("blobTwo");
const b3 = document.getElementById("blobThree");

function applyThemeColor(hexColor) {
	document.documentElement.style.setProperty('--accent', hexColor);
	colorPicker.value = hexColor;
	localStorage.setItem("radium_accent", hexColor);

	b1.style.background = `radial-gradient(circle, ${hexColor}1f 0%, ${hexColor}0a 40%, transparent 70%)`;
	b2.style.background = `radial-gradient(circle, ${hexColor}14 0%, ${hexColor}05 40%, transparent 70%)`;
	b3.style.background = `radial-gradient(circle, ${hexColor}0f 0%, ${hexColor}02 40%, transparent 70%)`;
}

colorPicker.addEventListener("input", (e) => applyThemeColor(e.target.value));

document.querySelectorAll(".preset-dot").forEach(dot => {
	dot.addEventListener("click", () => applyThemeColor(dot.getAttribute("data-color")));
});

const savedAccent = localStorage.getItem("radium_accent") || "#00ff64";
applyThemeColor(savedAccent);

// ==========================================================================
// PERSISTENT CONFIGURABLE BOOKMARK MANAGER
// ==========================================================================
const bmsContainer = document.getElementById("bookmarksContainer");
const bmModal = document.getElementById("bmModal");
const modalList = document.getElementById("modalList");
const addBmForm = document.getElementById("bm-add-form");

const defaultBookmarks = [
	{ title: "discord", url: "https://discord.com" },
	{ title: "cineby", url: "https://cineby.sc" },
	{ title: "roblox", url: "https://roblox.com" }
];

let bookmarks = JSON.parse(localStorage.getItem("radium_bookmarks")) || defaultBookmarks;

function saveBookmarks() {
	localStorage.setItem("radium_bookmarks", JSON.stringify(bookmarks));
	renderBookmarks();
}

function renderBookmarks() {
	bmsContainer.innerHTML = "";
	modalList.innerHTML = "";

	bookmarks.forEach((bm, index) => {
		const cleanDomain = bm.url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
		
		// FIX 3: Fixed the broken variable template literal for the Google Favicon API url string
		const faviconUrl = `https://google.com{cleanDomain}`;

		const item = document.createElement("a");
		item.className = "bookmark-item";
		item.href = "#";
		
		// FIX 4: Complete loop protection using a clean transparency data URI fallback asset layout
		item.innerHTML = `
			<span class="bookmark-icon">
				<img src="${faviconUrl}" alt="" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://w3.org viewBox=%220 0 24 24%22 width=%2224%22 height=%2224%22><text y=%2222%22 font-size=%2222%22>🌐</text></svg>';"/>
			</span>
			<span class="bookmark-text">${bm.title}</span>
		`;
		item.addEventListener("click", (e) => {
			e.preventDefault();
			address.value = bm.url;
			form.requestSubmit();
		});
		bmsContainer.appendChild(item);

		const listItem = document.createElement("div");
		listItem.className = "modal-list-item";
		listItem.innerHTML = `
			<span><img src="${faviconUrl}" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;" onerror="this.remove()"/>${bm.title}</span>
			<button class="btn-del" type="button" data-index="${index}">remove</button>
		`;
		modalList.appendChild(listItem);
	});

	const configBtn = document.createElement("a");
	configBtn.className = "bookmark-item";
	configBtn.href = "#";
	configBtn.innerHTML = `
		<span class="bookmark-icon" style="border-style: dashed; font-size: 18px; color: var(--fg-muted);">＋</span>
		<span class="bookmark-text" style="opacity: 0.5;">edit</span>
	`;
	configBtn.addEventListener("click", (e) => {
		e.preventDefault();
		bmModal.style.display = "flex";
	});
	bmsContainer.appendChild(configBtn);
}

document.getElementById("closeModal").addEventListener("click", () => bmModal.style.display = "none");

modalList.addEventListener("click", (e) => {
	if (e.target.classList.contains("btn-del")) {
		const targetIndex = parseInt(e.target.getAttribute("data-index"), 10);
		bookmarks.splice(targetIndex, 1);
		saveBookmarks();
	}
});

addBmForm.addEventListener("submit", (e) => {
	e.preventDefault();
	let urlInput = document.getElementById("bm-url").value.trim();
	
	if (!/^https?:\/\//i.test(urlInput)) {
		urlInput = "https://" + urlInput;
	}

	bookmarks.push({
		title: document.getElementById("bm-title").value.trim().toLowerCase(),
		url: urlInput
	});

	saveBookmarks();
	addBmForm.reset();
});

renderBookmarks();
