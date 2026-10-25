const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("focusDesktop", {
  schedule: (tasks) => ipcRenderer.send("schedule-reminders", tasks),
  onReminder: (callback) => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on("reminder-fired", listener);
    return () => ipcRenderer.removeListener("reminder-fired", listener);
  },
});
