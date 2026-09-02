// オフライン対応用 Service Worker
// - ナビゲーション(index.html): ネットワーク優先、失敗時はキャッシュ済みのアプリシェルを返す
// - /assets/ 配下(ハッシュ付きの js/css): キャッシュ優先（内容が変わればファイル名も変わるため安全）
// - その他の同一オリジン GET(manifest, アイコンなど): キャッシュを返しつつ裏で更新
const CACHE_NAME = "time-management-v1";

// SW のURL(/time-management/sw.js)を基準にアプリのルートを求める
const APP_ROOT = new URL("./", self.location.href).href;

const PRECACHE_URLS = [
	"./",
	"./manifest.json",
	"./icon_192.png",
	"./icon_512.png",
].map((path) => new URL(path, self.location.href).href);

self.addEventListener("install", (event) => {
	event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== CACHE_NAME)
						.map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (!url.href.startsWith(APP_ROOT)) return;

	if (request.mode === "navigate") {
		event.respondWith(handleNavigation(event));
		return;
	}

	if (url.pathname.includes("/assets/")) {
		event.respondWith(cacheFirst(request));
		return;
	}

	event.respondWith(staleWhileRevalidate(event, request));
});

// 1件でも取得に失敗してもインストール自体は成功させる
async function precache() {
	const cache = await caches.open(CACHE_NAME);
	await Promise.allSettled(
		PRECACHE_URLS.map(async (url) => {
			const response = await fetch(new Request(url, { cache: "reload" }));
			if (response.ok) await cache.put(url, response);
		}),
	);
}

async function handleNavigation(event) {
	const cache = await caches.open(CACHE_NAME);
	try {
		const response = await fetch(event.request);
		if (response.status === 200) {
			// レスポンスは即返し、キャッシュ更新と後片付けは裏で行う
			const copy = response.clone();
			event.waitUntil(refreshAppShell(cache, copy));
		}
		return response;
	} catch {
		// オフライン時: どのURLで開かれてもアプリシェルを返す
		const cached = await cache.match(APP_ROOT);
		return cached ?? Response.error();
	}
}

// アプリシェルは常に APP_ROOT のキーで保存する
async function refreshAppShell(cache, response) {
	const html = await response.text();
	await cache.put(
		APP_ROOT,
		new Response(html, {
			status: 200,
			statusText: response.statusText,
			headers: response.headers,
		}),
	);
	await pruneStaleAssets(cache, html);
}

async function cacheFirst(request) {
	const cache = await caches.open(CACHE_NAME);
	const cached = await cache.match(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (response.ok) await cache.put(request, response.clone());
	return response;
}

async function staleWhileRevalidate(event, request) {
	const cache = await caches.open(CACHE_NAME);
	const cached = await cache.match(request);

	const update = fetch(request)
		.then(async (response) => {
			if (response.ok) await cache.put(request, response.clone());
			return response;
		})
		.catch(() => undefined);

	if (cached) {
		event.waitUntil(update);
		return cached;
	}
	return (await update) ?? Response.error();
}

// 新しい index.html から参照されていない古い /assets/ をキャッシュから消す
// （デプロイごとにハッシュ付きファイルが増え続けるのを防ぐ）
// 比較はファイル名で行う。ハッシュ付きで一意なので、index.html 内の参照が
// 絶対パスでも相対パスでも安全に判定でき、base のパス解決に依存しない。
function assetFileName(pathOrUrl) {
	const withoutQuery = pathOrUrl.split(/[?#]/)[0];
	return withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
}

async function pruneStaleAssets(cache, html) {
	const referenced = new Set();
	for (const match of html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)) {
		referenced.add(assetFileName(match[1]));
	}
	if (referenced.size === 0) return;

	const keys = await cache.keys();
	await Promise.all(
		keys
			.filter(
				(key) =>
					key.url.includes("/assets/") &&
					!referenced.has(assetFileName(new URL(key.url).pathname)),
			)
			.map((key) => cache.delete(key)),
	);
}
