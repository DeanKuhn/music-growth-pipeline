const DATA = "/data/";

async function loadJSON(file) {
	const res = await fetch(DATA + file);
	return res.json();
}

function formatNum(n) {
	return Number(n).toLocaleString();
}

// "2026-05-10" -> "May 10". T00:00 keeps it local time so the day doesn't shift.
function shortDate(iso) {
	return new Date(iso + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getSlug() {
	const params = new URLSearchParams(window.location.search);
	return params.get("slug");
}

function renderHeader(artist) {
	const el = document.getElementById("artist-header");
	const rank = artist.global_rank
		? `<span class="text-sm text-gray-400 ml-3">#${artist.global_rank} on charts</span>`
		: "";
	el.innerHTML = `
		<h1 class="text-3xl font-bold break-words">${artist.display_name}${rank}</h1>
		<div class="mt-2 flex gap-3 text-sm">
			<span class="bg-gray-800 rounded px-2 py-1">${artist.size_band}</span>
			${artist.primary_genre ? `<span class="bg-gray-800 rounded px-2 py-1">${artist.primary_genre}</span>` : ""}
		</div>
	`;
}

function renderPercentile(artist) {
	const el = document.getElementById("artist-percentile");
	const pct = Math.round(artist.pct_rank_in_size_band * 100);
	el.textContent = `Among ${artist.size_band} artists, ${artist.display_name} grew faster than ${pct}% of its peers.`;
}

function renderStats(artist) {
	const el = document.getElementById("artist-stats");
	el.innerHTML = `
		<div class="border border-gray-800 rounded-lg p-4 text-center">
			<div class="text-3xl font-bold">${formatNum(artist.latest_listeners)}</div>
			<div class="text-sm text-gray-400 mt-1">Listeners</div>
		</div>
		<div class="border border-gray-800 rounded-lg p-4 text-center">
			<div class="text-3xl font-bold text-sky-500">${artist.total_pct_growth}%</div>
			<div class="text-sm text-gray-400 mt-1">Total growth</div>
		</div>
		<div class="border border-gray-800 rounded-lg p-4 text-center">
			<div class="text-3xl font-bold">${artist.weeks_tracked}</div>
			<div class="text-sm text-gray-400 mt-1">Weeks tracked</div>
		</div>
		<div class="border border-gray-800 rounded-lg p-4 text-center">
			<div class="text-3xl font-bold">${artist.avg_weekly_pct_change}%</div>
			<div class="text-sm text-gray-400 mt-1">Avg weekly change</div>
		</div>
	`;
}

function renderChart(artist) {
	const ts = artist.timeseries;
	const labels = ts.map(function(r) { return r.snapshot_date; });
	const values = ts.map(function(r) { return r.listeners; });

	new Chart(document.getElementById("artist-chart"), {
		type: "line",
		data: {
			labels: labels,
			datasets: [{
				label: "Listeners",
				data: values,
				borderColor: "#0ea5e9",
				backgroundColor: "rgba(14, 165, 233, 0.1)",
				fill: true,
				tension: 0.3,
				pointRadius: 3
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false }
			},
			scales: {
				y: {
					ticks: {
						color: "#9ca3af",
						callback: function(v) { return formatNum(v); }
					},
					grid: { color: "rgba(255,255,255,0.06)" }
				},
				x: {
					ticks: {
						color: "#9ca3af",
						maxRotation: 0,
						maxTicksLimit: 6,
						autoSkipPadding: 16,
						callback: function(v) { return shortDate(this.getLabelForValue(v)); }
					},
					grid: { color: "rgba(255,255,255,0.06)" }
				}
			}
		}
	});
}

function renderSimilar(artist) {
	if (!artist.similar || artist.similar.length === 0) return;

	const section = document.getElementById("similar-section");
	section.classList.remove("hidden");

	const rows = artist.similar.map(function(s) {
		const delta = (s.total_pct_growth - artist.total_pct_growth).toFixed(2);
		const sign = delta >= 0 ? "+" : "";
		const signColor = delta >= 0 ? "text-green-400" : "text-red-400";
		return `
			<tr class="border-t border-gray-800">
				<td class="py-2 px-3"><a href="/artist?slug=${s.slug}" class="hover:text-sky-500">${s.display_name}</a></td>
				<td class="py-2 px-3 text-right hidden sm:table-cell">${formatNum(s.latest_listeners)}</td>
				<td class="py-2 px-3 text-right hidden sm:table-cell">${s.total_pct_growth}%</td>
				<td class="py-2 px-3 text-right ${signColor}">${sign}${delta}%</td>
			</tr>
		`;
	}).join("");

	section.innerHTML = `
		<h2 class="text-xl font-semibold mb-4">Similar artists</h2>
		<div class="overflow-x-auto">
		<table class="w-full text-sm whitespace-nowrap">
			<thead>
				<tr class="text-left text-gray-400">
					<th class="py-2 px-3">Artist</th>
					<th class="py-2 px-3 text-right hidden sm:table-cell">Listeners</th>
					<th class="py-2 px-3 text-right hidden sm:table-cell">Total growth</th>
					<th class="py-2 px-3 text-right">vs. ${artist.display_name}</th>
				</tr>
			</thead>
			<tbody>${rows}</tbody>
		</table>
		</div>
	`;
}

async function init() {
	const slug = getSlug();
	if (!slug) {
		document.querySelector("main").innerHTML = '<p class="text-gray-400">No artist selected.</p>';
		return;
	}

	const artist = await loadJSON("artists/" + slug + ".json");
	document.title = artist.display_name + " — deanslist.dev";

	renderHeader(artist);
	renderPercentile(artist);
	renderStats(artist);
	renderChart(artist);
	renderSimilar(artist);
}

init();
