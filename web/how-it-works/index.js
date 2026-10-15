const DATA = "/data/";

async function loadJSON(file) {
	const res = await fetch(DATA + file);
	return res.json();
}

// 28736 -> "29k", 1500000 -> "1.5M"
function formatK(n) {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
	if (n >= 1_000) return Math.round(n / 1_000) + "k";
	return Number(n).toLocaleString();
}

// --- Quintile chart ---

async function initQuintileChart() {
	const rows = await loadJSON("growth_by_quintile.json");
	// Bars scale to the largest p90 so the tail always fits.
	const max = Math.max(...rows.map(function(r) { return r.p90_pct_growth; }));
	const labels = { 1: "Q1 (smallest)", 5: "Q5 (largest)" };

	document.getElementById("quintile-chart").innerHTML = rows.map(function(r) {
		return `
		<div class="grid grid-cols-[7rem_1fr_3.5rem] gap-3 items-center">
			<div>
				<div class="text-gray-200">${labels[r.size_quintile] || "Q" + r.size_quintile}</div>
				<div class="text-xs text-gray-500">${formatK(r.band_min)}–${formatK(r.band_max)}</div>
			</div>
			<div class="relative h-5 bg-gray-800 rounded">
				<div class="absolute inset-y-0 left-0 bg-sky-500/30 rounded" style="width: ${r.p90_pct_growth / max * 100}%"></div>
				<div class="absolute inset-y-0 left-0 bg-sky-500 rounded" style="width: ${r.median_pct_growth / max * 100}%"></div>
			</div>
			<div class="text-right text-gray-200">${r.median_pct_growth}%</div>
		</div>`;
	}).join("");

	const r = rows[0];
	document.getElementById("quintile-caption").textContent =
		`Listener growth from ${r.window_start} to ${r.window_end} (${r.n_weeks} weekly snapshots), every artist measured over the same weeks.`;
}

// --- Redaction count ---

// Redacted artists are excluded from search, so the gap is the redaction count.
async function initRedactedCount() {
	const health = await loadJSON("health.json");
	document.getElementById("redacted-count").textContent =
		Number(health.artists_total - health.artists_searchable).toLocaleString();
}

initQuintileChart();
initRedactedCount();
