import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const helperRootPath = path.resolve(currentDir, "../.speech-helper");
const helperAppPath = path.join(helperRootPath, "HinterviewSpeechHelper.app");
const helperInfoPlistPath = path.join(helperAppPath, "Contents", "Info.plist");
const helperSourcePath = path.resolve(currentDir, "./native/speech-transcribe.swift");
const helperExecutablePath = path.join(helperAppPath, "Contents", "MacOS", "HinterviewSpeechHelper");

const helperInfoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>HinterviewSpeechHelper</string>
  <key>CFBundleDisplayName</key>
  <string>HinterviewSpeechHelper</string>
  <key>CFBundleIdentifier</key>
  <string>com.hinterview.server.speechhelper</string>
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

export const transcribeAudioBytes = async ({
  audioBytes,
  fileName,
  locale
}: {
  audioBytes: Uint8Array;
  fileName?: string;
  locale?: string;
}) => {
  if (process.platform !== "darwin") {
    throw new Error("Local audio transcription is currently supported only on macOS.");
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
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
