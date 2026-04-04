import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { MenuItemConstructorOptions } from "electron";
import { Menu, app, BrowserWindow, ipcMain, nativeImage, shell } from "electron";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

app.setName("Hinterview");

const rendererDevUrl = process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5173";
const rendererIndexPath = path.resolve(currentDir, "../../renderer/dist/index.html");
const preloadPath = path.resolve(currentDir, "./preload.js");
const appIconPath = path.resolve(currentDir, "../src/assets/hinterview-icon.png");
const helperRootPath = path.resolve(currentDir, "../.speech-helper");
const helperAppPath = path.join(helperRootPath, "HinterviewSpeechHelper.app");
const helperExecutablePath = path.join(helperAppPath, "Contents", "MacOS", "HinterviewSpeechHelper");
const helperInfoPlistPath = path.join(helperAppPath, "Contents", "Info.plist");
const helperSourcePath = path.resolve(currentDir, "../src/native/speech-transcribe.swift");

const helperInfoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>HinterviewSpeechHelper</string>
  <key>CFBundleDisplayName</key>
  <string>HinterviewSpeechHelper</string>
  <key>CFBundleIdentifier</key>
  <string>com.hinterview.desktop.speechhelper</string>
  <key>CFBundleExecutable</key>
  <string>HinterviewSpeechHelper</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>Hinterview uses local speech recognition to convert your recorded answer into editable text.</string>
</dict>
</plist>
`;

const runProcess = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code ?? -1}`));
    });
  });

const runSpeechHelper = (inputPath: string, outputPath: string, locale: string) =>
  runProcess("open", ["-W", helperAppPath, "--args", inputPath, outputPath, locale]);

const openExternalUrl = async (url: string) => {
  if (process.platform === "darwin") {
    try {
      await runProcess("open", ["-a", "Google Chrome", url]);
      return;
    } catch {
      // Fallback to the default browser if Chrome is unavailable.
    }
  }

  await shell.openExternal(url);
};

const ensureSpeechHelper = async () => {
  const [sourceStats, executableStats] = await Promise.allSettled([fs.stat(helperSourcePath), fs.stat(helperExecutablePath)]);
  const needsBuild =
    sourceStats.status !== "fulfilled" ||
    executableStats.status !== "fulfilled" ||
    sourceStats.value.mtimeMs > executableStats.value.mtimeMs;

  if (!needsBuild) {
    return helperExecutablePath;
  }

  await fs.mkdir(path.join(helperAppPath, "Contents", "MacOS"), { recursive: true });
  await fs.writeFile(helperInfoPlistPath, helperInfoPlist, "utf8");
  await runProcess("swiftc", [
    helperSourcePath,
    "-framework",
    "Foundation",
    "-framework",
    "Speech",
    "-o",
    helperExecutablePath
  ]);

  return helperExecutablePath;
};

const transcribeAudioBytes = async ({
  audioBytes,
  fileName,
  locale
}: {
  audioBytes: Uint8Array;
  fileName?: string;
  locale?: string;
}) => {
  if (process.platform !== "darwin") {
    throw new Error("Local audio transcription is currently supported only on macOS in the desktop app.");
  }

  const executablePath = await ensureSpeechHelper();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hinterview-audio-"));
  const inputPath = path.join(tempDir, fileName && fileName.endsWith(".wav") ? fileName : "recording.wav");
  const outputPath = path.join(tempDir, "transcript.json");

  try {
    await fs.writeFile(inputPath, Buffer.from(audioBytes));
    await runSpeechHelper(inputPath, outputPath, locale ?? "en-US");
    const raw = await fs.readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw) as { text?: string; error?: string };
    if (!parsed.text) {
      throw new Error(parsed.error || "No speech was detected. Try again and speak more clearly into the microphone.");
    }
    return { text: parsed.text };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Local audio transcription failed.");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const buildMenu = (window: BrowserWindow) => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Settings",
          accelerator: "CommandOrControl+,",
          click: () => {
            window.webContents.send("app:open-settings");
          }
        },
        {
          type: "separator"
        },
        {
          role: "close"
        }
      ]
    },
    {
      role: "editMenu"
    },
    {
      role: "viewMenu"
    },
    {
      role: "windowMenu"
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const appIcon = nativeImage.createFromPath(appIconPath);

const createWindow = async () => {
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f3fbfc",
    titleBarStyle: "hiddenInset",
    title: "Hinterview",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true
    }
  };

  if (!appIcon.isEmpty()) {
    windowOptions.icon = appIcon;
  }

  const window = new BrowserWindow(windowOptions);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void openExternalUrl(url);
      return { action: "deny" };
    }

    return { action: "allow" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(rendererDevUrl)) {
      event.preventDefault();
      void openExternalUrl(url);
    }
  });

  buildMenu(window);

  if (!app.isPackaged) {
    await window.loadURL(rendererDevUrl);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await window.loadFile(rendererIndexPath);
};

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }
  ipcMain.handle("app:open-external", async (_event, url: string) => {
    await openExternalUrl(url);
  });
  ipcMain.handle("audio:transcribe", async (_event, payload: { audioBytes: Uint8Array; fileName?: string; locale?: string }) =>
    transcribeAudioBytes(payload)
  );
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
