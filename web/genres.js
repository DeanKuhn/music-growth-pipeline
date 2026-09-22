const DATA = "data/";

async function loadJSON(file) {
	const res = await fetch(DATA + file);
	return res.json();
}

function formatNum(n) {
	return Number(n).toLocaleString();
}

let allGenres = [];

function renderTable() {
	const sortKey = document.getElementById("sort-select").value;

	const sorted = allGenres.slice().sort(function(a, b) {
		return b[sortKey] - a[sortKey];
	});

	const tbody = document.getElementById("genres-body");
	tbody.innerHTML = sorted.map(function(g) {
		return `
			<tr class="border-t border-gray-800 hover:bg-gray-900">
				<td class="py-2 px-3 font-medium">${g.genre}</td>
				<td class="py-2 px-3 text-right">${formatNum(g.artist_count)}</td>
				<td class="py-2 px-3 text-right">${formatNum(Math.round(g.avg_listeners))}</td>
				<td class="py-2 px-3 text-right">${formatNum(g.small_count)}</td>
				<td class="py-2 px-3 text-right">${formatNum(g.large_count)}</td>
				<td class="py-2 px-3 text-right">${g.median_total_pct_growth}%</td>
				<td class="py-2 px-3 text-right">${g.avg_plays_per_listener}</td>
			</tr>
		`;
	}).join("");
}

async function init() {
	allGenres = await loadJSON("genres.json");

	document.getElementById("sort-select").addEventListener("change", renderTable);

	renderTable();
}

init();
