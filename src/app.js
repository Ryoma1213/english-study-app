import * as D from "./domain.js";
import * as DB from "./db.js";
import {
  exportText,
  exportRange,
  progressText,
  timeText,
  span,
} from "./export.js";
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
  phase = (id) => data.phases.find((p) => p.id === id),
  att = (id) => data.attempts.find((a) => a.id === id);
const status = (p) =>
  ({ future: "未開始", current: "現在", past: "終了" })[p.status];
const tell = (t) => {
  $("#notice").textContent = t;
  setTimeout(() => {
    if ($("#notice").textContent === t) $("#notice").textContent = "";
  }, 6000);
};
const err = (e) => {
  const target = $(".form-error") ?? $("#notice");
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
    data = await DB.commit(db, c, expected, op);
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
function progress(m, p = data.current, a = D.latest(data, m.id)) {
  if (m.mode === "time_only") return '<p class="muted">時間のみ</p>';
  const n = a ? D.reach(data, p, a.id) : 0,
    total = a?.total ?? m.total;
  const ss = D.saved(data).filter((s) => s.phase === p && s.attempt === a?.id);
  const unknown = !n && ss.length;
  return `<p>${unknown ? "到達ページ未記録" : n ? `最終記録 P.${n} / ${total}` : "未着手"} <strong>${unknown ? "—" : Math.floor((n / total) * 100) + "%"}</strong></p>${unknown ? "" : `<progress max="${total}" value="${n}" aria-label="${esc(m.name)}の進捗"></progress>`}`;
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
}
function home() {
  const now = D.minute(),
    today = D.day(now),
    ss = D.saved(data).filter((s) => D.day(s.start) === today),
    s = D.active(data);
  root.innerHTML = `<p class="muted">${esc(new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" }))}</p><h1>今日の学習</h1><div class="big" id="today-time">${D.sum(ss) + (s && D.day(s.start) === today ? Math.max(0, D.duration(s, now)) : 0)}<small> 分</small></div><p class="muted">全Phaseの今日開始分${s && D.day(s.start) === today ? `・${s.state === "ending" ? "未保存を含む" : "学習中を含む"}` : ""}</p>${s ? `<section class="card current"><span class="tag">${{ running: "学習中", paused: "一時停止中", ending: "終了・入力待ち" }[s.state]}</span><h2>${esc(mat(s.material).name)}</h2><p>開始 ${D.clock(s.start)}${D.day(s.start) !== today ? `（${D.day(s.start)}）` : ""}</p><p class="big" id="elapsed">${Math.max(0, D.duration(s))}<small> 分</small></p><div class="row">${s.state === "ending" ? button("記録を仕上げる", "finish", s.id, "primary") : s.state === "paused" ? button("再開", "resume", s.id, "primary") + button("終了", "end", s.id) : button("終了", "end", s.id, "primary")}${button("…", "sessionMenu", s.id, "menu")}</div></section>` : ""}<h2>${data.current ? esc(phase(data.current).name) : "学習の準備"}</h2><p class="muted">教材の今日時間は現在Phase分です。</p>${
    !data.current
      ? `<section class="card"><p>設定でPhaseを作成し、開始してください。</p>${button("設定へ", "settings")}</section>`
      : data.materials
          .filter((m) => m.phases.includes(data.current))
          .map(
            (m) =>
              `<section class="card"><h2>${esc(m.name)}</h2>${progress(m)}<p>今日 ${D.sum(ss.filter((s) => s.material === m.id && s.phase === data.current))}分</p><div class="row">${s?.material === m.id ? "" : button("開始", "start", m.id, "primary")}${button("…", "materialMenu", m.id, "menu")}</div></section>`,
          )
          .join("") ||
        `<section class="card"><p>教材を登録すると、ここからすぐに開始できます。</p>${button("教材を追加", "material")}</section>`
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
  const m = mat(id),
    a = D.latest(data, id);
  let choice;
  if (a && a.total !== null && D.reach(data, data.current, a.id) === a.total) {
    choice = await modal(
      "100%に到達した教材です",
      "<p>これまでの記録は保持されます。</p>",
      [
        { label: "このまま学習する", value: "continue" },
        { label: "P.1から新しく取り組む", value: "new" },
        { label: "キャンセル", value: null },
      ],
    );
    if (!choice) return;
  }
  await run({ type: "start", id, sessionId: D.uid(), at: D.minute(), choice });
}
let draftQueue = Promise.resolve();
function finish(id) {
  const s = data.sessions.find((s) => s.id === id);
  if (!s || s.state !== "ending") {
    render();
    return;
  }
  editing = true;
  root.className = "editing";
  const a = att(s.attempt);
  root.innerHTML = `${button("ホームへ戻る", "back")}<p class="tag">終了・入力待ち</p><h1>${esc(mat(s.material).name)}</h1><p class="big">${D.duration(s)}<small> 分</small></p><p>${span(s)}</p><form id="finish-form">${a.total === null ? "" : `<p>学習前 P.${s.before} / ${a.total}</p>${field("今回の到達ページ（任意）", "page", s.draft.page, "text", `inputmode="numeric" ${s.draft.noChange ? "disabled" : ""}`)}<label class="check"><input type="checkbox" name="noChange" ${s.draft.noChange ? "checked" : ""}>ページ進捗なし</label><p class="muted">空欄でも時間を保存できます。</p>`}<p class="form-error error" role="alert"></p><div class="savebar"><button type="submit" class="primary">保存</button></div></form>${button("時刻・停止区間を修正", "edit", s.id)}`;
  const form = $("#finish-form");
  form.oninput = () => {
    if (form.elements.page)
      form.elements.page.disabled = form.elements.noChange.checked;
    const page = form.elements.page?.value ?? "",
      noChange = form.elements.noChange?.checked ?? false;
    draftQueue = draftQueue.then(async () => {
      await run({ type: "draft", id, page, noChange }, () => {});
    });
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    await draftQueue;
    const page = form.elements.page?.value ?? "",
      noChange = form.elements.noChange?.checked ?? false;
    form.querySelector("button[type=submit]").disabled = true;
    const ok = await run({ type: "save", id, page, noChange }, () => {
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
    monthSessions = ss.filter((s) => D.day(s.start).startsWith(month)),
    days = new Date(Date.parse(month + "-01") + 32 * 86400000);
  const last = new Date(
    Date.UTC(days.getUTCFullYear(), days.getUTCMonth(), 0),
  ).getUTCDate();
  const first = new Date(month + "-01").getUTCDay(),
    ds = ss.filter((s) => D.day(s.start) === selected),
    st = D.streak(data);
  root.innerHTML = `<div class="row"><h1>記録</h1>${button("…", "historyMenu", "", "menu")}</div><p>今月の学習日数 ${new Set(monthSessions.map((s) => D.day(s.start))).size}日</p><p>${st.yesterday ? "昨日まで " : ""}連続 ${st.count}日</p><div class="row">${button("前月", "prevMonth")}<strong>${month}</strong>${button("翌月", "nextMonth")}${button("今日", "today")}</div><div class="calendar">${["日", "月", "火", "水", "木", "金", "土"].map((d) => `<span class="weekday">${d}</span>`).join("")}${"<span></span>".repeat(first)}${Array.from(
    { length: last },
    (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`,
        ds = ss.filter((s) => D.day(s.start) === date);
      return `<button data-action="date" data-id="${date}" class="${date === selected ? "selected" : ""} ${ds.length ? "has" : ""}" aria-label="${date} ${D.sum(ds)}分${ds.length ? " 学習記録あり" : ""}" aria-pressed="${date === selected}">${i + 1}<small>${ds.length ? `${D.sum(ds)}分` : "—"}</small></button>`;
    },
  ).join(
    "",
  )}</div><h2>${selected}</h2><p>実学習時間 ${timeText(D.sum(ds))}</p>${ds.length ? `<p class="muted">学習時間帯 ${span({ start: Math.min(...ds.map((s) => s.start)), end: Math.max(...ds.map((s) => s.end)) })}</p>` : "<p>この日の記録はありません</p>"}${data.materials
    .map((m) => {
      const ms = ds.filter((s) => s.material === m.id);
      return !ms.length
        ? ""
        : `<section class="card"><h3>${esc(m.name)}・合計 ${D.sum(ms)}分</h3>${ms
            .sort((a, b) => a.start - b.start)
            .map(
              (s) =>
                `<div><p>${span(s)} / ${D.duration(s)}分</p><p class="muted">${esc(phase(s.phase).name)}${att(s.attempt).total === null ? "" : `・${att(s.attempt).number}回目`}</p><p>${s.progress === "recorded" ? `P.${s.before} → P.${s.page}` : progressText(data, s)}</p>${button("… 記録の操作", "sessionMenu", s.id)}</div>`,
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
    avg = D.average(data, analyticsFrom, analyticsTo);
  const bars = new Map();
  for (
    let t = Date.parse(analyticsFrom);
    t <= Math.min(Date.parse(analyticsTo), Date.parse(D.today()));
    t += 86400000
  ) {
    const date = new Date(t).toISOString().slice(0, 10),
      k = group === "week" ? weekStart(date) : date;
    bars.set(k, 0);
  }
  for (const s of ss) {
    const date = D.day(s.start),
      key = group === "week" ? weekStart(date) : date;
    if (bars.has(key)) bars.set(key, bars.get(key) + D.duration(s));
  }
  const max = Math.max(1, ...bars.values());
  root.innerHTML = `<h1>分析</h1><p class="muted">保存済みの記録から振り返ります。</p><div class="row">${button("今週", "thisWeek")}${button("今月", "thisMonth")}</div><form id="range-form">${field("開始日", "from", analyticsFrom, "date")}${field("終了日", "to", analyticsTo, "date")}<label>表示<select name="group"><option value="day" ${group === "day" ? "selected" : ""}>日別</option><option value="week" ${group === "week" ? "selected" : ""}>週別（合計）</option></select></label><button>期間を表示</button><p class="form-error error" role="alert"></p></form><section class="card"><p>合計 <strong>${timeText(D.sum(ss))}</strong>・学習 ${new Set(ss.map((s) => D.day(s.start))).size}日</p><p>${avg.days}日間・1日平均 ${avg.value === null ? "—" : Math.round(avg.value * 10) / 10 + "分"}</p><small>平均対象 ${avg.from} ～ ${avg.to}（未学習日を含む）</small></section>${ss.length ? "" : "<p>まだ記録がありません</p>"}<p>時間の推移（分・0から表示）</p><div class="bars" aria-label="学習時間の棒グラフ">${[
    ...bars,
  ]
    .slice(-60)
    .map(
      ([date, n]) =>
        `<button data-action="bar" data-id="${date}：${n}分" style="--height:${Math.max(2, (n / max) * 100)}%" aria-label="${date} ${n}分"></button>`,
    )
    .join(
      "",
    )}</div><p id="bar-detail" class="chart-label">棒をタップすると日付と時間を表示します。最大60区間を表示。</p><details><summary>グラフの表を表示</summary><table><thead><tr><th>期間</th><th>合計（分）</th></tr></thead><tbody>${[...bars].map(([d, n]) => `<tr><td>${d}${group === "week" ? ` ～ ${new Date(Date.parse(d) + 6 * 86400000).toISOString().slice(0, 10)}` : ""}</td><td>${n}</td></tr>`).join("")}</tbody></table></details><h2>Phase実績（全期間）</h2><label>閲覧するPhase<select id="analysis-phase">${data.phases.map((p) => `<option value="${p.id}" ${(analysisPhase ?? data.current) === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><div id="phase-analysis"></div><h2>教材実績・取り組み比較（全期間）</h2>${data.materials
    .map(
      (m) =>
        `<details class="card"><summary>${esc(m.name)}・${D.sum(D.saved(data).filter((s) => s.material === m.id))}分</summary>${data.attempts
          .filter((a) => a.material === m.id)
          .map((a) => {
            const xs = D.saved(data)
                .filter((s) => s.attempt === a.id)
                .sort((x, y) => x.start - y.start),
              pts = xs.filter((s) => s.progress === "recorded"),
              complete = pts.find((s) => s.page === a.total);
            return `<h3>${a.total === null ? "時間のみ" : `${a.number}回目 / 総${a.total}ページ`}</h3><p>累計 ${D.sum(xs)}分${a.total === null ? "" : `・最終記録 ${pts.length ? "P." + Math.max(...pts.map((s) => s.page)) : "—"}`}</p>${a.total === null ? "" : `<p class="muted">${complete ? "100%到達" : "到達未確認"}・到達まで ${complete ? Math.round((Date.parse(D.day(complete.start)) - Date.parse(D.day(xs[0].start))) / 86400000) + 1 + "日" : "—"} / ${complete ? D.sum(xs.filter((s) => s.start <= complete.start)) + "分" : "—"}</p>${progressChart(pts, a)}<table><tr><th>日付・Phase</th><th>到達ページ</th></tr>${pts.map((s) => `<tr><td>${D.day(s.start)}<br>${esc(phase(s.phase).name)}</td><td>${s.page}</td></tr>`).join("")}</table>`}`;
          })
          .join("")}</details>`,
    )
    .join("")}`;
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
function progressChart(ss, a) {
  if (!ss.length) return "";
  const first = ss[0].start,
    last = ss.at(-1).start;
  return `<svg class="chart" viewBox="0 0 300 160" role="img" aria-label="${a.number}回目の進捗推移。詳細は下の表"><path d="M20 5V140H295" fill="none" stroke="currentColor"/><polyline fill="none" stroke="var(--accent)" stroke-width="3" points="${ss.map((s) => `${20 + ((s.start - first) / Math.max(1, last - first)) * 270},${140 - (s.page / a.total) * 130}`).join(" ")}"/></svg>`;
}
function phaseAnalysis() {
  const p = phase($("#analysis-phase")?.value);
  if (!p) return;
  const ss = D.saved(data).filter((s) => s.phase === p.id);
  $("#phase-analysis").innerHTML =
    `<p>${D.sum(ss)}分・${new Set(ss.map((s) => D.day(s.start))).size}日</p>${data.boundaries
      .filter((b) => b.phase === p.id)
      .map((b) => {
        const a = att(b.attempt);
        return `<section class="card"><h3>${esc(mat(a.material).name)}${a.total === null ? "" : `・${a.number}回目`}</h3><p>${D.sum(ss.filter((s) => s.attempt === a.id))}分</p>${a.total === null ? "" : `<p>引継 P.${b.carry} → ${D.reach(data, p.id, a.id) ? `到達 P.${D.reach(data, p.id, a.id)} / ${a.total}` : ss.some((s) => s.attempt === a.id) ? "到達ページ未記録（—）" : "未着手（0%）"}</p>`}</section>`;
      })
      .join("")}`;
}
function settings() {
  root.innerHTML = `<h1>設定</h1><section class="card"><h2>Phase</h2>${data.phases.map((p) => `<div><h3>${esc(p.name)} <small>${status(p)}</small></h3><p class="muted">${p.start ?? "開始前"}${p.end ? " ～ " + p.end : ""}</p>${button("編集", "phase", p.id)}${p.id === data.phases.find((x) => x.status === "future")?.id ? button(data.current ? "このPhaseへ進む" : "このPhaseを開始", "advance", p.id) : ""}</div>`).join("")}${button("Phaseを追加", "phase")}</section><section class="card"><h2>教材</h2>${data.materials.map((m) => `<div class="row"><p>${esc(m.name)}</p>${button("…", "materialMenu", m.id, "menu")}</div>`).join("")}${button("教材を追加", "material")}</section>${
    D.boundaryWarnings(data).length
      ? `<section class="card"><h2>引継値の確認</h2><p>過去記録と引継値に違いがあります。保存済みの引継値は自動変更していません。</p>${D.boundaryWarnings(
          data,
        )
          .map(
            (b) =>
              `<p>${esc(phase(b.phase).name)} / ${esc(mat(att(b.attempt).material).name)}：引継${b.carry}、引継元${D.reach(data, b.source, b.attempt)}</p>${button("引継を訂正", "boundary", b.id)}`,
          )
          .join("")}</section>`
      : ""
  }<section class="card"><h2>データ管理</h2><p>記録はこのiPhone内に保存されます。機種変更やデータ消去の前にバックアップを書き出してください。</p><p class="muted">日常の入口はホーム画面アプリをご利用ください。Safariと保存領域が共有されることは保証されません。</p><p>${button("記録をテキストで出力", "export")}</p><p class="muted">日本語TXT。PCでも読める閲覧用です。</p><p>${button("バックアップを書き出す（JSON）", "backup")}</p><p class="muted">学習中の状態を含む全データの復元用です。</p><label>バックアップから復元<input type="file" id="restore-file" accept=".json,application/json"></label><p class="form-error error" role="alert"></p>${button("端末の保存保護を確認・要求", "persist")}<p id="storage-status" class="muted">保存保護も永久保存やバックアップを保証しません。</p>${updateRegistration?.waiting ? button("画面の更新を適用", "update") : ""}</section>`;
  $("#restore-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const b = DB.parseBackup(await file.text()),
        s = D.active(b.data),
        rev = data.revision;
      const yes = await modal(
        "全データを置き換えます",
        `<p>Phase ${b.data.phases.length}件、教材 ${b.data.materials.length}件、保存済み記録 ${D.saved(b.data).length}件。</p><p>${s ? `未完了状態：${{ running: "学習中", paused: "一時停止中", ending: "終了・入力待ち" }[s.state]}（${D.dateTime(s.start)}）。古い学習中記録は復元後に終了時刻を訂正してください。` : "未完了の記録はありません。"}</p><p>現在のデータは全体置換されます。必要ならキャンセルして先にJSONを書き出してください。</p>`,
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
  $("#editor").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(e.target);
    } catch (e) {
      err(e);
    }
  };
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
      `<label>管理方法<select name="mode"><option value="pages" ${m?.mode === "pages" ? "selected" : ""}>ページ進捗あり</option><option value="time_only" ${m?.mode === "time_only" ? "selected" : ""}>時間のみ</option></select></label><div id="total-field">${field("既定の総ページ数", "total", m?.total ?? "", "text", 'inputmode="numeric"')}</div><fieldset><legend>利用するPhase</legend>${data.phases.map((p) => `<label class="check"><input type="checkbox" name="phases" value="${p.id}" ${(m ? m.phases.includes(p.id) : p.id === data.current) ? "checked" : ""}>${esc(p.name)}（${status(p)}）</label>`).join("")}</fieldset><p class="muted">全チェックを外しても記録は残ります。既定の総ページ数は過去の取り組みへ遡及しません。</p>`,
    async (f) => {
      if (
        data.materials.some(
          (x) => x.id !== id && x.name === f.elements.name.value.trim(),
        )
      ) {
        if (
          !(await modal(
            "同名の教材があります",
            "<p>別教材として登録・保存しますか？</p>",
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
        mode: f.mode.value,
        total: f.total.value,
        phases: [...f.querySelectorAll("[name=phases]:checked")].map(
          (x) => x.value,
        ),
      });
    },
  );
  const change = () => {
    $("#total-field").hidden = $("#editor").mode.value === "time_only";
  };
  $("#editor").mode.onchange = change;
  change();
}
function editSession(id) {
  const s = data.sessions.find((x) => x.id === id),
    fallback = data.materials[0];
  if (!fallback) {
    tell("先に教材を登録してください");
    return;
  }
  let material = s?.material ?? fallback.id;
  formPage(
    s ? "記録を修正" : "過去の学習記録追加",
    `<label>教材<select name="material">${data.materials.map((m) => `<option value="${m.id}" ${m.id === material ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label><label>学習時のPhase<select name="phase">${data.phases.map((p) => `<option value="${p.id}" ${p.id === (s?.phase ?? data.current) ? "selected" : ""}>${esc(p.name)}（${status(p)}）</option>`).join("")}</select></label><div id="attempt-field"></div>${field("開始（日本時間）", "start", D.dateTime(s?.start ?? D.minute()), "datetime-local")}${s && ["running", "paused"].includes(s.state) ? "" : field("終了（日本時間）", "end", D.dateTime(s?.end ?? D.minute()), "datetime-local")}<div id="edit-page">${field("到達ページ（任意）", "page", s?.page ?? "", "text", 'inputmode="numeric"')}<label class="check"><input type="checkbox" name="noChange" ${s?.progress === "no_change" ? "checked" : ""}>ページ進捗なし</label></div><details><summary>一時停止区間を訂正</summary><div id="pauses">${(s?.pauses ?? []).map((p, i) => pauseFields(p, i)).join("")}</div>${button("停止区間を追加", "addPause")}</details><p class="muted">後Phaseの引継値や当時の学習前ページは自動変更しません。</p>`,
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
        attempt: f.elements.attempt.value,
        start,
        end,
        pauses,
        page: f.page.value,
        noChange: f.noChange.checked,
      };
      const preview = D.reduce(data, c);
      const changed = D.boundaryWarnings(preview).filter(
        (b) => !D.boundaryWarnings(data).some((x) => x.id === b.id),
      );
      const lost = data.attempts.some(
        (a) =>
          a.total !== null &&
          D.saved(data).some((x) => x.attempt === a.id && x.page === a.total) &&
          !D.saved(preview).some(
            (x) => x.attempt === a.id && x.page === a.total,
          ),
      );
      if (changed.length || lost) {
        if (
          !(await modal(
            "進捗への影響を確認",
            `<p>${changed.length ? "後Phaseの引継と訂正後の到達値に違いが生じます。引継は保持し、設定から明示的に訂正できます。" : ""}${lost ? "100%の根拠がなくなります。次の取り組みは結合せず、到達未確認として保持します。" : ""}</p>`,
            [
              { label: "訂正を保存", value: true },
              { label: "キャンセル", value: false },
            ],
          ))
        )
          return;
      }
      await run(c, () => {
        if (s?.state === "ending") finish(id);
        else render();
      });
    },
  );
  const f = $("#editor");
  const update = () => {
    const aa = data.attempts.filter((a) => a.material === f.material.value);
    $("#attempt-field").innerHTML = `<label>取り組み<select name="attempt">${
      aa.length
        ? aa
            .map((a) => {
              const xs = data.sessions.filter((s) => s.attempt === a.id);
              return `<option value="${a.id}" ${a.id === s?.attempt ? "selected" : ""}>${a.number}回目・開始 ${xs.length ? D.day(Math.min(...xs.map((s) => s.start))) : "未記録"}${a.total === null ? "" : `・到達P.${Math.max(0, ...data.boundaries.filter((b) => b.attempt === a.id).map((b) => D.reach(data, b.phase, a.id)))}/${a.total}`}</option>`;
            })
            .join("")
        : '<option value="">初回</option>'
    }</select></label>`;
    $("#edit-page").hidden = mat(f.material.value).mode === "time_only";
  };
  f.material.onchange = update;
  f.noChange.onchange = () => {
    f.page.disabled = f.noChange.checked;
  };
  f.noChange.onchange();
  update();
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
      await draftQueue;
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
        { label: "時刻・記録を修正", value: "edit" },
        { label: "セッションを削除", value: "delete" },
        { label: "閉じる", value: null },
      ];
      const a = await modal(mat(s.material).name, "", options);
      if (a === "delete") {
        const preview = D.reduce(data, { type: "delete", id });
        const impact =
          D.boundaryWarnings(preview).length >
            D.boundaryWarnings(data).length || att(s.attempt).total === s.page;
        const yes = await modal(
          "セッションを削除",
          `<p>${D.day(s.start)} ${D.clock(s.start)} / ${esc(mat(s.material).name)}の記録を削除します。${impact ? "進捗の根拠が変わります。後Phaseの引継値と別の取り組みは保持します。" : ""}</p>`,
          [
            { label: "削除する", value: true },
            { label: "キャンセル", value: false },
          ],
        );
        if (yes) await run({ type: "delete", id });
      } else if (a) await handle(a, id);
      break;
    }
    case "materialMenu": {
      const m = mat(id);
      const a = await modal(m.name, "", [
        { label: "教材を編集", value: "material" },
        ...(m.mode === "pages" && D.latest(data, id)
          ? [{ label: "現在取り組みの総ページ数を訂正", value: "total" }]
          : []),
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
    case "total": {
      const a = D.latest(data, id);
      formPage(
        "取り組みの総ページ数を訂正",
        field("総ページ数", "total", a.total, "text", 'inputmode="numeric"') +
          "<p>この取り組みの全Phaseの進捗率と100%判定に影響します。</p>",
        async (f) => {
          if (
            await modal(
              "訂正の影響",
              "<p>この取り組みの過去Phaseも同じ総ページ数で表示されます。</p>",
              [
                { label: "訂正する", value: true },
                { label: "キャンセル", value: false },
              ],
            )
          )
            await run({ type: "total", id: a.id, total: f.total.value });
        },
      );
      break;
    }
    case "boundary": {
      const b = data.boundaries.find((x) => x.id === id);
      formPage(
        "引継値を訂正",
        `<p>${esc(phase(b.phase).name)}の引継を変更します。保存済みの到達ページや学習前ページは保持します。</p>${field("引継ページ（0を含む）", "carry", b.carry, "text", 'inputmode="numeric"')}`,
        async (f) => {
          if (
            await modal(
              "引継値の訂正",
              "<p>このPhaseの進捗の基準を変更します。</p>",
              [
                { label: "訂正する", value: true },
                { label: "キャンセル", value: false },
              ],
            )
          )
            await run({ type: "boundary", id, carry: f.carry.value });
        },
      );
      break;
    }
    case "historyMenu":
      if (
        await modal("記録の操作", "", [
          { label: "過去の学習記録追加", value: true },
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
    await draftQueue;
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
