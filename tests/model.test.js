import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateData,
  initialData,
  dateKey,
  selectTasks,
  dueReminders,
} from "../src/model.js";

test("initial data can be saved and restored without loss", () => {
  const data = initialData();
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
});
test("today includes overdue but excludes completed and future tasks", () => {
  const tasks = [
    { id: "old", due: "2026-10-24" },
    { id: "today", due: "2026-10-25" },
    { id: "future", due: "2026-10-26" },
    { id: "done", due: "2026-10-25", completed: true },
    { id: "undated" },
  ];
  assert.deepEqual(
    selectTasks(tasks, "today", "", "2026-10-25").map((t) => t.id),
    ["old", "today"],
  );
  assert.deepEqual(
    selectTasks(tasks, "upcoming", "", "2026-10-25").map((t) => t.id),
    ["future"],
  );
  assert.deepEqual(
    selectTasks(tasks, "completed").map((t) => t.id),
    ["done"],
  );
});
test("search matches titles and notes in selected project, case-insensitively", () => {
  const tasks = [
    { id: "a", project: "work", title: "Отчёт", notes: "ДЛЯ КЛИЕНТА" },
    { id: "b", project: "personal", title: "Клиента" },
  ];
  assert.deepEqual(
    selectTasks(tasks, "work", "клиента").map((t) => t.id),
    ["a"],
  );
});
test("priority view excludes completed and medium priority", () => {
  assert.equal(
    selectTasks(
      [
        { priority: "high" },
        { priority: "medium" },
        { priority: "high", completed: true },
      ],
      "important",
    ).length,
    1,
  );
});
test("reminders only fire for due, incomplete, unnotified tasks", () => {
  const reminder = "2026-10-25T10:00";
  const tasks = [
    { id: "due", reminder },
    { id: "notified", reminder, notified: true },
    { id: "completed", reminder, completed: true },
    { id: "later", reminder: "2026-10-26T10:00" },
    { id: "no-reminder" },
  ];
  assert.deepEqual(
    dueReminders(tasks, new Date("2026-10-25T11:00").getTime()).map(
      (t) => t.id,
    ),
    ["due"],
  );
});
test("invalid backups are rejected rather than corrupting stored data", () => {
  assert.throws(() => validateData({ tasks: [{}], projects: [] }));
  const data = initialData();
  data.tasks.push({ ...data.tasks[0] });
  assert.throws(() => validateData(data));
  assert.throws(() =>
    validateData({
      tasks: [],
      projects: [{ id: "x", name: "x", color: "url(bad)" }],
    }),
  );
  const invalid = initialData();
  invalid.tasks[0].reminder = "not-a-date";
  assert.throws(() => validateData(invalid));
});
test("empty backup is valid", () =>
  assert.deepEqual(validateData({ tasks: [], projects: [] }), {
    tasks: [],
    projects: [],
  }));
test("dateKey uses local dates without UTC conversion", () => {
  assert.equal(dateKey(new Date(2026, 0, 2, 0, 5)), "2026-01-02");
});
