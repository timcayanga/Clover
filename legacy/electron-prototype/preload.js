const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("financeManager", {
  version: "0.1.0",
  loadState: () => ipcRenderer.invoke("clover:load-state"),
  saveState: (items) => ipcRenderer.invoke("clover:save-state", items),
  parsePdfStatementBytes: (bytes, password = "") =>
    ipcRenderer.invoke("clover:parse-pdf-statement-bytes", { bytes, password }),
});
