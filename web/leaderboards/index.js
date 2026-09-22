const DATA = "data/";

async function loadJSON(file) {
	const res = await fetch(DATA + file);
	return res.json();
}

function formatNum(n) {
	return Number(n).toLocaleString();
}

const METRIC_LABELS = {
	fastest_growing_pct: "Growth %",
	biggest_listener_gain: "Listener gain",
	most_listeners: "Listeners"
};

let allRows = [];

function renderTable() {
	const sliceType = document.getElementById("type-filter").value;
	const sliceKey = document.getElementById("band-filter").value;

	document.getElementById("metric-header").textContent = METRIC_LABELS[sliceType];

	const filtered = allRows.filter(function(r) {
		return r.slice_type === sliceType && r.slice_key === sliceKey;
	});

	const tbody = document.getElementById("leaderboard-body");
	tbody.innerHTML = filtered.map(function(r) {
		const metric = sliceType === "fastest_growing_pct"
			? r.metric_value + "%"
			: formatNum(r.metric_value);
		return `
			<tr class="border-t border-gray-800 hover:bg-gray-900">
				<td class="py-2 px-3 text-gray-500">${r.rank}</td>
				<td class="py-2 px-3"><a href="/artist?slug=${r.slug}" class="hover:text-sky-500">${r.display_name}</a></td>
				<td class="py-2 px-3">${r.size_band}</td>
				<td class="py-2 px-3">${r.primary_genre || "—"}</td>
				<td class="py-2 px-3 text-right">${formatNum(r.latest_listeners)}</td>
				<td class="py-2 px-3 text-right">${metric}</td>
				<td class="py-2 px-3 text-right">${r.weeks_tracked}</td>
			</tr>
		`;
	}).join("");
}

async function init() {
	allRows = await loadJSON("leaderboards.json");

	document.getElementById("type-filter").addEventListener("change", renderTable);
	document.getElementById("band-filter").addEventListener("change", renderTable);

	renderTable();
}

init();
