import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const profile = await mkdtemp(join(tmpdir(), "focus-smoke-"));
let app;
try {
  app = await electron.launch({
    args: [
      ...(process.env.FOCUS_TEST_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
      "--disable-gpu",
      `--user-data-dir=${profile}`,
      ".",
    ],
  });
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { name: "Мой день." })).toBeVisible();
  expect(await page.evaluate(() => typeof window.focusDesktop.schedule)).toBe(
    "function",
  );
  await page.getByRole("button", { name: "Новая задача" }).click();
  await page
    .getByLabel("Название", { exact: true })
    .fill("Настольное напоминание");
  await page
    .getByLabel("Напоминание", { exact: true })
    .fill("2020-01-01T10:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Добавить задачу", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Пора: Настольное напоминание",
  );
  await page.reload();
  await expect(
    page.getByText("Настольное напоминание", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Напоминания", exact: true }).click();
  await expect(page.getByText(/доставлено/)).toBeVisible();
  console.log(
    "PASS: Electron window, secure preload bridge, task creation, native reminder IPC and persistence.",
  );
} finally {
  if (app) await app.close();
  await rm(profile, { recursive: true, force: true });
}
