import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  reportPageQuery,
  localReportPageWhere,
} from "../src/server/report-pagination";
import { historyCursor } from "../src/server/history-pagination";

test("report queues find old open cases before limiting and page tied timestamps without omissions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE reports(id TEXT,created_at TEXT,status TEXT)");
    for (let i = 1; i <= 135; i++)
      db.prepare("INSERT INTO reports VALUES(?,?,?)").run(
        `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        "2026-10-27T12:00:00.000Z",
        i > 130 ? "open" : "reviewed",
      );
    function read(raw: string) {
      const input = reportPageQuery(
        new URL(raw, "https://qa.invalid"),
        "listing-reports",
      );
      const { conditions, values } = localReportPageWhere(input);
      const rows = db
        .prepare(
          `SELECT * FROM reports ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY created_at DESC,id LIMIT ?`,
        )
        .all(...values, input.limit + 1) as {
        id: string;
        created_at: string;
      }[];
      return {
        rows: rows.slice(0, input.limit),
        cursor: historyCursor(input.scope, rows, input.limit),
      };
    }
    assert.equal(read("/?status=open&limit=50").rows.length, 5);
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page = read(
        "/?status=all&limit=50" + (cursor ? `&cursor=${cursor}` : ""),
      );
      ids.push(...page.rows.map((r) => r.id));
      cursor = page.cursor;
    } while (cursor);
    assert.equal(ids.length, 135);
    assert.equal(new Set(ids).size, 135);
  } finally {
    db.close();
  }
});

test("report cursor cannot cross filters or owners, and malformed filters are rejected", () => {
  const row = {
    id: "10000000-0000-4000-8000-000000000001",
    created_at: "2026-10-27T12:00:00.000Z",
  };
  const cursor = historyCursor("context-reports:owner:open", [row, row], 1);
  const url = new URL(`https://qa.invalid/?status=open&cursor=${cursor}`);
  assert.doesNotThrow(() =>
    reportPageQuery(url, "context-reports:owner", true),
  );
  assert.throws(() => reportPageQuery(url, "context-reports:other", true));
  url.searchParams.set("status", "all");
  assert.throws(() => reportPageQuery(url, "context-reports:owner", true));
  for (const query of [
    "status=oops",
    "status=open&status=all",
    "limit=1000",
    "cursor=bad",
  ])
    assert.throws(() =>
      reportPageQuery(
        new URL(`https://qa.invalid/?${query}`),
        "listing-reports",
      ),
    );
  assert.deepEqual(
    reportPageQuery(new URL("https://qa.invalid/?status=open"), "context", true)
      .states,
    ["open", "appealed"],
  );
});
