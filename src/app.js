function icon(name) {
  const paths = {
    home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
    history: "M5 5h14v16H5ZM8 2v6m8-6v6M5 10h14M8 13h2m4 0h2m-8 4h2",
    analytics: "M4 20V10m8 10V4m8 16v-7M2 22h20",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.5 5.5 7 7m10 10 1.5 1.5M5.5 18.5 7 17m10-10 1.5-1.5",
    clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.home}"/></svg>`;
}
for (const b of document.querySelectorAll("[data-nav]"))
  b.innerHTML = icon(b.dataset.nav) + "<span>" + b.textContent + "</span>";

import * as D from "./domain.js";
import * as DB from "./db.js";
import { exportText, exportRange, timeText, span } from "./export.js";
const $ = (s) => document.querySelector(s),
  root = $("#app");
let db,
  data,
  view = "home",
  busy = false,
  editing = false,
  selected = D.today(),
  month = selected.slice(0, 7),
  nextMaterial = null,
  retry = null,
  updateRegistration;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (text, action, id = "", cls = "") =>
  `<button class="${cls}" data-action="${action}" data-id="${esc(id)}">${esc(text)}</button>`;
const field = (label, name, value = "", type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const mat = (id) => data.materials.find((m) => m.id === id),
  phase = (id) => data.phases.find((p) => p.id === id);
const status = (p) =>
  ({ future: "未開始", current: "現在", past: "終了" })[p.status];
const tell = (t) => {
  $("#notice").textContent = t;
  setTimeout(() => {
    if ($("#notice").textContent === t) $("#notice").textContent = "";
  }, 6000);
};
const err = (e) => {
  let target = $(".form-error") ?? $(".operation-error");
  if (!target) {
    target = document.createElement("p");
    target.className = "operation-error error";
    target.setAttribute("role", "alert");
    root.append(target);
  }
  target.textContent = e.message ?? String(e);
};
async function refresh() {
  try {
    const fresh = await DB.read(db);
    if (busy) return;
    if (editing || $("#dialog").open) {
      if (fresh.revision !== data.revision)
        tell(
          "別の画面で変更されました。入力は保持しています。保存時に最新状態を確認します。",
        );
      return;
    }
    if (fresh.revision >= data.revision) {
      data = fresh;
      render();
    }
  } catch (e) {
    err(e);
  }
}
async function run(
  c,
  after = () => render(),
  op = D.uid(),
  expected = data.revision,
) {
  if (busy) return false;
  busy = true;
  try {
    data = await DB.commit(db, { ...c, timeOnly: true }, expected, op);
    retry = null;
    channel?.postMessage("changed");
    after();
    return true;
  } catch (e) {
    retry = { c, op, expected, after };
    if (e.message.includes("別の画面")) {
      data = await DB.read(db);
      retry.expected = data.revision;
    }
    err(e);
    if (!document.querySelector("[data-action=retry]"))
      root.insertAdjacentHTML(
        "beforeend",
        button("失敗した操作を再試行", "retry"),
      );
    const retryButton = root.querySelector("[data-action=retry]");
    retryButton?.scrollIntoView({ block: "center" });
    return false;
  } finally {
    busy = false;
  }
}
let channel;
try {
  channel = new BroadcastChannel("english-study-changes");
  channel.onmessage = () => refresh();
} catch {}
function modal(title, content, choices) {
  const el = $("#dialog");
  el.innerHTML = `<h2>${esc(title)}</h2>${content}<div class="actions">${choices.map((x, i) => `<button data-choice="${i}" ${x.value === false || x.value === null ? "autofocus" : ""} class="${i === 0 ? "primary" : ""}">${esc(x.label)}</button>`).join("")}</div>`;
  el.showModal();
  return new Promise((resolve) => {
    el.onclick = (e) => {
      const b = e.target.closest("[data-choice]");
      if (b) {
        el.close();
        resolve(choices[Number(b.dataset.choice)].value);
      }
    };
    el.oncancel = () => resolve(null);
  });
}

function render() {
  editing = false;
  root.className = "";
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) =>
      b.setAttribute("aria-current", b.dataset.nav === view ? "page" : "false"),
    );
  ({ home, history, analytics, settings })[view]();
  syncSelectPreviews();
}
function home() {
  const now = D.minute(),
    today = D.day(now),
    ss = D.saved(data).filter((s) => D.day(s.start) === today),
    s = D.active(data);
  const total =
    D.sum(ss) +
    (s && D.day(s.start) === today ? Math.max(0, D.duration(s, now)) : 0);
  root.innerHTML = `<p class="eyebrow">${esc(new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" }))}</p><section class="today-summary"><span class="summary-mark" aria-hidden="true">${icon("clock")}</span><h1>今日の学習</h1><div class="big" id="today-time">${total}<small> 分</small></div><p class="muted">今日開始したすべてのPhaseの記録${s && D.day(s.start) === today ? `・${s.state === "ending" ? "未保存を含む" : "学習中を含む"}` : ""}</p></section>${s ? `<section class="card current"><span class="tag"><span class="status-dot" aria-hidden="true"></span>${{ running: "学習中", paused: "一時停止中", ending: "終了・保存待ち" }[s.state]}</span><h2>${esc(mat(s.material).name)}</h2><p class="muted">開始 ${D.clock(s.start)}${D.day(s.start) !== today ? `（${D.day(s.start)}）` : ""}</p><p class="big" id="elapsed">${Math.max(0, D.duration(s))}<small> 分</small></p><div class="row">${s.state === "ending" ? button("記録を保存する", "finish", s.id, "primary") : s.state === "paused" ? button("再開", "resume", s.id, "primary") + button("終了", "end", s.id) : button("終了", "end", s.id, "primary")}${button("…", "sessionMenu", s.id, "menu")}</div></section>` : ""}<div class="section-title"><div><p class="eyebrow">現在のPhase</p><h2>${data.current ? esc(phase(data.current).name) : "学習の準備"}</h2></div></div>${
    !data.current
      ? `<section class="card empty-state"><p>Phaseと教材を登録して、学習を始めましょう。</p>${button("設定へ", "settings", "", "primary")}</section>`
      : data.materials
          .filter((m) => m.phases.includes(data.current))
          .map(
            (m) =>
              `<section class="card material-card"><h2>${esc(m.name)}</h2><div class="material-footer"><p class="muted">今日 <strong>${D.sum(ss.filter((s) => s.material === m.id && s.phase === data.current))}</strong>分<span class="scope-label">このPhaseの記録</span></p><div class="row">${s?.material === m.id ? "" : button("開始", "start", m.id, "primary")}${button("…", "materialMenu", m.id, "menu")}</div></div></section>`,
          )
          .join("") ||
        `<section class="card empty-state"><p>教材を登録すると、ここからすぐに開始できます。</p>${button("教材を追加", "material", "", "primary")}</section>`
  }${retry ? button("失敗した操作を再試行", "retry") : ""}`;
}
async function start(id) {
  const s = D.active(data);
  if (s) {
    if (s.state === "ending") {
      finish(s.id);
      return;
    }
    const yes = await modal(
      "教材を切り替える",
      `<p>${esc(mat(s.material).name)}を終了・記録してから${esc(mat(id).name)}を開始しますか？</p>`,
      [
        { label: "終了・記録へ", value: true },
        { label: "キャンセル", value: false },
      ],
    );
    if (yes) {
      nextMaterial = id;
      await run({ type: "end", id: s.id, at: D.minute() }, () => finish(s.id));
    }
    return;
  }
  await run({ type: "start", id, sessionId: D.uid(), at: D.minute() });
}
function finish(id) {
  const s = data.sessions.find((s) => s.id === id);
  if (!s || s.state !== "ending") {
    render();
    return;
  }
  editing = true;
  root.className = "editing";
  root.innerHTML = `${button("ホームへ戻る", "back")}<p class="tag">終了・保存待ち</p><h1>${esc(mat(s.material).name)}</h1><p class="big">${D.duration(s)}<small> 分</small></p><p>${span(s)}</p><form id="finish-form"><p class="muted">学習時間を確認して保存してください。</p><p class="form-error error" role="alert"></p><div class="savebar"><button type="submit" class="primary">保存</button></div></form>${button("時刻・停止区間を修正", "edit", s.id)}`;
  const form = $("#finish-form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    form.querySelector("button[type=submit]").disabled = true;
    const ok = await run({ type: "save", id }, () => {
      editing = false;
      view = "home";
      render();
      tell("記録を保存しました");
    });
    if (!ok) form.querySelector("button[type=submit]").disabled = false;
    else if (nextMaterial) {
      const next = nextMaterial;
      nextMaterial = null;
      await start(next);
    }
  };
}
function history() {
  const ss = D.saved(data),
    monthSessions = ss.filter((s) => D.day(s.start).startsWith(month));
  const [year, mon] = month.split("-").map(Number),
    last = new Date(Date.UTC(year, mon, 0)).getUTCDate(),
    first = new Date(month + "-01").getUTCDay();
  const ds = ss.filter((s) => D.day(s.start) === selected),
    st = D.streak(data);
  root.innerHTML = `<div class="page-title"><div><p class="eyebrow">学習の履歴</p><h1>記録</h1></div>${button("… 記録を追加", "historyMenu", "", "quiet")}</div><p class="muted help-text">記録し忘れた学習はここから追加できます。保存した記録は、日付を選んで「編集・削除」から変更できます。</p><div class="stats-grid"><div class="stat-tile"><span>表示月の学習日数</span><strong>${new Set(monthSessions.map((s) => D.day(s.start))).size}<small> 日</small></strong></div><div class="stat-tile"><span>${st.yesterday ? "昨日までの連続学習" : "連続学習"}</span><strong>${st.count}<small> 日</small></strong></div></div><section class="calendar-panel"><div class="month-toolbar">${button("前月", "prevMonth", "", "quiet")}<h2>${year}年${mon}月</h2>${button("翌月", "nextMonth", "", "quiet")}</div><div class="calendar">${["日", "月", "火", "水", "木", "金", "土"].map((d) => `<span class="weekday">${d}</span>`).join("")}${"<span></span>".repeat(first)}${Array.from(
    { length: last },
    (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`,
        sessions = ss.filter((s) => D.day(s.start) === date);
      return `<button data-action="date" data-id="${date}" class="${date === selected ? "selected" : ""} ${sessions.length ? "has" : ""} ${date === D.today() ? "is-today" : ""}" aria-label="${date} ${D.sum(sessions)}分${sessions.length ? " 学習記録あり" : ""}" aria-pressed="${date === selected}"><span>${i + 1}</span><small>${sessions.length ? `${D.sum(sessions)}分` : "—"}</small></button>`;
    },
  ).join(
    "",
  )}</div><div class="calendar-bottom">${button("今日に戻る", "today", "", "quiet")}</div></section><div class="section-title"><h2>${selected}</h2><span class="tag">${timeText(D.sum(ds))}</span></div>${ds.length ? `<p class="muted">学習時間帯 ${span({ start: Math.min(...ds.map((s) => s.start)), end: Math.max(...ds.map((s) => s.end)) })}</p>` : '<section class="card empty-state"><p>この日の記録はありません</p><p class="muted">記録し忘れた場合は、上の「記録を追加」から登録できます。</p></section>'}${data.materials
    .map((m) => {
      const ms = ds.filter((s) => s.material === m.id);
      return !ms.length
        ? ""
        : `<section class="card history-card"><div class="record-material-heading"><h3>${esc(m.name)}</h3><span class="tag">合計 ${D.sum(ms)}分</span></div>${ms
            .sort((a, b) => a.start - b.start)
            .map(
              (s) =>
                `<article class="session-item"><div class="session-heading"><p class="session-time">${span(s)}</p><strong>${D.duration(s)}<small> 分</small></strong></div><p class="muted">${esc(phase(s.phase).name)}</p>${button("… 編集・削除", "sessionMenu", s.id, "quiet")}</article>`,
            )
            .join("")}</section>`;
    })
    .join("")}`;
}
let analyticsFrom,
  analyticsTo,
  group = "day",
  analysisPhase;
function weekStart(date) {
  const d = new Date(date),
    offset = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - offset * 86400000).toISOString().slice(0, 10);
}
function analytics() {
  analyticsFrom ??= weekStart(D.today());
  analyticsTo ??= D.today();
  const ss = D.saved(data).filter(
      (s) => D.day(s.start) >= analyticsFrom && D.day(s.start) <= analyticsTo,
    ),
    avg = D.average(data, analyticsFrom, analyticsTo),
    bars = new Map();
  for (
    let t = Date.parse(analyticsFrom);
    t <= Math.min(Date.parse(analyticsTo), Date.parse(D.today()));
    t += 86400000
  ) {
    const date = new Date(t).toISOString().slice(0, 10),
      key = group === "week" ? weekStart(date) : date;
    bars.set(key, 0);
  }
  for (const s of ss) {
    const key = group === "week" ? weekStart(D.day(s.start)) : D.day(s.start);
    if (bars.has(key)) bars.set(key, bars.get(key) + D.duration(s));
  }
  root.innerHTML = `<div class="page-title"><div><p class="eyebrow">学習を振り返る</p><h1>分析</h1></div></div><div class="period-controls">${button("今週", "thisWeek", "", "quiet")}${button("今月", "thisMonth", "", "quiet")}</div><details class="card period-editor"><summary>期間・表示方法を選ぶ<span class="scope-label">${analyticsFrom} ～ ${analyticsTo}・${group === "week" ? "週別" : "日別"}</span></summary><form id="range-form"><div class="form-grid">${field("開始日", "from", analyticsFrom, "date")}${field("終了日", "to", analyticsTo, "date")}</div><label for="chart-group">集計単位</label><select id="chart-group" name="group"><option value="day" ${group === "day" ? "selected" : ""}>日別</option><option value="week" ${group === "week" ? "selected" : ""}>週別（合計）</option></select><button class="primary">期間を表示</button><p class="form-error error" role="alert"></p></form></details><div class="stats-grid"><div class="stat-tile"><span>学習時間の合計</span><strong>${D.sum(ss)}<small> 分</small></strong><span>${new Set(ss.map((s) => D.day(s.start))).size}日学習</span></div><div class="stat-tile"><span>1日平均</span><strong>${avg.value === null ? "—" : Math.round(avg.value * 10) / 10}<small>${avg.value === null ? "" : " 分"}</small></strong><span>${avg.days}日間・未学習日を含む</span></div></div><p class="muted average-range">平均の対象：${avg.days ? `${avg.from} ～ ${avg.to}` : "まだ記録がありません"}</p>${ss.length ? "" : '<p class="muted">まだ記録がありません</p>'}<section class="card chart-card"><div class="section-title"><h2>学習時間の推移</h2><span class="muted">${group === "week" ? "週別合計" : "日別"}・分</span></div><div id="time-chart"></div><details class="chart-table"><summary>すべての数値を表で見る</summary><table><thead><tr><th>期間</th><th>合計（分）</th></tr></thead><tbody>${[...bars].map(([d, n]) => `<tr><td>${chartRange(d)}</td><td>${n}</td></tr>`).join("")}</tbody></table></details></section><div class="section-title"><h2>Phase実績（全期間）</h2></div><label>閲覧するPhase<select id="analysis-phase">${data.phases.map((p) => `<option value="${p.id}" ${(analysisPhase ?? data.current) === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><p class="selection-preview" id="analysis-phase-name"></p><div id="phase-analysis"></div><div class="section-title"><h2>教材別の学習時間（全期間）</h2></div>${data.materials
    .map((m) => {
      const xs = D.saved(data).filter((s) => s.material === m.id);
      return `<section class="card"><h3>${esc(m.name)}</h3><p>累計 <strong>${D.sum(xs)}分</strong>・${new Set(xs.map((s) => D.day(s.start))).size}日</p></section>`;
    })
    .join("")}`;
  timeChartEntries = [...bars];
  timeChartOffset = null;
  renderTimeChart();
  $("#range-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.from.value || !f.to.value || f.from.value > f.to.value) {
      err(Error("開始日と終了日を確認してください"));
      return;
    }
    analyticsFrom = f.from.value;
    analyticsTo = f.to.value;
    group =
      Date.parse(analyticsTo) - Date.parse(analyticsFrom) > 60 * 86400000
        ? "week"
        : f.group.value;
    analytics();
  };
  $("#analysis-phase").onchange = (e) => {
    analysisPhase = e.target.value;
    phaseAnalysis();
  };
  phaseAnalysis();
}
let timeChartEntries = [],
  timeChartOffset = null;
const chartRange = (date) =>
  group === "week"
    ? `${date} ～ ${new Date(Date.parse(date) + 6 * 86400000).toISOString().slice(0, 10)}`
    : date;
function renderTimeChart() {
  const target = $("#time-chart");
  if (!target) return;
  if (!timeChartEntries.length) {
    target.innerHTML = '<p class="muted">この期間の記録はありません</p>';
    return;
  }
  const count = Math.max(
    1,
    Math.min(7, Math.floor((target.clientWidth || 240) / 48)),
  );
  const total = timeChartEntries.length;
  timeChartOffset ??= Math.max(0, total - count);
  timeChartOffset = Math.min(timeChartOffset, Math.max(0, total - 1));
  const entries = timeChartEntries.slice(
      timeChartOffset,
      timeChartOffset + count,
    ),
    maximum = Math.max(1, ...timeChartEntries.map(([, n]) => n)),
    axisMax = Math.max(10, Math.ceil(maximum / 10) * 10);
  target.innerHTML = `<p class="chart-period">${entries[0][0]} ～ ${group === "week" ? chartRange(entries.at(-1)[0]).split(" ～ ")[1] : entries.at(-1)[0]}</p><div class="chart-scale"><span>縦軸：0～${axisMax}分</span><span>合計時間</span></div><div class="chart-plot" aria-label="学習時間の棒グラフ（0分から表示）">${entries.map(([date, n]) => `<button class="chart-column" data-action="bar" data-id="${chartRange(date)}：${n}分" aria-label="${chartRange(date)} ${n}分" aria-pressed="false"><span class="chart-value">${n}</span><span class="chart-track"><span class="chart-bar ${n === 0 ? "zero" : ""}" style="height:${n === 0 ? "2px" : (n / axisMax) * 100 + "%"}"></span></span><span class="chart-date">${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}</span></button>`).join("")}</div><div class="chart-pagination">${timeChartOffset > 0 ? button("前の期間", "chartPrev", "", "quiet") : ""}<span class="muted">${timeChartOffset + 1}–${timeChartOffset + entries.length} / ${total}${group === "week" ? "週" : "日"}</span>${timeChartOffset + entries.length < total ? button("次の期間", "chartNext", "", "quiet") : ""}</div><p id="bar-detail" class="chart-detail">棒をタップすると、日付と学習時間を確認できます。</p>`;
  target.dataset.pageSize = String(count);
}
function phaseAnalysis() {
  const p = phase($("#analysis-phase")?.value);
  if (!p) return;
  $("#analysis-phase-name").textContent = p.name;
  const ss = D.saved(data).filter((s) => s.phase === p.id);
  $("#phase-analysis").innerHTML =
    `<p>${D.sum(ss)}分・${new Set(ss.map((s) => D.day(s.start))).size}日</p>${data.materials
      .filter(
        (m) => m.phases.includes(p.id) || ss.some((s) => s.material === m.id),
      )
      .map(
        (m) =>
          `<section class="card"><h3>${esc(m.name)}</h3><p>${D.sum(ss.filter((s) => s.material === m.id))}分</p></section>`,
      )
      .join("")}`;
}
function settings() {
  root.innerHTML = `<h1>設定</h1><section class="card"><h2>Phase</h2>${data.phases.map((p) => `<div><h3>${esc(p.name)} <small>${status(p)}</small></h3><p class="muted">${p.start ?? "開始前"}${p.end ? " ～ " + p.end : ""}</p>${button("編集", "phase", p.id)}${p.id === data.phases.find((x) => x.status === "future")?.id ? button(data.current ? "このPhaseへ進む" : "このPhaseを開始", "advance", p.id) : ""}</div>`).join("")}${button("Phaseを追加", "phase")}</section><section class="card"><h2>教材</h2>${data.materials.map((m) => `<div class="row"><p>${esc(m.name)}</p>${button("…", "materialMenu", m.id, "menu")}</div>`).join("")}${button("教材を追加", "material")}</section><section class="card"><h2>データ管理</h2><p>記録はこのiPhone内に保存されます。機種変更やデータ消去の前にバックアップを書き出してください。</p><p class="muted">日常の入口はホーム画面アプリをご利用ください。Safariと保存領域が共有されることは保証されません。</p><p>${button("記録をテキストで出力", "export")}</p><p class="muted">日本語TXT。PCでも読める閲覧用です。</p><p>${button("バックアップを書き出す（JSON）", "backup")}</p><p class="muted">学習中の状態を含む全データの復元用です。</p><label>バックアップから復元<input type="file" id="restore-file" accept=".json,application/json"></label><p class="form-error error" role="alert"></p>${button("端末の保存保護を確認・要求", "persist")}<p id="storage-status" class="muted">保存保護も永久保存やバックアップを保証しません。</p>${updateRegistration?.waiting ? button("画面の更新を適用", "update") : ""}</section>`;
  $("#restore-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const b = DB.parseBackup(await file.text()),
        s = D.active(b.data),
        rev = data.revision;
      const yes = await modal(
        "全データを置き換えます",
        `<p>Phase ${b.data.phases.length}件、教材 ${b.data.materials.length}件、保存済み記録 ${D.saved(b.data).length}件。</p><p>${s ? `未完了状態：${{ running: "学習中", paused: "一時停止中", ending: "終了・保存待ち" }[s.state]}（${D.dateTime(s.start)}）。古い学習中記録は復元後に終了時刻を訂正してください。` : "未完了の記録はありません。"}</p><p>現在のデータは全体置換されます。必要ならキャンセルして先にJSONを書き出してください。</p>`,
        [
          { label: "全体を置き換える", value: true },
          { label: "キャンセル", value: false },
        ],
      );
      if (yes) {
        data = await DB.restore(db, b, rev);
        channel?.postMessage("changed");
        render();
        tell("バックアップのデータを復元しました");
      }
    } catch (e) {
      err(e);
    }
  };
}
function formPage(title, html, onSubmit) {
  editing = true;
  root.className = "editing";
  root.innerHTML = `${button("戻る", "back")}<h1>${esc(title)}</h1><form id="editor">${html}<p class="form-error error" role="alert"></p><div class="savebar"><button class="primary" type="submit">保存</button></div></form>`;
  const form = $("#editor");
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (form.dataset.submitting || busy) return;
    form.dataset.submitting = "true";
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      await onSubmit(form);
    } catch (e) {
      err(e);
    } finally {
      delete form.dataset.submitting;
      if (submit.isConnected) submit.disabled = false;
    }
  };
  syncSelectPreviews();
  root.focus({ preventScroll: true });
}
function phaseForm(id) {
  const p = phase(id);
  formPage(
    p ? "Phaseを編集" : "Phaseを準備",
    field("Phase名", "name", p?.name ?? "") +
      (p && p.status !== "future"
        ? field("実際の開始日", "start", p.start, "date") +
          field("実際の終了日", "end", p.end ?? "", "date")
        : ""),
    async (f) =>
      run({
        type: "phase",
        id: id || D.uid(),
        name: f.elements.name.value,
        start: f.elements.start?.value,
        end: f.elements.end?.value,
      }),
  );
}
async function advance(id) {
  if (D.active(data)) {
    tell("学習を保存または削除してからPhaseを進めてください");
    return;
  }
  const p = phase(id);
  formPage(
    `${p.name}を開始`,
    field("実際の開始日", "start", D.today(), "date") +
      (data.current ? field("前Phaseの終了日", "end", D.today(), "date") : "") +
      "<p>保存済みの記録の所属Phaseは変わりません。</p>",
    async (f) => {
      const yes = await modal(
        "Phaseを進める",
        `<p>${esc(p.name)}を現在Phaseにします。${data.materials.some((m) => m.phases.includes(id)) ? "" : "このPhaseには教材がありません。設定で後から追加できます。"}</p>`,
        [
          { label: "開始する", value: true },
          { label: "キャンセル", value: false },
        ],
      );
      if (yes)
        await run({
          type: "advance",
          id,
          start: f.elements.start.value,
          end: f.elements.end?.value,
          at: D.minute(),
        });
    },
  );
}
function materialForm(id) {
  const m = mat(id);
  formPage(
    m ? "教材を編集" : "教材を追加",
    field("教材名", "name", m?.name ?? "") +
      `<fieldset><legend>利用するPhase</legend>${data.phases.map((p) => `<label class="check"><input type="checkbox" name="phases" value="${p.id}" ${(m ? m.phases.includes(p.id) : p.id === data.current) ? "checked" : ""}>${esc(p.name)}（${status(p)}）</label>`).join("")}</fieldset><p class="muted">全チェックを外しても学習記録は残ります。</p>`,
    async (f) => {
      if (
        data.materials.some(
          (x) => x.id !== id && x.name === f.elements.name.value.trim(),
        )
      ) {
        if (
          !(await modal(
            "同名の教材があります",
            "<p>別教材として保存しますか？</p>",
            [
              { label: "保存する", value: true },
              { label: "キャンセル", value: false },
            ],
          ))
        )
          return;
      }
      await run({
        type: "material",
        id: id || D.uid(),
        name: f.elements.name.value,
        mode: m?.mode ?? "time_only",
        total: m?.total ?? null,
        phases: [...f.querySelectorAll("[name=phases]:checked")].map(
          (x) => x.value,
        ),
      });
    },
  );
}
function editSession(id) {
  const s = data.sessions.find((x) => x.id === id),
    fallback = data.materials[0];
  if (!fallback) {
    tell("先に教材を登録してください");
    return;
  }
  if (!data.phases.length) {
    tell("先にPhaseを登録してください");
    return;
  }
  const defaultTime = D.parseTime(selected + "T" + D.clock(D.minute()));
  let material = s?.material ?? fallback.id;
  formPage(
    s ? "記録を修正" : "過去の記録を追加",
    `<label>教材<select name="material">${data.materials.map((m) => `<option value="${m.id}" ${m.id === material ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label><label>学習時のPhase<select name="phase">${data.phases.map((p) => `<option value="${p.id}" ${p.id === (s?.phase ?? data.current) ? "selected" : ""}>${esc(p.name)}（${status(p)}）</option>`).join("")}</select></label>${field("開始（日本時間）", "start", D.dateTime(s?.start ?? defaultTime), "datetime-local")}${s && ["running", "paused"].includes(s.state) ? "" : field("終了（日本時間）", "end", D.dateTime(s?.end ?? defaultTime), "datetime-local")}<details><summary>一時停止区間を訂正</summary><div id="pauses">${(s?.pauses ?? []).map((p, i) => pauseFields(p, i)).join("")}</div>${button("停止区間を追加", "addPause")}</details>`,
    async (f) => {
      const p = phase(f.phase.value),
        start = D.parseTime(f.start.value),
        end = f.elements.end ? D.parseTime(f.elements.end.value) : null;
      if (
        (p.start && D.day(start) < p.start) ||
        (p.end && D.day(start) > p.end)
      ) {
        if (
          !(await modal(
            "Phase期間外の記録です",
            "<p>指定したPhaseへの帰属を維持して保存しますか？</p>",
            [
              { label: "指定どおり保存", value: true },
              { label: "キャンセル", value: false },
            ],
          ))
        )
          return;
      }
      const pauses = [...f.querySelectorAll("[data-pause]")].map((el) => ({
        start: D.parseTime(el.querySelector("[data-pause-start]").value),
        end: el.querySelector("[data-pause-end]").value
          ? D.parseTime(el.querySelector("[data-pause-end]").value)
          : null,
      }));
      const c = {
        type: s ? "edit" : "add",
        id: id || D.uid(),
        material: f.material.value,
        phase: f.phase.value,
        attempt:
          s?.material === f.material.value
            ? s.attempt
            : D.latest(data, f.material.value)?.id,
        timeOnly: true,
        start,
        end,
        pauses,
      };
      D.reduce(data, c);
      await run(c, () => {
        if (s?.state === "ending") finish(id);
        else {
          selected = D.day(c.start);
          month = selected.slice(0, 7);
          render();
          tell(s ? "記録を修正しました" : "過去の記録を追加しました");
        }
      });
    },
  );
  const f = $("#editor");
  for (const name of ["start", "end"]) {
    if (f.elements[name]) f.elements[name].required = true;
  }
  f.material.onchange = syncSelectPreviews;
  syncSelectPreviews();
}
function pauseFields(p, i) {
  return `<fieldset data-pause><legend>停止 ${i + 1}</legend><label>停止開始<input data-pause-start type="datetime-local" value="${D.dateTime(p.start)}"></label><label>停止終了（停止中は空欄）<input data-pause-end type="datetime-local" value="${p.end === null ? "" : D.dateTime(p.end)}"></label><button type="button" data-action="removePause">この停止を除く</button></fieldset>`;
}
async function download(text, name, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name });
    tell("共有操作を終了しました。ファイルの保存先を確認してください");
  } else {
    const url = URL.createObjectURL(file),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    tell("ファイルを書き出しました。保存先で確認してください");
  }
}
function exportForm() {
  const range = exportRange(data);
  formPage(
    "記録をテキストで出力",
    `<p>閲覧用TXTです。全期間を初期選択しています。</p>${field("開始日", "from", range.from, "date")}${field("終了日", "to", range.to, "date")}<p id="export-count"></p>`,
    async (f) => {
      const from = f.from.value,
        to = f.to.value;
      if (!from || !to || from > to) throw Error("期間を確認してください");
      const snapshot = await DB.read(db),
        count = D.saved(snapshot).filter(
          (s) => D.day(s.start) >= from && D.day(s.start) <= to,
        ).length;
      const yes = await modal(
        "出力内容",
        `<p>${from} ～ ${to}・保存済み${count}件</p>`,
        [
          { label: "TXTを書き出す", value: true },
          { label: "キャンセル", value: false },
        ],
      );
      if (yes)
        try {
          await download(
            exportText(snapshot, from, to),
            `English_Study_Records_${from}_${to}.txt`,
            "text/plain;charset=utf-8",
          );
        } catch (e) {
          if (e.name !== "AbortError") throw e;
        }
    },
  );
  $("#editor button[type=submit]").textContent = "出力内容を確認";
}
async function handle(action, id, target) {
  switch (action) {
    case "home":
    case "settings":
      view = action;
      render();
      break;
    case "back":
      render();
      break;
    case "start":
      await start(id);
      break;
    case "end":
      if (retry?.c.type === "end" && retry.c.id === id) {
        const r = retry;
        await run(r.c, r.after, r.op, r.expected);
      } else await run({ type: "end", id, at: D.minute() }, () => finish(id));
      break;
    case "resume":
    case "pause":
      await run({ type: action, id, at: D.minute() });
      break;
    case "finish":
      finish(id);
      break;
    case "retry":
      if (retry) {
        const r = retry;
        await run(r.c, r.after, r.op, r.expected);
      }
      break;
    case "phase":
      phaseForm(id);
      break;
    case "advance":
      await advance(id);
      break;
    case "material":
      materialForm(id);
      break;
    case "edit":
      editSession(id);
      break;
    case "addPause":
      $("#pauses").insertAdjacentHTML(
        "beforeend",
        pauseFields(
          { start: D.minute(), end: D.minute() },
          document.querySelectorAll("[data-pause]").length,
        ),
      );
      break;
    case "removePause":
      target.closest("[data-pause]").remove();
      break;
    case "sessionMenu": {
      const s = data.sessions.find((x) => x.id === id);
      const options = [
        ...(s.state === "running"
          ? [{ label: "一時停止", value: "pause" }]
          : []),
        {
          label: s.state === "saved" ? "記録を修正" : "時刻・記録を修正",
          value: "edit",
        },
        {
          label: s.state === "saved" ? "記録を削除" : "セッションを削除",
          value: "delete",
        },
        { label: "閉じる", value: null },
      ];
      const a = await modal(mat(s.material).name, "", options);
      if (a === "delete") {
        const yes = await modal(
          "セッションを削除",
          `<p>${D.day(s.start)} ${D.clock(s.start)} / ${esc(mat(s.material).name)}の記録を削除します。</p>`,
          [
            { label: "削除する", value: true },
            { label: "キャンセル", value: false },
          ],
        );
        if (yes)
          await run({ type: "delete", id }, () => {
            render();
            tell("記録を削除しました");
          });
      } else if (a) await handle(a, id);
      break;
    }
    case "materialMenu": {
      const m = mat(id);
      const a = await modal(m.name, "", [
        { label: "教材を編集", value: "material" },
        { label: "教材を完全削除", value: "deleteMaterial" },
        { label: "閉じる", value: null },
      ]);
      if (a === "deleteMaterial") {
        if (
          await modal(
            "教材を削除",
            "<p>学習記録がある教材は削除できません。</p>",
            [
              { label: "削除する", value: true },
              { label: "キャンセル", value: false },
            ],
          )
        )
          await run({ type: a, id });
      } else if (a) await handle(a, id);
      break;
    }
    case "historyMenu":
      if (
        await modal("記録の操作", "", [
          { label: "過去の記録を追加", value: true },
          { label: "閉じる", value: false },
        ])
      )
        editSession();
      break;
    case "date":
      selected = id;
      history();
      break;
    case "today":
      selected = D.today();
      month = selected.slice(0, 7);
      history();
      break;
    case "prevMonth":
    case "nextMonth": {
      const d = new Date(month + "-01");
      d.setUTCMonth(d.getUTCMonth() + (action === "prevMonth" ? -1 : 1));
      month = d.toISOString().slice(0, 7);
      history();
      break;
    }
    case "thisWeek":
      analyticsFrom = weekStart(D.today());
      analyticsTo = D.today();
      analytics();
      break;
    case "thisMonth":
      analyticsFrom = D.today().slice(0, 7) + "-01";
      analyticsTo = D.today();
      analytics();
      break;
    case "bar":
      $("#bar-detail").textContent = id;
      document
        .querySelectorAll(".chart-column")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === target)));
      break;
    case "chartPrev":
    case "chartNext":
      timeChartOffset = Math.max(
        0,
        timeChartOffset +
          (action === "chartPrev" ? -1 : 1) *
            Number($("#time-chart").dataset.pageSize),
      );
      renderTimeChart();
      break;
    case "export":
      exportForm();
      break;
    case "backup": {
      const snapshot = await DB.read(db),
        text = DB.backup(snapshot);
      if (
        await modal(
          "JSONバックアップを書き出す",
          `<p>Phase ${snapshot.phases.length}件・教材 ${snapshot.materials.length}件・保存済み ${D.saved(snapshot).length}件。学習中状態・下書きも含みます。</p><p>保存先は次の画面で選んでください。</p>`,
          [
            { label: "JSONを保存・共有", value: true },
            { label: "キャンセル", value: false },
          ],
        )
      )
        try {
          await download(
            text,
            `English_Study_Backup_${D.today()}.json`,
            "application/json",
          );
        } catch (e) {
          if (e.name !== "AbortError")
            throw Error(
              "ファイル共有に失敗しました。保存・共有の許可を確認して再試行してください。",
            );
        }
      break;
    }
    case "persist": {
      const yes = await navigator.storage?.persist?.();
      $("#storage-status").textContent = yes
        ? "保存保護が許可されています。バックアップは別途必要です。"
        : "保存保護は未許可または非対応です。JSONバックアップをご利用ください。";
      break;
    }
    case "update":
      if (D.active(data) || editing) {
        tell("記録を保存してから更新してください");
        return;
      }
      updateRegistration?.waiting?.postMessage("APPLY_UPDATE");
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => location.reload(),
        { once: true },
      );
      break;
  }
}
document.addEventListener("click", async (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    view = nav.dataset.nav;
    render();
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b) return;
  e.preventDefault();
  if (busy) return;
  try {
    await handle(b.dataset.action, b.dataset.id, b);
  } catch (e) {
    err(e);
  }
});
window.addEventListener("focus", () => {
  if (db) refresh();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && db) refresh();
});
let displayedDay = D.today();
setInterval(() => {
  if (data && !editing && view === "home" && !busy) {
    const s = D.active(data),
      now = D.minute();
    if (s && D.duration(s) < 0)
      tell("端末時計が変わっています。時刻を訂正してください");
    if (displayedDay !== D.today() && !$("#dialog").open) {
      displayedDay = D.today();
      home();
      return;
    }
    if ($("#elapsed") && s)
      $("#elapsed").innerHTML =
        Math.max(0, D.duration(s, now)) + "<small> 分</small>";
    if ($("#today-time"))
      $("#today-time").innerHTML =
        D.sum(D.saved(data).filter((s) => D.day(s.start) === D.today())) +
        (s && D.day(s.start) === D.today()
          ? Math.max(0, D.duration(s, now))
          : 0) +
        "<small> 分</small>";
  }
}, 1000);
try {
  db = await DB.openDB();
  data = await DB.read(db);
  render();
} catch (e) {
  root.innerHTML =
    "<h1>端末の記録を読み込めません</h1><p>データを初期化せず保持しています。別の画面を閉じて再読み込みしてください。</p>";
  err(e);
}
if ("serviceWorker" in navigator) {
  try {
    const r = await navigator.serviceWorker.register("./sw.js");
    updateRegistration = r;
    r.addEventListener("updatefound", () => {
      r.installing?.addEventListener("statechange", () => {
        if (r.waiting && navigator.serviceWorker.controller)
          tell("画面の更新があります。記録保存後、設定から適用できます");
      });
    });
    await navigator.serviceWorker.ready;
    const ready = await caches.match(new URL("./index.html", location.href));
    $("#offline").textContent = ready
      ? "オフライン準備済み"
      : "オフライン準備中";
  } catch {
    $("#offline").textContent = "オフライン準備未完了";
  }
} else $("#offline").textContent = "オフライン未対応";

new ResizeObserver(() => {
  document.documentElement.style.setProperty(
    "--nav-height",
    document.querySelector("nav").getBoundingClientRect().height + "px",
  );
}).observe(document.querySelector("nav"));

function syncSelectPreviews() {
  for (const select of root.querySelectorAll("select")) {
    if (
      select.id === "analysis-phase" ||
      select.name === "group" ||
      select.name === "mode"
    )
      continue;
    let preview = select.parentElement.querySelector(".selection-preview");
    if (!preview) {
      preview = document.createElement("span");
      preview.className = "selection-preview";
      preview.setAttribute("aria-hidden", "true");
      preview.setAttribute("aria-hidden", "true");
      select.after(preview);
    }
    preview.textContent = select.selectedOptions[0]?.textContent ?? "";
  }
}
document.addEventListener("change", (e) => {
  if (e.target.matches("select")) syncSelectPreviews();
});
window.addEventListener("resize", () => {
  if (view === "analytics" && !editing) renderTimeChart();
});
