import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import nodemailer from "nodemailer";
import { createServer } from "./app.js";
const dbPath = resolve(process.env.DATA_PATH || "server/data/focus.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
const smtp = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== "false",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 15000,
      socketTimeout: 20000,
    })
  : null;
if (smtp)
  smtp
    .verify()
    .then(() => console.log("SMTP подключён"))
    .catch(() =>
      console.error(
        "SMTP недоступен: проверьте host, port, пользователя и пароль приложения.",
      ),
    );
const { app, sendReminders } = createServer({
  dbPath,
  mailer: smtp,
  from: process.env.SMTP_FROM || process.env.SMTP_USER,
  origins: (
    process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((x) => x.trim()),
});
const server = app.listen(
  Number(process.env.PORT || 3001),
  process.env.HOST || "127.0.0.1",
  () => console.log("Сервер Фокус запущен; порт " + (process.env.PORT || 3001)),
);
const timer = setInterval(
  () =>
    sendReminders().catch(() => console.error("Ошибка обработки напоминаний")),
  15000,
);
sendReminders().catch(() => console.error("Ошибка обработки напоминаний"));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
  });
