import React, { useState, useEffect, useRef } from "react";
import {
  UserRound,
  LogIn,
  LogOut,
  Camera,
  Sun,
  Moon,
  Monitor,
  RefreshCw,
} from "lucide-react";
import { STORAGE_KEY, initialData, validateData } from "./model";
const safeRead = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const sessionKey = "focus-session-v2";
export function useAccount(initial) {
  const [session, setSession] = useState(() => safeRead(sessionKey, null));
  const [data, setData] = useState(() =>
    session?.user
      ? safeRead(`focus-account-${session.user.id}`, {
          tasks: [],
          projects: [],
        })
      : initial,
  );
  const [syncError, setSyncError] = useState("");
  const [syncStatus, setSyncStatus] = useState(
    session ? "Подключение…" : "Локальный режим",
  );
  const revision = useRef(0),
    ready = useRef(false),
    epoch = useRef(0),
    last = useRef(""),
    queue = useRef(Promise.resolve());
  async function request(path, options = {}, s = session) {
    if (!s?.url) throw new Error("Укажите адрес сервера");
    const r = await fetch(s.url + "/api" + path, {
      ...options,
      signal: AbortSignal.timeout(20000),
      headers: {
        "Content-Type": "application/json",
        ...(s.token ? { Authorization: "Bearer " + s.token } : {}),
        ...options.headers,
      },
    });
    const body = await r
      .json()
      .catch(() => ({ error: "Сервер вернул неизвестный ответ" }));
    if (!r.ok) throw new Error(body.error || "Сервер недоступен");
    return body;
  }
  useEffect(() => {
    const e = ++epoch.current;
    ready.current = false;
    queue.current = Promise.resolve();
    if (!session) {
      last.current = "";
      setSyncStatus("Локальный режим");
      return;
    }
    setSyncStatus("Подключение…");
    Promise.all([request("/me"), request("/data")])
      .then(([me, remote]) => {
        if (e !== epoch.current) return;
        const validated = validateData(remote.data);
        revision.current = remote.revision;
        last.current = JSON.stringify(validated);
        setData(validated);
        ready.current = true;
        setSyncError("");
        setSyncStatus("Синхронизировано");
        setSession((s) => (s ? { ...s, user: me.user } : s));
      })
      .catch((error) => {
        if (e === epoch.current) {
          setSyncError(
            error.message +
              " · Локальная копия сохранена. Экспортируйте её перед повторным входом.",
          );
          setSyncStatus("Нет соединения");
        }
      });
  }, [session?.token, session?.url]);
  useEffect(() => {
    const key = session ? `focus-account-${session.user.id}` : STORAGE_KEY;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      setSyncError(
        "Не удалось сохранить локальную копию. Скачайте резервную копию.",
      );
    }
    if (!session || !ready.current) return;
    const serialized = JSON.stringify(data);
    if (last.current === serialized) return;
    last.current = serialized;
    const e = epoch.current;
    setSyncStatus("Сохранение…");
    queue.current = queue.current.then(async () => {
      if (e !== epoch.current || !ready.current) return;
      try {
        const result = await request("/data", {
          method: "PUT",
          body: JSON.stringify({
            data: {
              ...JSON.parse(serialized),
              tasks: JSON.parse(serialized).tasks.map((t) => ({
                ...t,
                reminder: t.reminder ? new Date(t.reminder).toISOString() : "",
              })),
            },
            revision: revision.current,
          }),
        });
        if (e !== epoch.current) return;
        revision.current = result.revision;
        setSyncStatus("Синхронизировано");
      } catch (error) {
        if (e === epoch.current) {
          ready.current = false;
          setSyncError(
            error.message +
              " · Изменения остались на этом устройстве. Скачайте резервную копию перед повторным входом.",
          );
          setSyncStatus("Ошибка синхронизации");
        }
      }
    });
  }, [data, session?.token]);
  useEffect(() => {
    try {
      session
        ? localStorage.setItem(sessionKey, JSON.stringify(session))
        : localStorage.removeItem(sessionKey);
    } catch {}
  }, [session]);
  async function login(url, mode, body) {
    const parsed = new URL(url);
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !["http:", "https:"].includes(parsed.protocol) ||
      (parsed.protocol === "http:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
    )
      throw new Error(
        "Для удалённого сервера используйте HTTPS. HTTP разрешён только для localhost.",
      );
    const address = parsed.origin;
    const result = await request(
      "/auth/" + mode,
      { method: "POST", body: JSON.stringify(body) },
      { url: address },
    );
    ready.current = false;
    setData(
      safeRead(`focus-account-${result.user.id}`, { tasks: [], projects: [] }),
    );
    setSession({ url: address, token: result.token, user: result.user });
  }
  async function logout(force = false) {
    if (syncStatus === "Сохранение…")
      throw new Error("Подождите завершения сохранения");
    if (syncError && !force)
      throw new Error(
        "Сначала скачайте резервную копию. Для выхода с неотправленными изменениями используйте кнопку ниже.",
      );
    try {
      await request("/auth/logout", { method: "POST" });
    } catch (error) {
      if (!force) throw error;
    }
    epoch.current++;
    ready.current = false;
    setSession(null);
    setData(safeRead(STORAGE_KEY, initialData()));
    setSyncError("");
  }
  return {
    data,
    setData,
    session,
    request,
    login,
    logout,
    syncError,
    syncStatus,
    updateUser: (user) => setSession((s) => ({ ...s, user })),
  };
}
export function Avatar({ user, className = "" }) {
  return user?.avatar ? (
    <img
      className={"avatar profile-photo " + className}
      src={user.avatar}
      alt="Фото профиля"
    />
  ) : (
    <span
      className={"avatar " + className}
      style={{
        background: user?.accent || undefined,
        color: user?.accent ? "white" : undefined,
      }}
    >
      {(user?.name || "Вы").slice(0, 1).toUpperCase()}
    </span>
  );
}
export function Appearance() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("focus-theme") || "system",
  );
  useEffect(() => {
    localStorage.setItem("focus-theme", theme);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return (
    <div className="appearance">
      <span>Тема интерфейса</span>
      <div>
        {[
          ["light", "Светлая", Sun],
          ["dark", "Тёмная", Moon],
          ["system", "Как в системе", Monitor],
        ].map(([value, label, Icon]) => (
          <button
            type="button"
            key={value}
            aria-pressed={theme === value}
            className={"secondary " + (theme === value ? "chosen" : "")}
            onClick={() => setTheme(value)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
export function AccountPanel({ account }) {
  const { session, request, login, logout, updateUser, syncStatus, syncError } =
    account;
  const [mode, setMode] = useState("login"),
    [url, setUrl] = useState(
      () => localStorage.getItem("focus-server-url") || "http://127.0.0.1:3001",
    );
  const [name, setName] = useState(session?.user.name || ""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [currentPassword, setCurrentPassword] = useState("");
  const [bio, setBio] = useState(session?.user.bio || ""),
    [avatar, setAvatar] = useState(session?.user.avatar || ""),
    [accent, setAccent] = useState(session?.user.accent || "#6465d9");
  const [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const file = useRef();
  useEffect(() => {
    if (session) {
      setName(session.user.name);
      setBio(session.user.bio || "");
      setAvatar(session.user.avatar || "");
      setAccent(session.user.accent || "#6465d9");
    }
  }, [session?.user]);
  async function act(action) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error.message || "Не удалось связаться с сервером");
    } finally {
      setBusy(false);
    }
  }
  async function photo(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
      f.size > 10000000
    )
      return setMessage("Выберите JPG, PNG или WebP размером до 10 МБ");
    try {
      const bitmap = await createImageBitmap(f);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const size = Math.min(bitmap.width, bitmap.height);
      canvas
        .getContext("2d")
        .drawImage(
          bitmap,
          (bitmap.width - size) / 2,
          (bitmap.height - size) / 2,
          size,
          size,
          0,
          0,
          256,
          256,
        );
      bitmap.close();
      setAvatar(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      setMessage("Не удалось прочитать фотографию");
    }
  }
  if (session && syncStatus === "Подключение…")
    return <p className="muted">Подключение к аккаунту…</p>;
  if (!session)
    return (
      <section className="account-panel">
        <div className="modal-icon">
          <UserRound size={24} />
        </div>
        <h2>{mode === "login" ? "Вход в Фокус" : "Создать аккаунт"}</h2>
        <p className="muted small">
          Сервер на вашем ПК хранит аккаунты и отправляет письма. После входа
          загрузятся задачи аккаунта; локальные задачи останутся в гостевом
          режиме. Перед входом сохраните резервную копию.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await login(url, mode, { name, email, password });
              localStorage.setItem("focus-server-url", url);
              setPassword("");
            });
          }}
        >
          <label className="field">
            Адрес сервера
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:3001"
            />
          </label>
          {mode === "register" && (
            <label className="field">
              Ваше имя
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="field">
            Электронная почта
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            Пароль
            <input
              type="password"
              required
              minLength={mode === "register" ? 10 : 1}
              maxLength={200}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message && (
            <p role="alert" className="account-message">
              {message}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Подключение…"
              : mode === "login"
                ? "Войти"
                : "Зарегистрироваться"}
          </button>
          <button
            type="button"
            className="text-button full"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setMessage("");
            }}
          >
            {mode === "login"
              ? "Нет аккаунта? Зарегистрироваться"
              : "Уже есть аккаунт? Войти"}
          </button>
        </form>
      </section>
    );
  return (
    <section className="account-panel">
      <h2>Мой профиль</h2>
      <div className="photo-editor">
        <Avatar user={{ ...session.user, avatar, accent, name }} />
        <div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => file.current.click()}
          >
            <Camera size={15} />
            Загрузить фото
          </button>
          {avatar && (
            <button className="text-button" onClick={() => setAvatar("")}>
              Убрать фото
            </button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp"
          onChange={photo}
        />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            const result = await request("/me", {
              method: "PUT",
              body: JSON.stringify({
                name,
                bio,
                avatar,
                accent,
                ...(password ? { password, currentPassword } : {}),
              }),
            });
            updateUser(result.user);
            setPassword("");
            setCurrentPassword("");
            setMessage("Профиль сохранён");
          });
        }}
      >
        <label className="field">
          Имя
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          О себе
          <textarea
            aria-label="О себе"
            maxLength={280}
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Пара слов о вас и ваших целях"
          />
        </label>
        <label className="field">
          Цвет профиля
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
          />
        </label>
        <p className="muted small">
          {session.user.email} ·{" "}
          {session.user.verified
            ? "Почта подтверждена"
            : "Почта не подтверждена"}
        </p>
        <details>
          <summary>Изменить пароль</summary>
          <label className="field">
            Текущий пароль
            <input
              type="password"
              maxLength={200}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="field">
            Новый пароль
            <input
              type="password"
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </details>
        <button className="primary full" disabled={busy}>
          Сохранить профиль
        </button>
      </form>
      {!session.user.verified && (
        <div className="verification">
          <p className="small muted">
            Для напоминаний на почту подтвердите адрес кодом из письма.
          </p>
          <button
            className="secondary full"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await request("/auth/verification", { method: "POST" });
                setMessage("Код отправлен. Проверьте папку «Спам».");
              })
            }
          >
            Отправить код на почту
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                const r = await request("/auth/verify", {
                  method: "POST",
                  body: JSON.stringify({ code }),
                });
                updateUser(r.user);
                setMessage("Почта подтверждена");
              });
            }}
          >
            <label className="field">
              Код из письма
              <input
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button className="secondary full" disabled={busy}>
              Подтвердить почту
            </button>
          </form>
        </div>
      )}
      {message && (
        <p role="status" className="account-message">
          {message}
        </p>
      )}
      <p className="small muted">
        {syncStatus} · {session.url}
      </p>
      {syncError && (
        <p role="alert" className="account-message">
          {syncError}
        </p>
      )}
      <button
        className="text-button"
        disabled={busy}
        onClick={() => act(() => logout())}
      >
        <LogOut size={16} />
        Выйти
      </button>
      {syncError && (
        <button
          className="secondary full"
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                "Вы сохранили JSON-копию? При повторном входе загрузятся серверные данные. Неотправленные изменения могут быть потеряны без экспорта.",
              )
            )
              act(() => logout(true));
          }}
        >
          Выйти после сохранения резервной копии
        </button>
      )}
    </section>
  );
}
