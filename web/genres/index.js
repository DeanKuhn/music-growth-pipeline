const DATA = "/data/";

async function loadJSON(file) {
	const res = await fetch(DATA + file);
	return res.json();
}

function formatNum(n) {
	return Number(n).toLocaleString();
}

let allGenres = [];

// On mobile, only median growth and the sorted column are shown.
function mobileClass(key, sortKey) {
	return key === sortKey || key === "median_total_pct_growth" ? "" : "hidden sm:table-cell";
}

function renderTable() {
	const sortKey = document.getElementById("sort-select").value;

	document.querySelectorAll("th[data-key]").forEach(function(th) {
		const hide = mobileClass(th.dataset.key, sortKey) !== "";
		th.classList.toggle("hidden", hide);
		th.classList.toggle("sm:table-cell", hide);
	});

	const sorted = allGenres.slice().sort(function(a, b) {
		return b[sortKey] - a[sortKey];
	});

	const tbody = document.getElementById("genres-body");
	tbody.innerHTML = sorted.map(function(g) {
		return `
			<tr class="border-t border-gray-800 hover:bg-gray-900">
				<td class="py-2 px-3 font-medium">${g.genre}</td>
				<td class="py-2 px-3 text-right ${mobileClass("artist_count", sortKey)}">${formatNum(g.artist_count)}</td>
				<td class="py-2 px-3 text-right ${mobileClass("avg_listeners", sortKey)}">${formatNum(Math.round(g.avg_listeners))}</td>
				<td class="py-2 px-3 text-right ${mobileClass("small_count", sortKey)}">${formatNum(g.small_count)}</td>
				<td class="py-2 px-3 text-right ${mobileClass("large_count", sortKey)}">${formatNum(g.large_count)}</td>
				<td class="py-2 px-3 text-right ${mobileClass("median_total_pct_growth", sortKey)}">${g.median_total_pct_growth}%</td>
				<td class="py-2 px-3 text-right ${mobileClass("avg_plays_per_listener", sortKey)}">${g.avg_plays_per_listener}</td>
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
