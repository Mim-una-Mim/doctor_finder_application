const { app, BrowserWindow, dialog } = require("electron");
require("./server.js");

const appUrl = "http://127.0.0.1:5000/index.html";

async function waitForServer() {
  const started = Date.now();

  while (Date.now() - started < 30000) {
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("The app server did not start within 30 seconds.");
}

async function openAppWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 850,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await window.loadURL(appUrl);
}

app.whenReady().then(async () => {
  try {
    await waitForServer();
    await openAppWindow();
  } catch (error) {
    dialog.showErrorBox("DoctorFinder could not start", error.message);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    openAppWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});