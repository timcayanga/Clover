const { app, BrowserWindow, ipcMain, nativeTheme } = require("electron");
const { readFile, writeFile } = require("fs/promises");
const { existsSync, mkdirSync } = require("fs");
const path = require("path");

let pdfjsPromise;

const getStateFile = () => path.join(app.getPath("userData"), "clover-state.json");

const loadPdfJs = async () => {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
};

const isPasswordError = (error, pdfjs) => {
  if (!error) return false;
  return (
    error.name === "PasswordException" ||
    error.code === pdfjs.PasswordResponses.NEED_PASSWORD ||
    error.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD
  );
};

const extractPdfText = async (data, password = "") => {
  const pdfjs = await loadPdfJs();
  let loadingTask;

  try {
    loadingTask = pdfjs.getDocument({
      data,
      password: password || undefined,
      disableWorker: true,
    });

    const pdf = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .map((item) => {
          const text = typeof item.str === "string" ? item.str.trim() : "";
          if (!text) return null;
          return {
            str: text,
            x: Number(item.transform?.[4] || 0),
            y: Number(item.transform?.[5] || 0),
          };
        })
        .filter(Boolean);
      const text = items.map((item) => item.str).join(" ");
      if (text.trim()) {
        pages.push({ pageNumber, text: text.trim(), items });
      }
    }

    return {
      ok: true,
      text: pages.map((page) => page.text).join("\n"),
      pages,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { ok: false, code: "READ_ERROR", message: "The PDF file could not be found." };
    }

    if (isPasswordError(error, pdfjs)) {
      const incorrect = error.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
      const message = incorrect ? "Incorrect password for this PDF." : "This PDF requires a password.";
      return { ok: false, code: incorrect ? "INCORRECT_PASSWORD" : "NEED_PASSWORD", message };
    }

    return { ok: false, code: "READ_ERROR", message: error.message || "Unable to read PDF file." };
  } finally {
    loadingTask.destroy?.();
  }
};

async function loadState() {
  const stateFile = getStateFile();
  if (!existsSync(stateFile)) {
    return null;
  }

  try {
    const raw = await readFile(stateFile, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Failed to load state:", error);
    return null;
  }
}

async function saveState(event, items) {
  const stateFile = getStateFile();
  try {
    mkdirSync(path.dirname(stateFile), { recursive: true });
    await writeFile(stateFile, JSON.stringify(items, null, 2), "utf8");
    return { ok: true };
  } catch (error) {
    console.error("Failed to save state:", error);
    return { ok: false, error: error.message };
  }
}

ipcMain.handle("clover:load-state", async () => loadState());
ipcMain.handle("clover:save-state", saveState);
ipcMain.handle("clover:parse-pdf-statement-bytes", async (_event, { bytes, password = "" }) => {
  if (!bytes) {
    return { ok: false, code: "READ_ERROR", message: "Missing PDF data." };
  }

  const result = await extractPdfText(new Uint8Array(bytes), password);
  return result;
});

function createWindow() {
  nativeTheme.themeSource = "dark";

  const win = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 1120,
    minHeight: 780,
    title: "Clover",
    backgroundColor: "#08111d",
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
