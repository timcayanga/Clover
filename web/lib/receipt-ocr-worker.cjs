// Local PP-OCRv5 inference. Models: PaddlePaddle/RapidAI, Apache-2.0.
// No uploaded image, transcript or customer identifier leaves this process.
const { parentPort } = require("node:worker_threads");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const cvModule = require("@techstark/opencv-js");
const modelSpecs = {
  detection: [
    "det/ch_PP-OCRv5_det_mobile.onnx",
    "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae",
  ],
  korean: [
    "rec/korean_PP-OCRv5_rec_mobile.onnx",
    "cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b",
  ],
  latin: [
    "rec/latin_PP-OCRv5_rec_mobile.onnx",
    "b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a",
  ],
};
const sessions = new Map();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function getModel(name) {
  if (!sessions.has(name))
    sessions.set(
      name,
      (async () => {
        const [file, sha] = modelSpecs[name];
        const dir = path.join(os.tmpdir(), "clover-ocr-models-v1");
        const target = path.join(dir, sha + ".onnx");
        let bytes = await fs.readFile(target).catch(() => null);
        if (!bytes || hash(bytes) !== sha) {
          const response = await fetch(
            "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv5/" +
              file,
            { signal: AbortSignal.timeout(15000) },
          );
          if (!response.ok) throw new Error("OCR model download failed");
          if (
            !response.body ||
            Number(response.headers.get("content-length") || 0) >
              20 * 1024 * 1024
          )
            throw new Error("OCR model too large");
          const chunks = [];
          let size = 0;
          const reader = response.body.getReader();
          try {
            for (;;) {
              const next = await reader.read();
              if (next.done) break;
              size += next.value.length;
              if (size > 20 * 1024 * 1024) {
                await reader.cancel();
                throw new Error("OCR model too large");
              }
              chunks.push(next.value);
            }
          } finally {
            reader.releaseLock();
          }
          bytes = Buffer.concat(chunks);
          if (bytes.length > 20 * 1024 * 1024 || hash(bytes) !== sha)
            throw new Error("OCR model integrity check failed");
          await fs.mkdir(dir, { recursive: true });
          const temp = target + "." + process.pid + ".tmp";
          await fs.writeFile(temp, bytes);
          await fs.rename(temp, target);
        }
        return {
          session: await ort.InferenceSession.create(bytes, {
            executionProviders: ["cpu"],
            intraOpNumThreads: 2,
            interOpNumThreads: 1,
          }),
          dictionary: name === "detection" ? [] : modelDictionary(bytes),
        };
      })(),
    );
  return sessions.get(name);
}
// ONNX embeds the exact CTC alphabet. Never substitute a similarly named dictionary.
function protobufFields(bytes) {
  const fields = [];
  let i = 0;
  const varint = () => {
    let n = 0,
      shift = 0,
      b;
    do {
      b = bytes[i++];
      if (b === undefined || shift > 49)
        throw new Error("Invalid ONNX metadata");
      n += (b & 127) * 2 ** shift;
      shift += 7;
    } while (b & 128);
    return n;
  };
  while (i < bytes.length) {
    const tag = varint(),
      wire = tag & 7;
    if (wire === 2) {
      const length = varint();
      if (i + length > bytes.length) throw new Error("Invalid ONNX field");
      fields.push([tag >> 3, bytes.subarray(i, i + length)]);
      i += length;
    } else if (wire === 0) varint();
    else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else throw new Error("Invalid ONNX wire type");
  }
  return fields;
}
function modelDictionary(bytes) {
  for (const [tag, data] of protobufFields(bytes))
    if (tag === 14) {
      const entry = Object.fromEntries(
        protobufFields(data).map(([key, value]) => [
          key,
          value.toString("utf8"),
        ]),
      );
      if (entry[1] === "character")
        return ["", ...entry[2].replace(/\n$/, "").split("\n"), " "];
    }
  throw new Error("OCR alphabet missing");
}
function tensor(rgb, width, height, detection, paddedWidth = width) {
  const data = new Float32Array(3 * height * paddedWidth);
  const mean = detection ? [0.485, 0.456, 0.406] : [0.5, 0.5, 0.5];
  const std = detection ? [0.229, 0.224, 0.225] : [0.5, 0.5, 0.5];
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        data[c * height * paddedWidth + y * paddedWidth + x] =
          (rgb[(y * width + x) * 3 + (2 - c)] / 255 - mean[c]) / std[c];
      }
  return new ort.Tensor("float32", data, [1, 3, height, paddedWidth]);
}
async function infer(model, input) {
  try {
    const result = await model.session.run({
      [model.session.inputNames[0]]: input,
    });
    return result[model.session.outputNames[0]];
  } finally {
    input.dispose();
  }
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function rectangle(cv, contour, expansion = 0) {
  const rect = cv.minAreaRect(contour),
    rad = (rect.angle * Math.PI) / 180;
  const w = rect.size.width,
    h = rect.size.height;
  const pad = (expansion * w * h) / (2 * (w + h));
  const points = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
    .map(([x, y]) => [
      rect.center.x +
        x * (w / 2 + pad) * Math.cos(rad) -
        y * (h / 2 + pad) * Math.sin(rad),
      rect.center.y +
        x * (w / 2 + pad) * Math.sin(rad) +
        y * (h / 2 + pad) * Math.cos(rad),
    ])
    .sort((a, b) => a[0] - b[0]);
  const left = points.slice(0, 2).sort((a, b) => a[1] - b[1]),
    right = points.slice(2).sort((a, b) => a[1] - b[1]);
  return { box: [left[0], right[0], right[1], left[1]], short: Math.min(w, h) };
}
async function detect(cv, image, size) {
  const ratio = Math.min(1, size / Math.max(image.width, image.height));
  const w = Math.max(32, Math.round((image.width * ratio) / 32) * 32),
    h = Math.max(32, Math.round((image.height * ratio) / 32) * 32);
  const bytes = await sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .resize(w, h, { fit: "fill" })
    .raw()
    .toBuffer();
  const output = await infer(
    await getModel("detection"),
    tensor(bytes, w, h, true),
  );
  const mask = new cv.Mat(h, w, cv.CV_8UC1);
  for (let i = 0; i < w * h; i++) mask.data[i] = output.data[i] > 0.3 ? 255 : 0;
  output.dispose();
  const contours = new cv.MatVector(),
    hierarchy = new cv.Mat(),
    boxes = [];
  try {
    cv.findContours(
      mask,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE,
    );
    if (contours.size() > 1200) throw new Error("OCR page too complex");
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      try {
        const { box, short } = rectangle(cv, contour, 1.5);
        if (short < 3) continue;
        const mapped = box.map(([x, y]) => [
          Math.max(0, Math.min(image.width - 1, (x * image.width) / w)),
          Math.max(0, Math.min(image.height - 1, (y * image.height) / h)),
        ]);
        if (
          distance(mapped[0], mapped[1]) > 5 &&
          distance(mapped[0], mapped[3]) > 5
        )
          boxes.push(mapped);
      } finally {
        contour.delete();
      }
    }
  } finally {
    mask.delete();
    contours.delete();
    hierarchy.delete();
  }
  if (boxes.length > 300) throw new Error("OCR page has too many lines");
  return boxes;
}
async function crops(cv, image, boxes) {
  const src = cv.matFromArray(
      image.height,
      image.width,
      cv.CV_8UC3,
      image.data,
    ),
    result = [];
  try {
    for (const box of boxes) {
      const w = Math.max(
          1,
          Math.round(
            Math.max(distance(box[0], box[1]), distance(box[2], box[3])),
          ),
        ),
        h = Math.max(
          1,
          Math.round(
            Math.max(distance(box[0], box[3]), distance(box[1], box[2])),
          ),
        );
      if (w * h > 3000000 || h > w * 1.5) continue;
      const from = cv.matFromArray(4, 1, cv.CV_32FC2, box.flat()),
        to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
      const transform = cv.getPerspectiveTransform(from, to),
        dst = new cv.Mat();
      try {
        cv.warpPerspective(
          src,
          dst,
          transform,
          new cv.Size(w, h),
          cv.INTER_CUBIC,
          cv.BORDER_REPLICATE,
          new cv.Scalar(),
        );
        const rw = Math.min(2048, Math.max(1, Math.ceil((w * 48) / h)));
        const data = await sharp(Buffer.from(dst.data), {
          raw: { width: w, height: h, channels: 3 },
        })
          .resize(rw, 48, { fit: "fill" })
          .raw()
          .toBuffer();
        result.push({ box, data, width: rw });
      } finally {
        from.delete();
        to.delete();
        transform.delete();
        dst.delete();
      }
    }
  } finally {
    src.delete();
  }
  return result;
}
async function recognize(lines, language, normalize = true) {
  const model = await getModel(language),
    results = [];
  for (const line of lines) {
    const input = tensor(
      line.data,
      line.width,
      48,
      false,
      Math.max(320, line.width),
    );
    if (!normalize)
      for (let c = 0; c < 3; c++)
        for (let y = 0; y < 48; y++)
          for (let x = 0; x < line.width; x++) {
            const i =
              c * 48 * Math.max(320, line.width) +
              y * Math.max(320, line.width) +
              x;
            input.data[i] = (input.data[i] + 1) / 2;
          }
    const output = await infer(model, input);
    try {
      const classes = output.dims[2];
      if (classes !== model.dictionary.length)
        throw new Error(
          `OCR alphabet mismatch ${language}: ${classes}/${model.dictionary.length}`,
        );
      let text = "",
        sum = 0,
        count = 0,
        last = -1,
        min = 1;
      for (let i = 0; i < output.data.length; i += classes) {
        let best = 0;
        for (let c = 1; c < classes; c++)
          if (output.data[i + c] > output.data[i + best]) best = c;
        if (best !== 0 && best !== last) {
          text += model.dictionary[best];
          const p = output.data[i + best];
          sum += p;
          min = Math.min(min, p);
          count++;
        }
        last = best;
      }
      if (text.trim())
        results.push({
          text,
          confidence: count ? sum / count : 0,
          minConfidence: min,
          box: line.box,
        });
    } finally {
      output.dispose();
    }
  }
  return results;
}
function rows(lines) {
  // Correct document skew before pairing distant labels and amounts. Reading
  // only top-left y joined TAX to the next GRAND TOTAL on tilted receipts.
  const slopes = lines
    .filter((l) => distance(l.box[0], l.box[1]) > 60)
    .map((l) => (l.box[1][1] - l.box[0][1]) / (l.box[1][0] - l.box[0][0]))
    .filter((s) => Math.abs(s) < 0.3)
    .sort((a, b) => a - b);
  const slope = slopes[Math.floor(slopes.length / 2)] || 0;
  const entries = lines
    .map((l) => ({
      ...l,
      x: (l.box[0][0] + l.box[2][0]) / 2,
      y:
        (l.box[0][1] + l.box[2][1]) / 2 -
        (slope * (l.box[0][0] + l.box[2][0])) / 2,
      h: distance(l.box[0], l.box[3]),
    }))
    .sort((a, b) => a.y - b.y);
  const groups = [];
  for (const line of entries) {
    const group = groups.find(
      (g) =>
        Math.abs(g.y - line.y) < Math.min(g.h, line.h) * 0.4 &&
        !g.lines.some(
          (other) =>
            Math.min(other.box[1][0], line.box[1][0]) -
              Math.max(other.box[0][0], line.box[0][0]) >
            Math.min(
              distance(other.box[0], other.box[1]),
              distance(line.box[0], line.box[1]),
            ) *
              0.3,
        ),
    );
    if (group) group.lines.push(line);
    else groups.push({ y: line.y, h: line.h, lines: [line] });
  }
  return groups
    .map((g) =>
      g.lines
        .sort((a, b) => a.x - b.x)
        .map((l) => l.text)
        .join(" "),
    )
    .join("\n");
}
async function run(bytes) {
  if (!cvModule.Mat)
    await new Promise((resolve) => {
      cvModule.onRuntimeInitialized = resolve;
    });
  const cv = cvModule;
  const normalized = await sharp(Buffer.from(bytes), {
    limitInputPixels: 40000000,
  })
    .rotate()
    .flatten({ background: "#fff" })
    .removeAlpha()
    .toColourspace("srgb")
    .resize({
      width: 2800,
      height: 2800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const image = {
    data: normalized.data,
    width: normalized.info.width,
    height: normalized.info.height,
  };
  await Promise.all(Object.keys(modelSpecs).map(getModel));
  const lineImages = await crops(cv, image, await detect(cv, image, 1536));
  const latin = await recognize(lineImages, "latin"),
    korean = await recognize(lineImages, "korean");
  const score = (lines) =>
    lines.reduce(
      (sum, l) => sum + l.confidence * Math.min(30, l.text.length),
      0,
    ) /
    Math.max(
      1,
      lines.reduce((sum, l) => sum + Math.min(30, l.text.length), 0),
    );
  const hangul = korean.filter(
    (l) => l.confidence > 0.65 && /[가-힣]{2}/.test(l.text),
  ).length;
  const language = hangul >= 3 ? "korean" : "latin";
  const first = language === "korean" ? korean : latin;
  const alternate = await recognize(lineImages, language, false);
  const lines = first.map((line) => {
    const other = alternate.find((candidate) => candidate.box === line.box);
    return other?.confidence > line.confidence ? other : line;
  });
  return {
    engine: "ppocr-v5-local",
    language,
    text: rows(lines.filter((l) => l.confidence >= 0.5)),
    lines,
    confidence: score(lines),
  };
}
module.exports = { run, rows, modelDictionary, tensor };
if (parentPort)
  parentPort.on("message", async (bytes) => {
    try {
      parentPort.postMessage({ ok: true, result: await run(bytes) });
    } catch {
      parentPort.postMessage({ ok: false });
    }
  });
