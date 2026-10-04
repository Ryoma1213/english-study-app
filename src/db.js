import { empty, reduce, validate, minute } from "./domain.js";
export function openDB(name = "english-study-records") {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("state");
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error("別の画面を閉じて再試行してください"));
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
  });
}
export function read(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readonly"),
      r = tx.objectStore("state").get("app");
    let value;
    r.onsuccess = () => {
      try {
        value = r.result === undefined ? empty() : validate(r.result);
      } catch (e) {
        reject(e);
      }
    };
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? Error("読込みに失敗しました"));
  });
}
export function commit(db, command, expected, operationId, now = minute()) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite"),
      store = tx.objectStore("state"),
      r = store.get("app");
    let result, error;
    const signature = JSON.stringify(command);
    r.onsuccess = () => {
      try {
        const d = r.result ?? empty();
        const old = d.commands[operationId];
        if (old) {
          if (old.signature !== signature)
            throw Error("同じ操作IDの内容が異なります");
          result = d;
          return;
        }
        if (d.revision !== expected)
          throw Error(
            "別の画面で変更されました。入力を保持しています。最新状態を確認して再試行してください",
          );
        result = reduce(d, command, now);
        result.commands[operationId] = { signature, revision: result.revision };
        store.put(result, "app");
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        error ??
          tx.error ??
          Error("端末保存に失敗しました。入力を保持して再試行できます"),
      );
    tx.onerror = () => {};
  });
}
export function restore(db, backup, expected) {
  validate(backup.data);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite"),
      store = tx.objectStore("state");
    let error, result;
    const r = store.get("app");
    r.onsuccess = () => {
      try {
        if ((r.result?.revision ?? 0) !== expected)
          throw Error(
            "別の画面で変更されました。復元内容を確認し直してください",
          );
        result = structuredClone(backup.data);
        result.revision = expected + 1;
        result.commands = {};
        validate(result);
        store.put(result, "app");
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        error ??
          tx.error ??
          Error("復元に失敗しました。既存データを維持しています"),
      );
  });
}
export function parseBackup(text) {
  const b = JSON.parse(text.replace(/^\uFEFF/, ""));
  if (
    b.format !== "english-study-backup" ||
    b.version !== 1 ||
    !Number.isFinite(Date.parse(b.exportedAt))
  )
    throw Error("対応するJSONバックアップではありません");
  validate(b.data);
  return b;
}
export const backup = (d) =>
  JSON.stringify(
    {
      format: "english-study-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: d,
    },
    null,
    2,
  );
