export const minute = () => Math.floor(Date.now() / 60000);
export const day = (t) =>
  new Date(t * 60000 + 9 * 3600000).toISOString().slice(0, 10);
export const clock = (t) =>
  new Date(t * 60000 + 9 * 3600000).toISOString().slice(11, 16);
export const today = () => day(minute());
export const parseTime = (s) => Date.parse(s + ":00+09:00") / 60000;
export const dateTime = (t) => `${day(t)}T${clock(t)}`;
export const uid = () => crypto.randomUUID();
export const empty = () => ({
  version: 1,
  revision: 0,
  current: null,
  phases: [],
  materials: [],
  attempts: [],
  boundaries: [],
  sessions: [],
  commands: {},
});
export const saved = (d) => d.sessions.filter((s) => s.state === "saved");
export const active = (d) => d.sessions.find((s) => s.state !== "saved");
export const sum = (ss) => ss.reduce((n, s) => n + duration(s), 0);
export const duration = (s, now = minute()) =>
  (s.end ?? now) -
  s.start -
  s.pauses.reduce((n, p) => n + (p.end ?? s.end ?? now) - p.start, 0);
export const reach = (d, p, a, until = "9999-12-31") =>
  Math.max(
    d.boundaries.find((b) => b.phase === p && b.attempt === a)?.carry ?? 0,
    ...saved(d)
      .filter(
        (s) =>
          s.phase === p &&
          s.attempt === a &&
          s.progress === "recorded" &&
          day(s.start) <= until,
      )
      .map((s) => s.page),
  );
export const latest = (d, m) =>
  d.attempts.filter((a) => a.material === m).at(-1);
const need = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const validDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  new Date(s).toISOString().slice(0, 10) === s;
const clean = (s) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
export function ensureBoundary(d, p, a, at = minute()) {
  let b = d.boundaries.find((b) => b.phase === p && b.attempt === a.id);
  if (b) return b;
  const order = d.phases.find((x) => x.id === p).order;
  const previous = d.boundaries
    .filter(
      (x) =>
        x.attempt === a.id &&
        d.phases.find((p) => p.id === x.phase).order < order,
    )
    .sort(
      (x, y) =>
        d.phases.find((p) => p.id === x.phase).order -
        d.phases.find((p) => p.id === y.phase).order,
    )
    .at(-1);
  b = {
    id: uid(),
    phase: p,
    attempt: a.id,
    carry:
      a.total === null ? null : previous ? reach(d, previous.phase, a.id) : 0,
    source: previous?.phase ?? null,
    at,
  };
  d.boundaries.push(b);
  return b;
}
function attempt(d, m) {
  let a = latest(d, m.id);
  if (!a) {
    a = { id: uid(), material: m.id, total: m.total, number: 1 };
    d.attempts.push(a);
  }
  return a;
}
export function boundaryWarnings(d) {
  return d.boundaries.filter(
    (b) =>
      b.source && b.carry !== null && b.carry !== reach(d, b.source, b.attempt),
  );
}
export function validate(d, now = minute()) {
  need(
    d && d.version === 1 && integer(d.revision),
    "未対応または破損したデータ形式です",
  );
  for (const key of [
    "phases",
    "materials",
    "attempts",
    "boundaries",
    "sessions",
  ]) {
    need(Array.isArray(d[key]), "データ配列が不正です");
    const ids = new Set();
    for (const x of d[key]) {
      need(
        x && typeof x.id === "string" && !ids.has(x.id),
        "IDが重複または不正です",
      );
      ids.add(x.id);
    }
  }
  need(
    d.commands && typeof d.commands === "object" && !Array.isArray(d.commands),
    "操作情報が不正です",
  );
  const p = (id) => d.phases.find((x) => x.id === id),
    m = (id) => d.materials.find((x) => x.id === id),
    a = (id) => d.attempts.find((x) => x.id === id);
  need(
    d.current === null || p(d.current)?.status === "current",
    "現在Phaseが不正です",
  );
  need(
    d.phases.filter((x) => x.status === "current").length ===
      (d.current ? 1 : 0),
    "現在Phaseは1件までです",
  );
  const names = new Set(),
    orders = new Set();
  for (const x of d.phases) {
    need(
      clean(x.name) &&
        !names.has(x.name) &&
        integer(x.order) &&
        !orders.has(x.order),
      "Phase名または順序が不正です",
    );
    names.add(x.name);
    orders.add(x.order);
    need(
      ["future", "current", "past"].includes(x.status),
      "Phase状態が不正です",
    );
    need(
      x.start === null || (validDate(x.start) && x.start <= day(now)),
      "実開始日は今日以前にしてください",
    );
    need(
      x.end === null ||
        (validDate(x.end) && x.start !== null && x.start <= x.end),
      "Phaseの開始日・終了日を確認してください",
    );
    need(
      x.status === "future" ? x.start === null : x.start !== null,
      "Phaseの開始状態が不正です",
    );
  }
  for (const x of d.materials) {
    need(
      clean(x.name) && ["pages", "time_only"].includes(x.mode),
      "教材情報が不正です",
    );
    need(
      x.mode === "pages" ? integer(x.total, 1) : x.total === null,
      "総ページ数は正の整数です",
    );
    need(
      Array.isArray(x.phases) &&
        new Set(x.phases).size === x.phases.length &&
        x.phases.every((id) => p(id)),
      "教材のPhase参照が不正です",
    );
  }
  for (const x of d.attempts) {
    need(m(x.material) && integer(x.number, 1), "取り組み参照が不正です");
    need(
      m(x.material).mode === "pages" ? integer(x.total, 1) : x.total === null,
      "取り組みの総ページ数が不正です",
    );
    need(
      d.attempts.filter(
        (v) => v.material === x.material && v.number === x.number,
      ).length === 1,
      "取り組み番号が重複しています",
    );
  }
  const pairs = new Set();
  for (const b of d.boundaries) {
    need(
      p(b.phase) && a(b.attempt) && !pairs.has(b.phase + b.attempt),
      "引継参照が不正です",
    );
    pairs.add(b.phase + b.attempt);
    need(integer(b.at) && b.at <= now, "引継時刻が不正です");
    need(
      b.source === null ||
        (p(b.source) && p(b.source).order < p(b.phase).order),
      "引継元が不正です",
    );
    need(
      a(b.attempt).total === null
        ? b.carry === null
        : integer(b.carry) && b.carry <= a(b.attempt).total,
      "引継ページが不正です",
    );
  }
  need(
    d.sessions.filter((s) => s.state !== "saved").length <= 1,
    "未完了の学習は1件までです",
  );
  for (const s of d.sessions) {
    const at = a(s.attempt);
    need(
      m(s.material) &&
        p(s.phase) &&
        at?.material === s.material &&
        pairs.has(s.phase + s.attempt),
      "記録の参照が不正です",
    );
    need(
      ["running", "paused", "ending", "saved"].includes(s.state),
      "記録状態が不正です",
    );
    need(
      integer(s.start) && s.start <= now,
      "開始時刻は現在以前にしてください",
    );
    need(
      ["ending", "saved"].includes(s.state)
        ? integer(s.end) && s.end >= s.start && s.end <= now
        : s.end === null,
      "開始・終了時刻を確認してください",
    );
    need(Array.isArray(s.pauses), "停止区間が不正です");
    let end = s.start,
      open = 0;
    for (const q of s.pauses) {
      need(
        integer(q.start) && q.start >= end && q.start <= (s.end ?? now),
        "停止区間が範囲外です。停止区間を訂正してください",
      );
      if (q.end === null) {
        open++;
        end = Infinity;
        need(s.state === "paused", "停止状態が不正です");
      } else {
        need(
          integer(q.end) && q.end >= q.start && q.end <= (s.end ?? now),
          "停止区間を訂正してください",
        );
        end = q.end;
      }
    }
    need(open === (s.state === "paused" ? 1 : 0), "停止状態が不正です");
    need(duration(s, now) >= 0, "時計の変更を確認して時刻を訂正してください");
    need(
      ["recorded", "no_change", "unrecorded", "not_applicable"].includes(
        s.progress,
      ),
      "進捗状態が不正です",
    );
    need(
      at.total === null
        ? s.progress === "not_applicable" &&
            s.page === null &&
            s.before === null
        : s.progress !== "not_applicable" &&
            integer(s.before) &&
            s.before <= at.total,
      "ページ管理状態が不正です",
    );
    need(
      s.progress === "recorded"
        ? integer(s.page, 1) && s.page <= at.total
        : s.page === null,
      "到達ページを確認してください",
    );
    need(
      s.draft &&
        typeof s.draft.page === "string" &&
        typeof s.draft.noChange === "boolean",
      "入力下書きが不正です",
    );
  }
  const ss = [...d.sessions].sort((a, b) => a.start - b.start);
  for (let i = 0; i < ss.length; i++)
    for (let j = i + 1; j < ss.length; j++) {
      const x = ss[i],
        y = ss[j];
      need(
        !(x.start < (y.end ?? now) && y.start < (x.end ?? now)),
        "他のセッションと時間帯が重複しています（停止区間を含みます）",
      );
    }
  return d;
}
function progress(s, a, page, noChange, normal = false) {
  s.progress =
    a.total === null
      ? "not_applicable"
      : noChange
        ? "no_change"
        : page === ""
          ? "unrecorded"
          : "recorded";
  s.page = s.progress === "recorded" ? Number(page) : null;
  if (s.progress === "recorded") {
    need(
      /^\d+$/.test(String(page)) && integer(s.page, 1) && s.page <= a.total,
      `1～${a.total}の整数ページを入力してください`,
    );
    need(
      !normal || s.page >= s.before,
      `学習前はP.${s.before}です。「ページ進捗なし」を選択してください`,
    );
  }
}
export function reduce(input, c, now = minute()) {
  const d = structuredClone(input);
  const s = d.sessions.find((x) => x.id === c.id),
    m = d.materials.find((x) => x.id === c.id);
  const t = c.at ?? now;
  switch (c.type) {
    case "phase": {
      const x = d.phases.find((p) => p.id === c.id);
      const name = clean(c.name);
      need(
        name && !d.phases.some((p) => p.id !== c.id && p.name === name),
        "Phase名は空欄・同名を避けてください",
      );
      if (x) {
        x.name = name;
        if (x.status !== "future") {
          x.start = c.start;
          x.end = c.end || null;
        }
      } else
        d.phases.push({
          id: c.id,
          name,
          order: d.phases.length,
          status: "future",
          start: null,
          end: null,
        });
      break;
    }
    case "advance": {
      need(!active(d), "記録を保存または削除してからPhaseを進めてください");
      const p = d.phases.find((x) => x.id === c.id),
        old = d.phases.find((x) => x.id === d.current);
      need(
        p?.status === "future" &&
          p.id === d.phases.find((x) => x.status === "future")?.id,
        "次の未開始Phaseを選んでください",
      );
      if (old) {
        old.status = "past";
        old.end = c.end;
      }
      p.status = "current";
      p.start = c.start;
      d.current = p.id;
      for (const m of d.materials.filter((m) => m.phases.includes(p.id)))
        ensureBoundary(d, p.id, attempt(d, m), t);
      break;
    }
    case "material": {
      const mode = c.timeOnly ? (m?.mode ?? "time_only") : c.mode,
        total =
          mode === "time_only" ? null : c.timeOnly ? m.total : Number(c.total),
        name = clean(c.name);
      need(name, "教材名を入力してください");
      if (m) {
        const used = d.sessions.some((s) => s.material === m.id);
        need(
          !used || mode === m.mode,
          "記録済み教材の管理方法は変更できません。別教材を登録してください",
        );
        need(
          !(active(d)?.material === m.id && !c.phases.includes(d.current)),
          "学習を保存または削除してからチェックを外してください",
        );
        if (mode !== m.mode) {
          d.attempts = d.attempts.filter((a) => a.material !== m.id);
          d.boundaries = d.boundaries.filter((b) =>
            d.attempts.some((a) => a.id === b.attempt),
          );
        }
        Object.assign(m, { name, mode, total, phases: c.phases });
      } else
        d.materials.push({ id: c.id, name, mode, total, phases: c.phases });
      break;
    }
    case "deleteMaterial":
      need(
        m && !d.sessions.some((s) => s.material === m.id),
        "学習記録がある教材は削除できません。利用Phaseを外してください",
      );
      d.materials = d.materials.filter((x) => x.id !== m.id);
      d.attempts = d.attempts.filter((a) => a.material !== m.id);
      d.boundaries = d.boundaries.filter((b) =>
        d.attempts.some((a) => a.id === b.attempt),
      );
      break;
    case "start": {
      need(!active(d), "先に現在の記録を保存または削除してください");
      need(
        m && d.current && m.phases.includes(d.current),
        "現在Phaseの教材を選んでください",
      );
      let a = attempt(d, m);
      let b = ensureBoundary(d, d.current, a, t);
      const full = a.total !== null && reach(d, d.current, a.id) === a.total;
      if (full && !c.timeOnly) {
        need(
          ["continue", "new"].includes(c.choice),
          "100%教材の学習方法を選んでください",
        );
        if (c.choice === "new") {
          a = {
            id: uid(),
            material: m.id,
            total: m.total,
            number: a.number + 1,
          };
          d.attempts.push(a);
          b = ensureBoundary(d, d.current, a, t);
        }
      }
      d.sessions.push({
        id: c.sessionId,
        material: m.id,
        phase: d.current,
        attempt: a.id,
        start: t,
        end: null,
        state: "running",
        pauses: [],
        before:
          a.total === null ? null : c.timeOnly ? 0 : reach(d, d.current, a.id),
        progress: a.total === null ? "not_applicable" : "unrecorded",
        page: null,
        draft: { page: "", noChange: false },
      });
      break;
    }
    case "pause":
      need(s?.state === "running", "最新の学習状態を確認してください");
      s.pauses.push({ start: t, end: null });
      s.state = "paused";
      break;
    case "resume":
      need(s?.state === "paused", "最新の学習状態を確認してください");
      s.pauses.at(-1).end = t;
      s.state = "running";
      break;
    case "end":
      need(
        s && ["running", "paused"].includes(s.state),
        "最新の学習状態を確認してください",
      );
      if (s.state === "paused") s.pauses.at(-1).end = t;
      s.end = t;
      s.state = "ending";
      break;
    case "draft":
      need(s?.state === "ending", "入力待ちの記録を確認してください");
      s.draft = { page: String(c.page), noChange: !!c.noChange };
      break;
    case "save": {
      need(s?.state === "ending", "入力待ちの記録を確認してください");
      if (!c.timeOnly)
        progress(
          s,
          d.attempts.find((a) => a.id === s.attempt),
          c.page,
          c.noChange,
          true,
        );
      s.state = "saved";
      if (!c.timeOnly)
        s.draft = { page: String(c.page), noChange: !!c.noChange };
      break;
    }
    case "edit":
    case "add": {
      let x = s;
      if (c.type === "add") {
        x = {
          id: c.id,
          state: "saved",
          before: 0,
          draft: { page: "", noChange: false },
        };
        d.sessions.push(x);
      }
      need(x, "記録が見つかりません");
      const mat = d.materials.find((m) => m.id === c.material);
      need(mat, "教材を選んでください");
      let a = d.attempts.find(
        (a) => a.id === c.attempt && a.material === mat.id,
      );
      if (!a) {
        const aa = d.attempts.filter((a) => a.material === mat.id);
        need(c.timeOnly || aa.length <= 1, "取り組みを選んでください");
        a = (c.timeOnly ? aa.at(-1) : aa[0]) ?? attempt(d, mat);
      }
      ensureBoundary(d, c.phase, a, t);
      const moved =
        x.material !== mat.id || x.phase !== c.phase || x.attempt !== a.id;
      if (mat.mode === "pages" && moved)
        x.before = Math.max(
          d.boundaries.find((b) => b.phase === c.phase && b.attempt === a.id)
            ?.carry ?? 0,
          ...saved(d)
            .filter(
              (v) =>
                v.id !== x.id &&
                v.phase === c.phase &&
                v.attempt === a.id &&
                v.progress === "recorded" &&
                v.start <= c.start,
            )
            .map((v) => v.page),
        );
      Object.assign(x, {
        material: mat.id,
        phase: c.phase,
        attempt: a.id,
        start: c.start,
        end: c.end,
        pauses: c.pauses,
      });
      if (mat.mode === "time_only") x.before = null;
      else if (x.before === null) x.before = 0;
      if (!c.timeOnly) {
        progress(x, a, c.page, c.noChange);
        x.draft = { page: String(c.page), noChange: !!c.noChange };
      } else if (c.type === "add" || moved) {
        progress(x, a, "", false);
        x.draft = { page: "", noChange: false };
      }
      break;
    }
    case "delete":
      need(s, "記録が見つかりません");
      d.sessions = d.sessions.filter((x) => x.id !== s.id);
      break;
    case "boundary": {
      const b = d.boundaries.find((x) => x.id === c.id);
      need(b, "引継が見つかりません");
      b.carry = Number(c.carry);
      break;
    }
    case "total": {
      const a = d.attempts.find((x) => x.id === c.id);
      need(a?.total !== null, "ページ教材を選んでください");
      a.total = Number(c.total);
      break;
    }
    default:
      throw Error("操作が不明です");
  }
  d.revision++;
  validate(d, now);
  return d;
}
export function average(d, from, to, now = today()) {
  const starts = [
    ...d.phases.map((p) => p.start).filter(Boolean),
    ...saved(d).map((s) => day(s.start)),
  ].sort();
  if (!starts.length) return { days: 0, value: null, from, to };
  from = [from, starts[0]].sort().at(-1);
  to = [to, now].sort()[0];
  const days = Math.max(
    0,
    Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1,
  );
  return {
    from,
    to,
    days,
    value: days
      ? sum(
          saved(d).filter((s) => day(s.start) >= from && day(s.start) <= to),
        ) / days
      : null,
  };
}
export function streak(d, now = today()) {
  const dates = new Set(saved(d).map((s) => day(s.start)));
  const shift = (s, n) =>
    new Date(Date.parse(s) + n * 86400000).toISOString().slice(0, 10);
  let date = dates.has(now) ? now : shift(now, -1),
    count = 0;
  const yesterday = date !== now;
  while (dates.has(date)) {
    count++;
    date = shift(date, -1);
  }
  return { count, yesterday };
}
