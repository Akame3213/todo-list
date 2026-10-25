import { test, expect } from "@playwright/test";

test("create, persist, search, edit, complete, restore and delete a task", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая задача" }).click();
  await page
    .getByLabel("Название", { exact: true })
    .fill("Проверить готовое приложение");
  await page.getByLabel("Заметки").fill("Подробности проверки");
  await page.getByRole("button", { name: "Высокий", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Проект", exact: true })
    .selectOption("work");
  await page
    .getByRole("button", { name: "Добавить задачу", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Проверить готовое приложение", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Проверить готовое приложение", { exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Поиск задач" }).fill("готовое");
  await expect(page.locator(".task-list .task-row")).toHaveCount(1);
  await page.getByText("Проверить готовое приложение", { exact: true }).click();
  await page.getByLabel("Название", { exact: true }).fill("Проверка завершена");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("textbox", { name: "Поиск задач" }).fill("");
  await page
    .getByRole("button", {
      name: "Выполнить задачу: Проверка завершена",
      exact: true,
    })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: /Выполненные/ })
    .click();
  await expect(
    page.getByText("Проверка завершена", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Вернуть задачу: Проверка завершена",
      exact: true,
    })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: /Все задачи/ })
    .click();
  await page.getByText("Проверка завершена", { exact: true }).click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByRole("button", { name: "Точно удалить?", exact: true })
    .click();
  await expect(
    page.getByText("Проверка завершена", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(
    page.getByText("Проверка завершена", { exact: true }),
  ).toBeVisible();
});

test("create a project and attach a task", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Добавить проект", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill("Мой новый проект");
  await page
    .getByRole("button", { name: "Создать проект", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Мой новый проект." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Новая задача" }).click();
  await expect(
    page.getByRole("combobox", { name: "Проект", exact: true }),
  ).not.toHaveValue("");
  await page
    .getByLabel("Название", { exact: true })
    .fill("Первая задача проекта");
  await page
    .getByRole("button", { name: "Добавить задачу", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Первая задача проекта", { exact: true }),
  ).toBeVisible();
});

test("overdue reminders are delivered once and survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая задача" }).click();
  await page
    .getByLabel("Название", { exact: true })
    .fill("Напоминание для теста");
  await page
    .getByLabel("Напоминание", { exact: true })
    .fill("2020-01-01T10:00");
  await page
    .getByRole("button", { name: "Добавить задачу", exact: true })
    .last()
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Пора: Напоминание для теста",
  );
  await page.reload();
  await page.waitForTimeout(1300);
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Напоминания", exact: true }).click();
  await expect(page.getByText(/доставлено/)).toBeVisible();
});

test("backup export and restore preserves data", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Ваше пространство/ }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать резервную копию", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^focus-.*\.json$/);
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        projects: [],
        tasks: [
          {
            id: "restored",
            title: "Восстановленная задача",
            priority: "high",
            completed: false,
          },
        ],
      }),
    ),
  });
  await page
    .getByRole("button", { name: "Заменить данные", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: /Все задачи/ })
    .click();
  await expect(
    page.getByText("Восстановленная задача", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".task-list .task-row")).toHaveCount(1);
});

test("mobile layout stays inside viewport and navigation works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /Все задачи/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Все задачи." }),
  ).toBeVisible();
});

test("themes, registration, customizable profile and server-saved exact reminder time", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Ваше пространство/ }).click();
  await page.getByRole("button", { name: "Тёмная", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", {
      name: "Нет аккаунта? Зарегистрироваться",
      exact: true,
    })
    .click();
  const email = `browser-${Date.now()}@example.com`;
  await page.getByLabel("Ваше имя", { exact: true }).fill("Тест профиля");
  await page.getByLabel("Электронная почта", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("browser-password-123");
  await page
    .getByRole("button", { name: "Зарегистрироваться", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Мой профиль" }),
  ).toBeVisible();
  await page.getByLabel("Имя", { exact: true }).fill("Новое имя");
  await page.getByLabel("О себе", { exact: true }).fill("Мои новые цели");
  await page
    .locator(".photo-editor input[type=file]")
    .setInputFiles("build/icon.png");
  await expect(page.locator(".photo-editor img")).toHaveAttribute(
    "src",
    /^data:image\/jpeg/,
  );
  await page
    .getByRole("button", { name: "Сохранить профиль", exact: true })
    .click();
  await expect(
    page.getByText("Профиль сохранён", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть окно", exact: true }).click();
  await page.getByRole("button", { name: "Новая задача" }).click();
  await page
    .getByLabel("Название", { exact: true })
    .fill("Задача с точным временем");
  await page.getByLabel("Точное время задачи", { exact: true }).fill("14:35");
  await page
    .getByLabel("Напоминание", { exact: true })
    .fill("2030-01-01T14:30");
  await page.getByLabel("Также отправить на почту профиля").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Добавить задачу", exact: true })
    .click();
  await expect(page.locator(".list-footer")).toContainText("Синхронизировано");
  await page.reload();
  await expect(
    page.getByText("Задача с точным временем", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("14:35", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Мой профиль", exact: true }).click();
  await expect(page.getByLabel("О себе", { exact: true })).toHaveValue(
    "Мои новые цели",
  );
  await page.getByRole("button", { name: "Светлая", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Вход в Фокус" }),
  ).toBeVisible();
});
