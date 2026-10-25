import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Sun,
  Layers,
  CalendarDays,
  Flag,
  CheckCheck,
  Plus,
  Search,
  Bell,
  ArrowUpRight,
  MoreHorizontal,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Download,
  Upload,
  Trash2,
  Pencil,
  Leaf,
  CircleHelp,
  Menu,
  Calendar,
  Clock,
  NotebookPen,
} from "lucide-react";
import {
  STORAGE_KEY,
  priorities,
  initialData,
  validateData,
  dateKey,
  selectTasks,
  dueReminders,
} from "./model";
import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "@fontsource/golos-text/700.css";
import "./styles.css";

const names = {
  today: "Мой день",
  all: "Все задачи",
  upcoming: "Предстоящие",
  important: "Важные",
  completed: "Выполненные",
};
const navItems = [
  ["today", Sun],
  ["all", Layers],
  ["upcoming", CalendarDays],
  ["important", Flag],
  ["completed", CheckCheck],
];
const niceDate = (date, options) =>
  new Intl.DateTimeFormat("ru-RU", options).format(date);
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return {
      data: raw ? validateData(JSON.parse(raw)) : initialData(),
      error: false,
    };
  } catch {
    return { data: { tasks: [], projects: [] }, error: true };
  }
}
const loaded = load();

function App() {
  const [data, setData] = useState(loaded.data);
  const [storageError, setStorageError] = useState(loaded.error);
  const [view, setView] = useState("today");
  const [day, setDay] = useState(dateKey());
  const [now, setNow] = useState(new Date());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("priority");
  const [modal, setModal] = useState(null);
  const [panel, setPanel] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [toast, setToast] = useState(null);
  const [undo, setUndo] = useState(null);
  const searchRef = useRef();
  const fileRef = useRef();
  const today = dateKey(now);
  const tasks = data.tasks;
  const notify = (message) => setToast(message);
  const updateTasks = (updater) =>
    setData((d) => ({ ...d, tasks: updater(d.tasks) }));

  useEffect(() => {
    if (loaded.error && storageError) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [data]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const keyboard = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setModal({ type: "task" });
      }
      if (e.key === "Escape") {
        setModal(null);
        setPanel(false);
        setSidebar(false);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  useEffect(() => {
    if (!window.focusDesktop) return;
    const off = window.focusDesktop.onReminder((id) => {
      updateTasks((ts) =>
        ts.map((t) => (t.id === id ? { ...t, notified: true } : t)),
      );
      const task = tasks.find((t) => t.id === id);
      if (task) notify(`Пора: ${task.title}`);
    });
    window.focusDesktop.schedule(tasks);
    return off;
  }, [tasks]);
  useEffect(() => {
    if (window.focusDesktop) return;
    const due = dueReminders(tasks, now.getTime());
    if (!due.length) return;
    for (const t of due) {
      if ("Notification" in window && Notification.permission === "granted")
        new Notification("Фокус · Напоминание", { body: t.title });
    }
    notify(
      due.length === 1
        ? `Пора: ${due[0].title}`
        : `Напоминание: ${due.length} задачи ждут вас`,
    );
    updateTasks((ts) =>
      ts.map((t) =>
        due.some((d) => d.id === t.id) ? { ...t, notified: true } : t,
      ),
    );
  }, [now, tasks]);

  const visible = selectTasks(
    tasks,
    view,
    search,
    view === "today" ? day : today,
  ).sort((a, b) =>
    sort === "priority"
      ? ["high", "medium", "low"].indexOf(a.priority) -
        ["high", "medium", "low"].indexOf(b.priority)
      : sort === "date"
        ? (a.due || "9999").localeCompare(b.due || "9999")
        : a.title.localeCompare(b.title, "ru"),
  );
  const daily = tasks.filter((t) => t.due === day);
  const done = daily.filter((t) => t.completed).length;
  const percent = daily.length ? Math.round((done / daily.length) * 100) : 0;
  const pending = tasks.filter((t) => !t.completed);
  const title =
    names[view] || data.projects.find((p) => p.id === view)?.name || "Задачи";
  const reminders = tasks
    .filter((t) => !t.completed && t.reminder)
    .sort((a, b) => a.reminder.localeCompare(b.reminder));
  const navigate = (id) => {
    setView(id);
    setSearch("");
    setSidebar(false);
  };
  function toggle(id) {
    updateTasks((ts) =>
      ts.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  }
  function remove(task) {
    updateTasks((ts) => ts.filter((t) => t.id !== task.id));
    setUndo(task);
    notify("Задача удалена");
    setModal(null);
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `focus-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Резервная копия сохранена");
  }
  async function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5000000)
        throw new Error("Файл слишком большой (максимум 5 МБ)");
      const next = validateData(JSON.parse(await file.text()));
      setModal({ type: "import", data: next });
    } catch (error) {
      notify(
        error instanceof SyntaxError
          ? "Не удалось прочитать JSON-файл"
          : error.message,
      );
    }
    e.target.value = "";
  }
  return (
    <div className="app">
      {sidebar && (
        <div className="sidebar-scrim" onClick={() => setSidebar(false)} />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("today");
          }}
        >
          <span className="brand-icon">
            <Check size={24} strokeWidth={3} />
          </span>{" "}
          фокус<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">ЛИЧНОЕ ПРОСТРАНСТВО</div>
        <nav>
          {navItems.map(([id, Icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{names[id]}</span>
              <span className="nav-count">
                {selectTasks(tasks, id, "", today).length || ""}
              </span>
            </button>
          ))}
        </nav>
        <div className="projects-heading">
          <span>МОИ ПРОЕКТЫ</span>
          <button
            className="icon-button"
            aria-label="Добавить проект"
            onClick={() => setModal({ type: "project" })}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="projects">
          {data.projects.map((p) => (
            <button
              key={p.id}
              className={`nav-item project-nav ${view === p.id ? "active" : ""}`}
              onClick={() => navigate(p.id)}
            >
              <span className="project-dot" style={{ background: p.color }} />
              <span>{p.name}</span>
              <span className="nav-count">
                {pending.filter((t) => t.project === p.id).length || ""}
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <Leaf size={22} />
            <p>
              Маленькие шаги.
              <br />
              <strong>Большие перемены.</strong>
            </p>
            <span>Двигайтесь в своём темпе.</span>
          </div>
          <button
            className="profile"
            onClick={() => setModal({ type: "settings" })}
          >
            <span className="avatar">В</span>
            <span>
              <strong>Ваше пространство</strong>
              <small>Всё под контролем</small>
            </span>
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Меню"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <span>Моё пространство</span>
            <span className="slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <label className="search">
              <Search size={17} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Найти задачу…"
                aria-label="Поиск задач"
              />
              <kbd>⌘ K</kbd>
            </label>
            <button
              className={`icon-button notification-button ${panel ? "selected" : ""}`}
              aria-label="Напоминания"
              onClick={() => setPanel(!panel)}
            >
              <Bell size={20} />
              {reminders.length > 0 && <i />}
            </button>
            <span className="top-avatar">В</span>
          </div>
        </header>
        {storageError && (
          <div className="storage-warning">
            Не удалось прочитать или сохранить данные. Скачайте резервную копию
            перед закрытием приложения.{" "}
            <button onClick={exportData}>Скачать</button>
          </div>
        )}
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {niceDate(now, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </div>
              <h1>
                {title}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === "today"
                  ? "Освободите голову. Сосредоточьтесь на главном."
                  : view === "completed"
                    ? "Каждая завершённая задача — шаг вперёд."
                    : "У каждого большого дела есть первый маленький шаг."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => setModal({ type: "task" })}
            >
              <Plus size={19} />
              Новая задача<kbd>N</kbd>
            </button>
          </div>
          <div className="content-grid">
            <section className="task-column">
              {view === "today" && (
                <div className="week-strip">
                  <button
                    className="icon-button week-arrow"
                    aria-label="Предыдущая неделя"
                    onClick={() => {
                      const d = new Date(day + "T12:00:00");
                      d.setDate(d.getDate() - 7);
                      setDay(dateKey(d));
                    }}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  {Array.from({ length: 7 }, (_, i) => {
                    const selected = new Date(day + "T12:00:00");
                    const weekday = (selected.getDay() + 6) % 7;
                    selected.setDate(selected.getDate() - weekday + i);
                    const key = dateKey(selected);
                    return (
                      <button
                        key={key}
                        className={`day ${key === day ? "selected" : ""} ${key === today ? "is-today" : ""}`}
                        onClick={() => setDay(key)}
                      >
                        <span>{niceDate(selected, { weekday: "short" })}</span>
                        <strong>{selected.getDate()}</strong>
                        <i
                          className={
                            tasks.some((t) => t.due === key && !t.completed)
                              ? "has-tasks"
                              : ""
                          }
                        />
                      </button>
                    );
                  })}
                  <button
                    className="icon-button week-arrow"
                    aria-label="Следующая неделя"
                    onClick={() => {
                      const d = new Date(day + "T12:00:00");
                      d.setDate(d.getDate() + 7);
                      setDay(dateKey(d));
                    }}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              )}
              <div className="list-toolbar">
                <div>
                  <h2>
                    {view === "today"
                      ? day === today
                        ? "Задачи на сегодня"
                        : niceDate(new Date(day + "T12:00:00"), {
                            day: "numeric",
                            month: "long",
                          })
                      : "Список задач"}
                  </h2>
                  <span className="count-pill">{visible.length}</span>
                </div>
                <label className="sort-control">
                  <SlidersHorizontal size={15} />
                  <select
                    aria-label="Сортировка"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="priority">По приоритету</option>
                    <option value="date">По сроку</option>
                    <option value="name">По названию</option>
                  </select>
                </label>
              </div>
              <div className="task-list">
                {visible.length ? (
                  visible.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      project={data.projects.find((p) => p.id === task.project)}
                      today={today}
                      toggle={() => toggle(task.id)}
                      edit={() => setModal({ type: "task", task })}
                    />
                  ))
                ) : (
                  <div className="empty-state">
                    <span>
                      <CheckCheck size={32} />
                    </span>
                    <h3>
                      {search
                        ? "Ничего не нашлось"
                        : view === "completed"
                          ? "Первые победы впереди"
                          : "Можно выдохнуть"}
                    </h3>
                    <p>
                      {search
                        ? "Попробуйте другое слово или откройте «Все задачи»."
                        : view === "completed"
                          ? "Завершённые задачи появятся здесь."
                          : "Здесь пока нет задач. Добавьте то, что важно для вас."}
                    </p>
                    {!search && view !== "completed" && (
                      <button
                        className="text-button"
                        onClick={() => setModal({ type: "task" })}
                      >
                        <Plus size={16} />
                        Добавить задачу
                      </button>
                    )}
                  </div>
                )}
              </div>
              {view !== "completed" && (
                <button
                  className="add-task"
                  onClick={() => setModal({ type: "task" })}
                >
                  <Plus size={19} />
                  <span>Добавить задачу</span>
                  <kbd>Ctrl N</kbd>
                </button>
              )}
              {view === "today" && daily.some((t) => t.completed) && (
                <details className="completed-section">
                  <summary>
                    <CheckCheck size={16} />
                    Выполнено <span>{done}</span>
                  </summary>
                  {daily
                    .filter((t) => t.completed)
                    .map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        project={data.projects.find(
                          (p) => p.id === task.project,
                        )}
                        today={today}
                        toggle={() => toggle(task.id)}
                        edit={() => setModal({ type: "task", task })}
                      />
                    ))}
                </details>
              )}
              <div className="list-footer">
                <span className="tiny-dot" />
                Все изменения сохраняются на этом устройстве
              </div>
            </section>
            <aside className="insights">
              <section className="progress-card">
                <div className="card-eyebrow">
                  ВАШ ПРОГРЕСС
                  <ArrowUpRight size={17} />
                </div>
                <h2>Хороший темп</h2>
                <p>Каждое дело имеет значение.</p>
                <div
                  className="progress-ring"
                  style={{ "--progress": `${percent}%` }}
                >
                  <div>
                    <strong>
                      {percent}
                      <small>%</small>
                    </strong>
                    <span>на сегодня</span>
                  </div>
                </div>
                <div className="progress-stats">
                  <div>
                    <strong>
                      {done}
                      <span> / {daily.length}</span>
                    </strong>
                    <span>задач выполнено</span>
                  </div>
                  <span className="mini-check">
                    <Check size={18} />
                  </span>
                </div>
                <div className="progress-line">
                  <span style={{ width: `${percent}%` }} />
                </div>
                <p className="progress-caption">
                  {percent === 100 && daily.length
                    ? "Отличная работа! Время отдохнуть."
                    : "Не спешите. Просто продолжайте."}
                </p>
              </section>
              <section className="focus-card">
                <span className="focus-icon">
                  <Leaf size={21} />
                </span>
                <span className="card-eyebrow">МЫСЛЬ ДНЯ</span>
                <blockquote>
                  Не нужно делать всё.
                  <br />
                  Нужно делать то,
                  <br />
                  <em>что действительно важно.</em>
                </blockquote>
                <div className="quote-line" />
                <small>Меньше шума. Больше фокуса.</small>
                <div className="abstract-leaf leaf-one" />
                <div className="abstract-leaf leaf-two" />
              </section>
              <button
                className="help-link"
                onClick={() => setModal({ type: "help" })}
              >
                <CircleHelp size={16} />
                Как устроен Фокус
              </button>
            </aside>
          </div>
          <footer className="page-footer">
            <span>Место для ясных мыслей и важных дел.</span>
            <span>
              Сделано для спокойной продуктивности <Leaf size={13} />
            </span>
          </footer>
        </main>
      </div>
      {panel && (
        <section className="notifications-panel">
          <div className="panel-heading">
            <h3>Напоминания</h3>
            <button
              className="icon-button"
              aria-label="Закрыть напоминания"
              onClick={() => setPanel(false)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="muted small">
            Напоминания приходят, пока приложение открыто. Пропущенные — при
            следующем запуске.
          </p>
          {!window.focusDesktop && (
            <button
              className="secondary full"
              onClick={async () => {
                if (!("Notification" in window))
                  return notify("Браузер не поддерживает уведомления");
                const result = await Notification.requestPermission();
                notify(
                  result === "granted"
                    ? "Уведомления включены"
                    : "Системные уведомления не разрешены. Напоминания появятся внутри приложения.",
                );
              }}
            >
              Включить системные уведомления
            </button>
          )}
          {reminders.length ? (
            reminders.map((t) => (
              <button
                key={t.id}
                className="reminder-item"
                onClick={() => {
                  setModal({ type: "task", task: t });
                  setPanel(false);
                }}
              >
                <Bell size={16} />
                <span>
                  <strong>{t.title}</strong>
                  <small>
                    {niceDate(new Date(t.reminder), {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {t.notified ? " · доставлено" : ""}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <div className="reminders-empty">
              <Bell size={28} />
              <p>Пока тихо</p>
              <small>Добавьте напоминание в задаче.</small>
            </div>
          )}
        </section>
      )}
      {modal && (
        <Modal close={() => setModal(null)}>
          {modal.type === "task" ? (
            <TaskForm
              task={modal.task}
              projects={data.projects}
              defaultDate={view === "today" ? day : ""}
              defaultProject={
                data.projects.some((p) => p.id === view) ? view : ""
              }
              close={() => setModal(null)}
              remove={remove}
              save={(task) => {
                updateTasks((ts) =>
                  modal.task
                    ? ts.map((t) => (t.id === task.id ? task : t))
                    : [...ts, task],
                );
                setModal(null);
                notify(modal.task ? "Задача обновлена" : "Задача добавлена");
              }}
            />
          ) : modal.type === "project" ? (
            <ProjectForm
              save={(project) => {
                setData((d) => ({ ...d, projects: [...d.projects, project] }));
                setView(project.id);
                setModal(null);
              }}
            />
          ) : modal.type === "settings" ? (
            <>
              <div className="modal-icon">
                <SlidersHorizontal size={24} />
              </div>
              <h2>Ваше пространство</h2>
              <p className="muted">
                Данные хранятся локально на этом устройстве. Сохраняйте
                резервные копии, чтобы перенести задачи или защитить их от
                потери.
              </p>
              <div className="settings-actions">
                <button className="secondary" onClick={exportData}>
                  <Download size={18} />
                  Скачать резервную копию
                </button>
                <button
                  className="secondary"
                  onClick={() => fileRef.current.click()}
                >
                  <Upload size={18} />
                  Восстановить из файла
                </button>
              </div>
              <div className="info-note">
                Синхронизация между устройствами не подключена. Приложение
                работает без аккаунта и интернета.
              </div>
            </>
          ) : modal.type === "import" ? (
            <>
              <h2>Восстановить задачи?</h2>
              <p className="muted">
                Файл содержит {modal.data.tasks.length} задач и{" "}
                {modal.data.projects.length} проектов. Текущие данные будут
                заменены. Рекомендуем сначала скачать резервную копию.
              </p>
              <div className="settings-actions">
                <button className="secondary" onClick={exportData}>
                  <Download size={18} />
                  Сохранить текущие данные
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    loaded.error = false;
                    setStorageError(false);
                    setData(modal.data);
                    setView("today");
                    setModal(null);
                    notify("Данные восстановлены");
                  }}
                >
                  Заменить данные
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="modal-icon">
                <Leaf size={25} />
              </div>
              <h2>Чуть больше фокуса</h2>
              <div className="help-content">
                <p>
                  <strong>Планируйте без перегруза.</strong> Создавайте задачи,
                  назначайте один из трёх приоритетов и объединяйте дела в
                  проекты.
                </p>
                <p>
                  <strong>Держите важное перед глазами.</strong> В «Мой день»
                  видны задачи выбранной даты и незавершённые дела прошлых дней.
                </p>
                <p>
                  <strong>Вспоминайте вовремя.</strong> Задайте дату и время
                  напоминания. Приложение должно быть открыто; после закрытия
                  пропущенные напоминания появятся при запуске.
                </p>
                <p>
                  <strong>Работайте быстрее.</strong> Ctrl / ⌘ + N — новая
                  задача, Ctrl / ⌘ + K — поиск, Esc — закрыть окно.
                </p>
                <p className="muted">
                  Начальные задачи — примеры: их можно изменить или удалить.
                  Копии данных доступны в настройках внизу бокового меню.
                </p>
              </div>
            </>
          )}
        </Modal>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={importData}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          {undo && toast === "Задача удалена" && (
            <button
              onClick={() => {
                updateTasks((ts) =>
                  ts.some((t) => t.id === undo.id) ? ts : [...ts, undo],
                );
                setUndo(null);
                notify("Задача восстановлена");
              }}
            >
              Отменить
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Закрыть сообщение"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, project, today, toggle, edit }) {
  return (
    <article className={`task-row ${task.completed ? "is-completed" : ""}`}>
      <button
        className={`task-checkbox ${task.completed ? "checked" : ""}`}
        style={{ "--priority": priorities[task.priority].color }}
        aria-label={
          task.completed
            ? `Вернуть задачу: ${task.title}`
            : `Выполнить задачу: ${task.title}`
        }
        onClick={toggle}
      >
        {task.completed && <Check size={13} strokeWidth={3} />}
      </button>
      <button className="task-content" onClick={edit}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {project && (
            <span>
              <i style={{ background: project.color }} />
              {project.name}
            </span>
          )}
          {task.due && (
            <span
              className={task.due < today && !task.completed ? "overdue" : ""}
            >
              <Calendar size={12} />
              {task.due === today
                ? "Сегодня"
                : niceDate(new Date(task.due + "T12:00:00"), {
                    day: "numeric",
                    month: "short",
                  })}
            </span>
          )}
          {task.reminder && (
            <span>
              <Bell size={12} />
              {niceDate(new Date(task.reminder), {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {task.notes && <NotebookPen size={12} />}
        </span>
      </button>
      <span className={`priority-badge ${task.priority}`}>
        <Flag size={11} />
        {priorities[task.priority].label}
      </span>
      <button
        className="icon-button task-edit"
        aria-label={`Изменить задачу: ${task.title}`}
        onClick={edit}
      >
        <MoreHorizontal size={20} />
      </button>
    </article>
  );
}
function Modal({ children, close }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const focusables = () =>
      [
        ...ref.current.querySelectorAll(
          'button,input,textarea,select,[tabindex="0"]',
        ),
      ].filter((x) => !x.disabled);
    (
      ref.current.querySelector("[autofocus]") ||
      focusables()[1] ||
      focusables()[0]
    )?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const nodes = focusables();
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Окно управления задачами"
        className="modal"
      >
        <button
          className="icon-button modal-close"
          aria-label="Закрыть окно"
          onClick={close}
        >
          <X size={21} />
        </button>
        {children}
      </section>
    </div>
  );
}
function TaskForm({
  task,
  projects,
  defaultDate,
  defaultProject,
  save,
  remove,
  close,
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [notes, setNotes] = useState(task?.notes || "");
  const [priority, setPriority] = useState(task?.priority || "medium");
  const [project, setProject] = useState(task?.project || defaultProject);
  const [due, setDue] = useState(task?.due || defaultDate);
  const [reminder, setReminder] = useState(task?.reminder || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        save({
          ...task,
          id: task?.id || crypto.randomUUID(),
          title: title.trim(),
          notes: notes.trim(),
          priority,
          project,
          due,
          reminder,
          completed: task?.completed || false,
          notified: reminder === task?.reminder ? !!task?.notified : false,
        });
      }}
    >
      <div className="form-eyebrow">
        <Pencil size={16} />
        {task ? "РЕДАКТИРОВАНИЕ" : "НОВАЯ ЗАДАЧА"}
      </div>
      <h2>{task ? "Детали задачи" : "Что нужно сделать?"}</h2>
      <label className="field">
        Название
        <input
          autoFocus
          required
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например, подготовить презентацию"
        />
      </label>
      <label className="field">
        Заметки <span className="optional">необязательно</span>
        <textarea
          rows={3}
          value={notes}
          maxLength={10000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Детали, идеи, полезные ссылки…"
        />
      </label>
      <div className="form-grid">
        <label className="field">
          Проект
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Без проекта</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Срок
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
      </div>
      <fieldset className="priority-field">
        <legend>Приоритет</legend>
        <div>
          {Object.entries(priorities).map(([key, p]) => (
            <button
              key={key}
              type="button"
              aria-pressed={priority === key}
              className={`priority-choice ${key} ${priority === key ? "chosen" : ""}`}
              onClick={() => setPriority(key)}
            >
              <Flag size={14} />
              {p.label}
              {priority === key && <Check size={13} />}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        Напоминание
        <input
          type="datetime-local"
          value={reminder}
          onChange={(e) => setReminder(e.target.value)}
        />
      </label>
      <p className="field-hint">
        <Clock size={13} />
        Напомним, пока Фокус открыт. Пропущенное — при запуске.
      </p>
      <div className="form-footer">
        {task ? (
          <button
            type="button"
            className="delete-button"
            onClick={() =>
              confirmDelete ? remove(task) : setConfirmDelete(true)
            }
          >
            <Trash2 size={16} />
            {confirmDelete ? "Точно удалить?" : "Удалить"}
          </button>
        ) : (
          <button type="button" className="text-button muted" onClick={close}>
            Отмена
          </button>
        )}
        <button className="primary" type="submit">
          <Check size={17} />
          {task ? "Сохранить" : "Добавить задачу"}
        </button>
      </div>
    </form>
  );
}
function ProjectForm({ save }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7f91bb");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim())
          save({ id: crypto.randomUUID(), name: name.trim(), color });
      }}
    >
      <div className="modal-icon">
        <Layers size={24} />
      </div>
      <h2>Новый проект</h2>
      <p className="muted">Соберите связанные задачи в одном месте.</p>
      <label className="field">
        Название
        <input
          autoFocus
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, ремонт квартиры"
        />
      </label>
      <fieldset className="color-field">
        <legend>Цвет проекта</legend>
        {["#7f91bb", "#b698bf", "#c6a469", "#668a75", "#c96757", "#6aa1a7"].map(
          (c) => (
            <button
              key={c}
              type="button"
              aria-label={`Цвет ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              style={{ background: c }}
            >
              {color === c && <Check size={18} />}
            </button>
          ),
        )}
      </fieldset>
      <button className="primary full" type="submit">
        <Plus size={17} />
        Создать проект
      </button>
    </form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
