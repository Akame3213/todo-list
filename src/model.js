export const STORAGE_KEY = "focus-todo-v1";
export const priorities = {
  high: { label: "Высокий", color: "#c96757" },
  medium: { label: "Средний", color: "#b68a3a" },
  low: { label: "Низкий", color: "#668a75" },
};
export const defaultProjects = [
  { id: "work", name: "Работа", color: "#7f91bb" },
  { id: "personal", name: "Личное", color: "#b698bf" },
  { id: "growth", name: "Саморазвитие", color: "#c6a469" },
];
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function initialData() {
  const today = dateKey();
  const tomorrow = dateKey(new Date(Date.now() + 86400000));
  return {
    projects: defaultProjects,
    tasks: [
      {
        id: "welcome-1",
        title: "Спланировать неделю",
        notes: "Выберите три главных дела и оставьте место для отдыха.",
        project: "personal",
        priority: "high",
        due: today,
        completed: false,
      },
      {
        id: "welcome-2",
        title: "Подготовить идеи для нового проекта",
        notes: "",
        project: "work",
        priority: "high",
        due: today,
        completed: false,
      },
      {
        id: "welcome-3",
        title: "Прочитать 20 страниц книги",
        notes: "",
        project: "growth",
        priority: "medium",
        due: today,
        completed: false,
      },
      {
        id: "welcome-4",
        title: "Прогуляться без телефона",
        notes: "",
        project: "personal",
        priority: "low",
        due: today,
        completed: false,
      },
      {
        id: "welcome-5",
        title: "Разобрать рабочий стол",
        notes: "",
        project: "work",
        priority: "low",
        due: today,
        completed: true,
      },
      {
        id: "welcome-6",
        title: "Посмотреть лекцию по дизайну",
        notes: "",
        project: "growth",
        priority: "medium",
        due: tomorrow,
        completed: false,
      },
    ],
  };
}
export function validateData(data) {
  if (
    !data ||
    !Array.isArray(data.tasks) ||
    !Array.isArray(data.projects) ||
    data.tasks.length > 10000 ||
    data.projects.length > 100
  )
    throw new Error("Некорректный файл резервной копии");
  const projectIds = new Set();
  for (const p of data.projects) {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 100 ||
      !/^#[0-9a-f]{6}$/i.test(p.color) ||
      projectIds.has(p.id)
    )
      throw new Error("Некорректные проекты");
    projectIds.add(p.id);
  }
  const ids = new Set();
  for (const t of data.tasks) {
    if (
      !t ||
      typeof t.id !== "string" ||
      !t.id ||
      ids.has(t.id) ||
      typeof t.title !== "string" ||
      !t.title.trim() ||
      t.title.length > 500 ||
      !Object.hasOwn(priorities, t.priority) ||
      typeof t.completed !== "boolean" ||
      (t.notes != null && typeof t.notes !== "string") ||
      (t.project && !projectIds.has(t.project)) ||
      (t.due &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(t.due) ||
          !Number.isFinite(Date.parse(t.due)))) ||
      (t.reminder && !Number.isFinite(Date.parse(t.reminder)))
    )
      throw new Error("Некорректные задачи");
    ids.add(t.id);
  }
  return { projects: data.projects, tasks: data.tasks };
}
export function selectTasks(tasks, view, search = "", day = dateKey()) {
  return tasks.filter((t) => {
    const matches =
      view === "completed"
        ? t.completed
        : !t.completed &&
          (view === "all" ||
            (view === "today" && t.due && t.due <= day) ||
            (view === "upcoming" && t.due > day) ||
            (view === "important" && t.priority === "high") ||
            t.project === view);
    return (
      matches &&
      `${t.title} ${t.notes || ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
    );
  });
}
export function dueReminders(tasks, now = Date.now()) {
  return tasks.filter(
    (t) =>
      !t.completed &&
      !t.notified &&
      t.reminder &&
      Date.parse(t.reminder) <= now,
  );
}
