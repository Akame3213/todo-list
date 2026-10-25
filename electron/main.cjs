const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const path = require("node:path");
if (process.platform === "win32") app.setAppUserModelId("app.focus.todo");
let window;
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.on("second-instance", () => {
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
});
const timers = new Map();
function clearTimers() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
function schedule(tasks) {
  clearTimers();
  for (const task of tasks) {
    const delay = new Date(task.reminder).getTime() - Date.now();
    if (task.completed || task.notified || !Number.isFinite(delay)) continue;
    const fire = () => {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: "Фокус · Напоминание",
          body: task.title,
        });
        notification.on("click", () => {
          window?.show();
          window?.focus();
        });
        notification.show();
      }
      window?.webContents.send("reminder-fired", task.id);
    };
    if (delay <= 0) fire();
    else
      timers.set(
        task.id,
        setTimeout(
          delay <= 2147483647 ? fire : () => schedule(tasks),
          Math.min(delay, 2147483647),
        ),
      );
  }
}
app.whenReady().then(() => {
  if (!singleInstance) return;
  window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 880,
    minHeight: 620,
    backgroundColor: "#f5f4f0",
    title: "Фокус",
    icon: path.join(__dirname, "../build/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, "../dist/index.html"));
  ipcMain.on("schedule-reminders", (_event, tasks) => {
    if (!Array.isArray(tasks)) return;
    schedule(
      tasks
        .filter(
          (t) => t && typeof t.id === "string" && typeof t.title === "string",
        )
        .slice(0, 10000),
    );
  });
});
app.on("window-all-closed", () => {
  clearTimers();
  app.quit();
});
