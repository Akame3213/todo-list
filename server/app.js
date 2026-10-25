import express from "express";
import { rateLimit } from "express-rate-limit";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { validateData } from "../src/model.js";
const scrypt = promisify(scryptCallback);
const hash = (s) => createHash("sha256").update(s).digest("hex");
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  verified: !!u.verified,
  avatar: u.avatar || "",
  bio: u.bio || "",
  accent: u.accent || "#6465d9",
});
const empty = { tasks: [], projects: [] };
export function createServer({
  dbPath = ":memory:",
  mailer = null,
  from = "Фокус <focus@localhost>",
  origins = [],
} = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,verified INTEGER DEFAULT 0,code TEXT,code_until INTEGER,code_sent INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS data(user_id TEXT PRIMARY KEY REFERENCES users(id),body TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS deliveries(user_id TEXT,task_id TEXT,reminder TEXT,sent INTEGER DEFAULT 0,attempt INTEGER DEFAULT 0,PRIMARY KEY(user_id,task_id,reminder));`);
  for (const [name, type] of [
    ["avatar", "TEXT DEFAULT ''"],
    ["bio", "TEXT DEFAULT ''"],
    ["accent", "TEXT DEFAULT '#6465d9'"],
  ]) {
    if (
      !db
        .prepare("PRAGMA table_info(users)")
        .all()
        .some((c) => c.name === name)
    )
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin && origin !== "null" && !origins.includes(origin))
      return res
        .status(403)
        .json({ error: "Этот адрес приложения не разрешён на сервере" });
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "5mb" }));
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Слишком много попыток. Повторите через 15 минут." },
  });
  const registerLimit = rateLimit({
    windowMs: 3600000,
    limit: 5,
    message: { error: "Лимит регистраций. Повторите через час." },
  });
  const auth = (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) return res.status(401).json({ error: "Войдите в аккаунт" });
    const session = db
      .prepare("SELECT * FROM sessions WHERE token=? AND expires>?")
      .get(hash(token), Date.now());
    if (!session)
      return res.status(401).json({ error: "Сессия истекла. Войдите снова" });
    req.user = db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(session.user_id);
    req.token = hash(token);
    next();
  };
  const session = (u) => {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(token),
      u.id,
      Date.now() + 7 * 86400000,
    );
    return { token, user: publicUser(u) };
  };
  const passwordHash = async (password) => {
    const salt = randomBytes(16).toString("hex");
    return salt + ":" + (await scrypt(password, salt, 64)).toString("hex");
  };
  const passwordMatch = async (password, stored) => {
    const [salt, key] = stored.split(":");
    return timingSafeEqual(
      Buffer.from(key, "hex"),
      await scrypt(password, salt, 64),
    );
  };
  const validPassword = (p) =>
    typeof p === "string" && p.length >= 10 && p.length <= 200;
  async function verification(u) {
    if (!mailer) return false;
    if (Date.now() - u.code_sent < 60000)
      throw Object.assign(
        new Error("Повторная отправка доступна через минуту"),
        { status: 429 },
      );
    const code = String(randomInt(100000, 1000000));
    db.prepare(
      "UPDATE users SET code=?,code_until=?,code_sent=? WHERE id=?",
    ).run(hash(code), Date.now() + 15 * 60000, Date.now(), u.id);
    await mailer.sendMail({
      from,
      to: u.email,
      subject: "Фокус — подтверждение почты",
      text: `Код подтверждения: ${code}\nОн действует 15 минут. Если вы не создавали аккаунт, проигнорируйте письмо.`,
    });
    return true;
  }
  app.get("/api/health", (_q, r) =>
    r.json({ ok: true, emailConfigured: !!mailer }),
  );
  app.post("/api/auth/register", registerLimit, authLimit, async (req, res) => {
    const { email, name, password } = req.body || {};
    if (
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      email.length > 254 ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 80 ||
      !validPassword(password)
    )
      return res
        .status(400)
        .json({
          error: "Укажите имя, корректную почту и пароль от 10 до 200 символов",
        });
    const address = email.trim().toLowerCase();
    if (db.prepare("SELECT id FROM users WHERE email=?").get(address))
      return res
        .status(409)
        .json({ error: "Аккаунт с этой почтой уже существует" });
    const id = randomBytes(16).toString("hex");
    const pass = await passwordHash(password);
    try {
      db.prepare(
        "INSERT INTO users(id,email,name,password) VALUES(?,?,?,?)",
      ).run(id, address, name.trim(), pass);
    } catch (e) {
      if (e.code?.includes("CONSTRAINT"))
        return res.status(409).json({ error: "Аккаунт уже существует" });
      throw e;
    }
    db.prepare("INSERT INTO data VALUES(?,?,0)").run(id, JSON.stringify(empty));
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(id);
    let verificationSent = false;
    try {
      verificationSent = await verification(user);
    } catch {}
    res.status(201).json({ ...session(user), verificationSent });
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const { email, password } = req.body || {};
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      password.length > 200
    )
      return res.status(400).json({ error: "Укажите почту и пароль" });
    const u = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.trim().toLowerCase());
    // Spend the same key-derivation work for unknown addresses.
    const valid = await passwordMatch(
      password,
      u?.password || "00000000000000000000000000000000:" + "00".repeat(64),
    );
    if (!u || !valid)
      return res.status(401).json({ error: "Неверная почта или пароль" });
    res.json(session(u));
  });
  app.post("/api/auth/logout", auth, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(req.token);
    res.json({ ok: true });
  });
  app.get("/api/me", auth, (req, res) =>
    res.json({ user: publicUser(req.user), emailConfigured: !!mailer }),
  );
  app.put("/api/me", auth, authLimit, async (req, res) => {
    const {
      name,
      password,
      currentPassword,
      bio = "",
      avatar = "",
      accent = "#6465d9",
    } = req.body || {};
    if (
      typeof bio !== "string" ||
      bio.length > 280 ||
      typeof avatar !== "string" ||
      avatar.length > 200000 ||
      (avatar &&
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)) ||
      !/^#[0-9a-f]{6}$/i.test(accent)
    )
      return res
        .status(400)
        .json({
          error: "Некорректные данные профиля или слишком большое фото",
        });
    if (typeof name !== "string" || !name.trim() || name.length > 80)
      return res
        .status(400)
        .json({ error: "Имя должно содержать от 1 до 80 символов" });
    if (password) {
      if (
        !validPassword(password) ||
        typeof currentPassword !== "string" ||
        currentPassword.length > 200 ||
        !(await passwordMatch(currentPassword, req.user.password))
      )
        return res
          .status(400)
          .json({
            error:
              "Проверьте текущий пароль. Новый пароль — минимум 10 символов",
          });
      db.prepare("UPDATE users SET password=? WHERE id=?").run(
        await passwordHash(password),
        req.user.id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=? AND token<>?").run(
        req.user.id,
        req.token,
      );
    }
    db.prepare(
      "UPDATE users SET name=?,bio=?,avatar=?,accent=? WHERE id=?",
    ).run(name.trim(), bio, avatar, accent, req.user.id);
    res.json({
      user: publicUser(
        db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id),
      ),
    });
  });
  app.post("/api/auth/verification", auth, authLimit, async (req, res) => {
    if (!mailer)
      return res.status(503).json({ error: "SMTP ещё не настроен на сервере" });
    await verification(req.user);
    res.json({ ok: true });
  });
  app.post("/api/auth/verify", auth, authLimit, (req, res) => {
    const { code } = req.body || {};
    if (
      typeof code !== "string" ||
      !req.user.code ||
      req.user.code_until < Date.now() ||
      hash(code) !== req.user.code
    )
      return res.status(400).json({ error: "Неверный или просроченный код" });
    db.prepare("UPDATE users SET verified=1,code=NULL WHERE id=?").run(
      req.user.id,
    );
    res.json({ user: publicUser({ ...req.user, verified: 1 }) });
  });
  app.get("/api/data", auth, (req, res) => {
    const d = db.prepare("SELECT * FROM data WHERE user_id=?").get(req.user.id);
    res.json({ data: JSON.parse(d.body), revision: d.revision });
  });
  app.put("/api/data", auth, (req, res) => {
    let data;
    try {
      data = validateData(req.body.data);
    } catch {
      return res.status(400).json({ error: "Некорректные задачи" });
    }
    for (const t of data.tasks) {
      if (t.reminder && !/(Z|[+-]\d{2}:\d{2})$/.test(t.reminder))
        return res
          .status(400)
          .json({ error: "Напоминание должно содержать часовой пояс" });
      if (t.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.dueTime))
        return res.status(400).json({ error: "Некорректное время задачи" });
    }
    const revision = req.body.revision;
    if (!Number.isSafeInteger(revision) || revision < 0)
      return res.status(400).json({ error: "Некорректная версия данных" });
    const result = db
      .prepare(
        "UPDATE data SET body=?,revision=revision+1 WHERE user_id=? AND revision=?",
      )
      .run(JSON.stringify(data), req.user.id, revision);
    if (!result.changes)
      return res
        .status(409)
        .json({
          error:
            "Задачи изменены на другом устройстве. Скачайте локальную копию и войдите снова, чтобы загрузить серверную версию.",
        });
    res.json({ revision: revision + 1 });
  });
  let busy = false;
  async function sendReminders() {
    if (busy || !mailer) return;
    busy = true;
    try {
      const users = db
        .prepare(
          "SELECT u.id,u.email,d.body FROM users u JOIN data d ON u.id=d.user_id WHERE u.verified=1",
        )
        .all();
      for (const u of users)
        for (const t of JSON.parse(u.body).tasks) {
          if (
            t.completed ||
            !t.emailReminder ||
            !t.reminder ||
            Date.parse(t.reminder) > Date.now()
          )
            continue;
          const entry = db
            .prepare(
              "SELECT * FROM deliveries WHERE user_id=? AND task_id=? AND reminder=?",
            )
            .get(u.id, t.id, t.reminder);
          if (entry?.sent || entry?.attempt > Date.now() - 300000) continue;
          db.prepare(
            "INSERT INTO deliveries(user_id,task_id,reminder,attempt) VALUES(?,?,?,?) ON CONFLICT(user_id,task_id,reminder) DO UPDATE SET attempt=excluded.attempt",
          ).run(u.id, t.id, t.reminder, Date.now());
          try {
            await mailer.sendMail({
              from,
              to: u.email,
              subject: "Фокус — напоминание о задаче",
              text: `${t.title}\n${t.notes || ""}\nСрок: ${t.due || "не указан"} ${t.dueTime || ""}\nВремя напоминания: ${t.reminder}`,
            });
            db.prepare(
              "UPDATE deliveries SET sent=1 WHERE user_id=? AND task_id=? AND reminder=?",
            ).run(u.id, t.id, t.reminder);
          } catch {
            console.error(
              "Не удалось отправить напоминание; повтор через 5 минут. Проверьте SMTP.",
            );
          }
        }
    } finally {
      busy = false;
    }
  }
  app.use((error, _req, res, _next) => {
    if (error.status === 429)
      return res.status(429).json({ error: error.message });
    res
      .status(error.type === "entity.too.large" ? 413 : 500)
      .json({ error: "Ошибка сервера. Проверьте настройки и размер запроса." });
  });
  return { app, db, sendReminders };
}
