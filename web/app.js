const DATA = "data/";

async function loadJSON(file) {
	const res = await fetch(DATA + file);
	return res.json();
}

function formatNum(n) {
	return Number(n).toLocaleString();
}

// --- Search ---

let searchIndex = [];

async function initSearch() {
	searchIndex = await loadJSON("search_index.json");
	document.getElementById("search").addEventListener("input", function(e) {
		onSearchInput(e.target.value)
	});
}

function onSearchInput(text) {
	const box = document.getElementById("search-results");
	if (!text) {
		box.classList.add("hidden");
		return;
	}
	const query = text.toLowerCase();
	const matches = searchIndex.filter(function(artist) {
		return artist.display_name.toLowerCase().includes(query);
	});
	renderSearchResults(matches);
}

function renderSearchResults(matches) {
	const box = document.getElementById("search-results");
	box.innerHTML = matches.slice(0, 8).map(function(a) {
		return `<a href="/artist?slug=${a.slug}"
		class="block px-4 py-2 hover:bg-gray-800 text-gray-100">${a.display_name}
		<span class="text-gray-500 text-sm">&emsp;&emsp;${formatNum(a.latest_listeners)}
		listeners</span></a>`;
	}).join("");
	box.classList.remove("hidden");
}

// --- Stats ---

async function initStats() {
	const health = await loadJSON("health.json");
	const stats = document.getElementById("stats");
	stats.innerHTML = `
		<div class="border border-gray-800 rounded-lg p-4 text-center">
			<div class="text-3xl font-bold text-sky-500">${formatNum(health.artists_total)}</div>
			<div class="text-sm text-gray-400 mt-1">Artists tracked</div>
		</div>
		<div class="border border-gray-800 rounded-lg p-4 text-center">
			<div class="text-4xl font-bold">${health.weeks_in_series}</div>
			<div class="text-sm text-gray-400 mt-1">Weeks of data</div>
		</div>
		<div class="border border-gray-800 rounded-lg p-4 text-center">
			<div class="text-4xl font-bold">${health.genres_total}</div>
			<div class="text-sm text-gray-400 mt-1">Genres</div>
		</div>
		<div class="border border-gray-800 rounded-lg p-4 text-center">
			<div class="text-2xl font-bold">${health.latest_snapshot_date}</div>
			<div class="text-sm text-gray-400 mt-1">Latest snapshot</div>
		</div>
	`;
}

// --- Boot ---

initSearch();
initStats();
