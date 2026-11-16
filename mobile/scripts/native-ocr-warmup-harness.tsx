// Debug-only Expo entry. Run one arm per fresh app process on physical hardware.
import { registerRootComponent } from "expo";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { Platform, ScrollView, Text } from "react-native";
import { CloverLocalAI } from "../modules/clover-local-ai";

async function runBenchmark(directory: string) {
  const config = JSON.parse(await FileSystem.readAsStringAsync(directory + "qa-ocr-trial.json"));
  const { arm, trial } = config;
  const idleMs = config.idleMs ?? 2000;
  if ((arm !== "cold" && arm !== "warm") || typeof trial !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(trial) ||
      !Number.isInteger(idleMs) || idleMs < 0 || idleMs > 10_000) {
    throw new Error("Choose a cold or warm arm, a unique trial ID, and an idle interval from 0 to 10000 ms.");
  }
  const engine = CloverLocalAI;
  if (!engine) throw new Error("The native OCR module is unavailable.");
  const scanImage = directory + "qa-receipt.png";
  const warmImage = directory + "qa-warmup.png";
  const scanInfo = await FileSystem.getInfoAsync(scanImage, { md5: true });
  const warmInfo = await FileSystem.getInfoAsync(warmImage, { md5: true });
  if (!scanInfo.exists || !warmInfo.exists || !scanInfo.md5 || !warmInfo.md5 || scanInfo.md5 === warmInfo.md5) {
    throw new Error("Supply two different synthetic PNG fixtures.");
  }

  const started = performance.now();
  let previousFrame = started;
  let longestFrameGapMs = 0;
  let frame = requestAnimationFrame(function sample() {
    const now = performance.now();
    longestFrameGapMs = Math.max(longestFrameGapMs, now - previousFrame);
    previousFrame = now;
    frame = requestAnimationFrame(sample);
  });
  let warmupMs: number | null = null;
  let warmupError = false;
  const warmup = arm === "warm" ? engine.extractText(warmImage).then(result => {
    warmupError = !result.text.trim();
  }, () => {
    warmupError = true;
  }).finally(() => {
    warmupMs = performance.now() - started;
  }) : Promise.resolve();

  try {
    await new Promise(resolve => setTimeout(resolve, idleMs));
    const scanRequestedAt = performance.now();
    const warmupReadyAtScan = arm === "warm" && warmupMs !== null && !warmupError;
    // If warming overruns the idle interval, count the remaining wait against
    // first use. The result also flags that this trial missed its idle window.
    await warmup;
    const scanStarted = performance.now();
    const result = await engine.extractText(scanImage).catch(() => null);
    const finished = performance.now();
    return {
      trial, arm, idleMs, platform: Platform.OS, model: Device.modelName, osVersion: Device.osVersion,
      memoryBytes: Device.totalMemory, physicalDevice: Device.isDevice,
      scanFixture: scanInfo.md5, warmFixture: warmInfo.md5,
      warmupMs, warmupError, warmupReadyAtScan,
      scanMs: finished - scanStarted,
      firstUseMs: finished - scanRequestedAt,
      elapsedMs: finished - started,
      longestFrameGapMs: Math.max(longestFrameGapMs, finished - previousFrame),
      scanError: result === null,
      correct: result?.text.includes("125.00") ?? false,
    };
  } finally {
    cancelAnimationFrame(frame);
  }
}

function Benchmark() {
  const [output, setOutput] = useState("Running a single native OCR trial…");
  useEffect(() => {
    const directory = FileSystem.documentDirectory;
    if (!directory) {
      setOutput("Native document storage is unavailable.");
      return;
    }
    void runBenchmark(directory).then(async result => {
      const json = JSON.stringify(result, null, 2);
      await FileSystem.writeAsStringAsync(directory + `qa-ocr-result-${result.trial}.json`, json);
      setOutput(json);
    }).catch(error => setOutput(error instanceof Error ? error.message : "Native OCR benchmark failed."));
  }, []);
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72 }}>
    <Text selectable>{output}</Text>
  </ScrollView>;
}

registerRootComponent(Benchmark);
