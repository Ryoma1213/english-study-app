import { saved, sum, day, clock, duration, today } from "./domain.js";
export const tidy = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, " ");
export const timeText = (n) =>
  n >= 60 ? `${Math.floor(n / 60)}時間${n % 60}分（${n}分）` : `${n}分`;
export const span = (s) =>
  `${clock(s.start)}～${day(s.start) !== day(s.end) ? "翌" : ""}${clock(s.end)}${day(s.start) !== day(s.end) ? `（終了 ${day(s.end)}）` : ""}`;
export function exportText(d, from, to) {
  const ss = saved(d)
    .filter((s) => day(s.start) >= from && day(s.start) <= to)
    .sort((a, b) => a.start - b.start);
  const lines = [
    "英語学習記録",
    `出力日時：${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    `対象期間：${from} ～ ${to}`,
    "時刻：日本時間。日付またぎの全時間は開始日に集計。",
    "保存済み記録だけを対象とし、学習中・一時停止中・終了保存待ちは含みません。",
    "閲覧用TXTです。全データの復元にはJSONバックアップを使用してください。",
    "",
    "【全体概要】",
    `総学習時間：${timeText(sum(ss))}`,
    `学習日数：${new Set(ss.map((s) => day(s.start))).size}日`,
    `保存済みセッション数：${ss.length}件`,
  ];
  if (!ss.length) lines.push("この期間の記録はありません");
  lines.push("", "【Phase別実績】");
  for (const p of d.phases) {
    const ps = ss.filter((s) => s.phase === p.id);
    if (!ps.length) continue;
    lines.push("", `${tidy(p.name)}：${timeText(sum(ps))}`);
    for (const m of d.materials) {
      const ms = ps.filter((s) => s.material === m.id);
      if (ms.length) lines.push(`${tidy(m.name)}：${timeText(sum(ms))}`);
    }
  }
  lines.push("", "【教材別実績】");
  for (const m of d.materials) {
    const ms = ss.filter((s) => s.material === m.id);
    if (ms.length)
      lines.push(
        "",
        `${tidy(m.name)}：${timeText(sum(ms))}・${new Set(ms.map((s) => day(s.start))).size}日`,
      );
  }
  lines.push("", "【日別詳細】");
  for (const date of [...new Set(ss.map((s) => day(s.start)))]) {
    const ds = ss.filter((s) => day(s.start) === date);
    lines.push("", `${date}：${timeText(sum(ds))}`);
    for (const s of ds)
      lines.push(
        `${tidy(d.phases.find((p) => p.id === s.phase).name)}／${tidy(d.materials.find((m) => m.id === s.material).name)}`,
        `${span(s)}　実学習 ${timeText(duration(s))}　一時停止 ${s.pauses.reduce((n, p) => n + p.end - p.start, 0)}分`,
        "",
      );
  }
  return "\uFEFF" + lines.join("\r\n");
}
export function exportRange(d) {
  const dates = saved(d)
    .map((s) => day(s.start))
    .sort();
  return { from: dates[0] ?? today(), to: dates.at(-1) ?? today() };
}
