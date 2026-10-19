import { saved, sum, day, clock, duration, today } from "./domain.js";
export const tidy = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, " ");
export const timeText = (n) =>
  n >= 60 ? `${Math.floor(n / 60)}時間${n % 60}分（${n}分）` : `${n}分`;
export const span = (s) =>
  `${clock(s.start)}～${day(s.start) !== day(s.end) ? "翌" : ""}${clock(s.end)}${day(s.start) !== day(s.end) ? `（終了 ${day(s.end)}）` : ""}`;
export function exportText(d, from, to, { details = false } = {}) {
  const valid = (date) =>
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  if (!valid(from) || !valid(to) || from > to)
    throw Error("開始日と終了日を確認してください");
  const ss = saved(d)
    .filter((s) => day(s.start) >= from && day(s.start) <= to)
    .sort((a, b) => a.start - b.start);
  const lines = [
    "英語学習記録",
    `期間：${from} ～ ${to}（両日を含む）`,
    "",
    `合計：${timeText(sum(ss))}`,
    `学習日数：${new Set(ss.map((s) => day(s.start))).size}日　記録：${ss.length}件`,
  ];
  if (!ss.length) lines.push("", "この期間の記録はありません。");
  else {
    lines.push("", "【教材別】");
    for (const m of d.materials) {
      const xs = ss.filter((s) => s.material === m.id);
      if (xs.length) lines.push(`${tidy(m.name)}：${timeText(sum(xs))}`);
    }
    lines.push("", "【Phase別】");
    for (const p of d.phases) {
      const xs = ss.filter((s) => s.phase === p.id);
      if (xs.length) lines.push(`${tidy(p.name)}：${timeText(sum(xs))}`);
    }
    lines.push("", "【日別】");
    for (const date of [...new Set(ss.map((s) => day(s.start)))]) {
      const ds = ss.filter((s) => day(s.start) === date);
      lines.push("", `${date}　${timeText(sum(ds))}`);
      const groups = new Map();
      for (const s of ds) {
        const key = JSON.stringify([s.material, s.phase]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      }
      for (const xs of groups.values()) {
        const s = xs[0];
        lines.push(
          `  ${tidy(d.materials.find((m) => m.id === s.material).name)} / ${tidy(d.phases.find((p) => p.id === s.phase).name)}：${timeText(sum(xs))}`,
        );
      }
      if (details)
        for (const s of ds) {
          const pause = s.pauses.reduce((n, p) => n + p.end - p.start, 0);
          lines.push(
            `  ${span(s)}　${tidy(d.materials.find((m) => m.id === s.material).name)} / ${tidy(d.phases.find((p) => p.id === s.phase).name)}　${timeText(duration(s))}${pause ? "（一時停止 " + pause + "分を除く）" : ""}`,
          );
        }
    }
  }
  lines.push(
    "",
    "日本時間・保存済み記録のみ。日付をまたぐ学習は開始日に集計。",
    "閲覧用TXT。復元にはJSONバックアップを使用してください。",
  );
  return "\uFEFF" + lines.join("\r\n");
}
export function exportRange(d) {
  const dates = saved(d)
    .map((s) => day(s.start))
    .sort();
  return { from: dates[0] ?? today(), to: dates.at(-1) ?? today() };
}
