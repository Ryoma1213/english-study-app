import { saved, sum, day, clock, reach, duration, today } from "./domain.js";
export const tidy = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, " ");
export const timeText = (n) =>
  n >= 60 ? `${Math.floor(n / 60)}時間${n % 60}分（${n}分）` : `${n}分`;
export const span = (s) =>
  `${clock(s.start)}～${day(s.start) !== day(s.end) ? "翌" : ""}${clock(s.end)}${day(s.start) !== day(s.end) ? `（終了 ${day(s.end)}）` : ""}`;
export function progressText(d, s) {
  const a = d.attempts.find((a) => a.id === s.attempt);
  return s.progress === "recorded"
    ? `到達ページ：P.${s.page}／${a.total}`
    : s.progress === "no_change"
      ? "ページ進捗なし"
      : s.progress === "unrecorded"
        ? "進捗未記録"
        : "時間のみ・ページ管理なし";
}
export function exportText(d, from, to) {
  const all = saved(d),
    ss = all
      .filter((s) => day(s.start) >= from && day(s.start) <= to)
      .sort((a, b) => a.start - b.start),
    lines = [
      "英語学習記録",
      `出力日時：${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
      `対象期間：${from} ～ ${to}`,
      "時刻：日本時間。日付またぎの全時間は開始日に集計。",
      "保存済み記録だけを対象とし、学習中・一時停止中・終了入力待ちは含みません。",
      "時間・学習日数は対象期間内。進捗は期間終了時点の記録値。引継ページは新たな学習量ではありません。",
      "閲覧用TXTです。全データの復元にはJSONバックアップを使用してください。",
      "",
      "【全体概要】",
      `総学習時間：${timeText(sum(ss))}`,
      `学習日数：${new Set(ss.map((s) => day(s.start))).size}日`,
      `保存済みセッション数：${ss.length}件`,
    ];
  const position = (p, a) => {
    const b = d.boundaries.find((b) => b.phase === p && b.attempt === a.id),
      before = all
        .filter(
          (s) =>
            s.phase === p &&
            s.attempt === a.id &&
            s.progress === "recorded" &&
            day(s.start) <= to,
        )
        .sort((x, y) => x.start - y.start);
    const last = before.at(-1);
    const carry = b && day(b.at) <= to ? b.carry : 0;
    const page = Math.max(carry ?? 0, ...before.map((s) => s.page));
    return `引継：P.${carry ?? 0} → ${page ? `到達ページ：P.${page}／${a.total}` : "到達ページ未記録（率 —）"}${last ? `（最終ページ記録 ${day(last.start)}）` : ""}`;
  };
  if (!ss.length) lines.push("この期間の記録はありません");
  lines.push("", "【Phase別実績】");
  for (const p of d.phases) {
    const ps = ss.filter((s) => s.phase === p.id);
    if (!ps.length) continue;
    lines.push("", `${tidy(p.name)}：${timeText(sum(ps))}`);
    for (const a of d.attempts) {
      const part = ps.filter((s) => s.attempt === a.id);
      if (!part.length) continue;
      lines.push(
        `${tidy(d.materials.find((m) => m.id === a.material).name)}${a.total === null ? "" : `・${a.number}回目`}：${timeText(sum(part))}`,
      );
      if (a.total !== null) lines.push(position(p.id, a));
    }
  }
  lines.push("", "【教材別実績】");
  for (const m of d.materials) {
    const ms = ss.filter((s) => s.material === m.id);
    if (!ms.length) continue;
    lines.push("", `${tidy(m.name)}：${timeText(sum(ms))}`);
    for (const a of d.attempts.filter((a) => a.material === m.id)) {
      const as = ms.filter((s) => s.attempt === a.id);
      if (!as.length) continue;
      lines.push(
        `${a.total === null ? "時間のみ" : `${a.number}回目`}：${timeText(sum(as))}`,
      );
      if (a.total !== null)
        for (const p of d.phases.filter((p) =>
          as.some((s) => s.phase === p.id),
        ))
          lines.push(`${tidy(p.name)}：${position(p.id, a)}`);
    }
  }
  lines.push("", "【日別詳細】");
  for (const date of [...new Set(ss.map((s) => day(s.start)))]) {
    const ds = ss.filter((s) => day(s.start) === date);
    lines.push("", `${date}：${timeText(sum(ds))}`);
    for (const s of ds)
      lines.push(
        `${tidy(d.phases.find((p) => p.id === s.phase).name)}／${tidy(d.materials.find((m) => m.id === s.material).name)}`,
        `${span(s)}　実学習 ${timeText(duration(s))}　一時停止 ${s.pauses.reduce((n, p) => n + p.end - p.start, 0)}分`,
        progressText(d, s),
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
