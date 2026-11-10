const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 12, 14:05" (local time) */
export function formatDateTime(d: string | Date | null | undefined): string {
	if (!d) return "—";
	const x = new Date(d);
	return `${MONTHS[x.getMonth()]} ${x.getDate()}, ${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function formatDate(d: string | Date | null | undefined): string {
	if (!d) return "—";
	const x = new Date(d);
	return `${MONTHS[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
}

export function formatExact(d: string | Date | null | undefined): string {
	if (!d) return "—";
	const x = new Date(d);
	return `${x.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · ${x.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

/** "3 min ago", "in 2 h" */
export function relativeTime(d: string | Date | null | undefined, now = Date.now()): string {
	if (!d) return "—";
	const diff = new Date(d).getTime() - now;
	const abs = Math.abs(diff);
	const fut = diff > 0;
	const fmt = (v: number, u: string) => (fut ? `in ${v} ${u}` : `${v} ${u} ago`);
	if (abs < 45_000) return fut ? "in a moment" : "just now";
	if (abs < 3_600_000) return fmt(Math.round(abs / 60_000), "min");
	if (abs < 86_400_000) return fmt(Math.round(abs / 3_600_000), "h");
	return fmt(Math.round(abs / 86_400_000), abs < 2 * 86_400_000 ? "day" : "days");
}

/** "2d 4h left" / "5h 10m left" / "overdue" */
export function timeLeft(d: string | Date | null | undefined, now = Date.now()): { text: string; hours: number } | null {
	if (!d) return null;
	const ms = new Date(d).getTime() - now;
	const hours = ms / 3_600_000;
	if (ms <= 0) return { text: "Overdue", hours };
	const days = Math.floor(ms / 86_400_000);
	const h = Math.floor((ms % 86_400_000) / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	return { text: days > 0 ? `${days}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`, hours };
}

export function formatDuration(secs: number | null | undefined): string {
	if (secs == null) return "—";
	if (secs < 90) return `${Math.round(secs)} s`;
	if (secs < 5400) return `${Math.round(secs / 60)} min`;
	if (secs < 172_800) return `${Math.round(secs / 3600)} h`;
	return `${Math.round(secs / 86400)} days`;
}

export function shortId(id: string | null | undefined, n = 10): string {
	if (!id) return "—";
	return id.length > n ? `${id.slice(0, n)}…` : id;
}

export function greeting(d = new Date()): string {
	const h = d.getHours();
	return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
