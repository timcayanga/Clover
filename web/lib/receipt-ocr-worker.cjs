// Local PP-OCRv5 inference. Models: PaddlePaddle/RapidAI, Apache-2.0.
// No uploaded image, transcript or customer identifier leaves this process.
const { performance } = require("node:perf_hooks");
const { parentPort } = require("node:worker_threads");
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const cvModule = require("@techstark/opencv-js");
const { modelSpecs, loadModelBytes } = require("./receipt-ocr-models.cjs");
const sessions = new Map();
async function getModel(name) {
  if (!sessions.has(name))
    sessions.set(
      name,
      (async () => {
        const bytes = await loadModelBytes(name);
        const dictionary = name === "detection" ? [] : modelDictionary(bytes);
        return {
          session: await ort.InferenceSession.create(bytes, {
            executionProviders: ["cpu"],
            intraOpNumThreads: 2,
            interOpNumThreads: 1,
          }),
          dictionary,
          numericGlyphs: dictionary.flatMap((char, index) => index && /^[0-9OoIlSBZ]$/.test(char) ? [index] : []),
        };
      })().catch(error => {
        sessions.delete(name);
        throw error;
      }),
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
// The source values are bytes. A lookup preserves the original Float32
// preprocessing exactly, including the intermediate rounding of the alternate
// recognition pass, without reading and transforming an entire tensor twice.
function byteChannels(means, deviations, unitRange = false) {
  return means.map((mean, channel) => Float32Array.from({ length: 256 }, (_, value) => {
    const centered = Math.fround((value / 255 - mean) / deviations[channel]);
    return unitRange ? (centered + 1) / 2 : centered;
  }));
}
const detectionBytes = byteChannels([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);
const recognitionBytes = byteChannels([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
const alternateBytes = byteChannels([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], true);

function writeChannels(data, offset, rgb, width, height, detection, paddedWidth, normalize) {
  const channels = detection ? detectionBytes : normalize ? recognitionBytes : alternateBytes;
  for (let c = 0; c < 3; c++) {
    const lookup = channels[c];
    for (let y = 0; y < height; y++) {
      let src = y * width * 3 + 2 - c;
      let dest = offset + (c * height + y) * paddedWidth;
      for (let x = 0; x < width; x++, src += 3) data[dest++] = lookup[rgb[src]];
    }
  }
}
function tensor(rgb, width, height, detection, paddedWidth = width, normalize = true) {
  const data = new Float32Array(3 * height * paddedWidth);
  writeChannels(data, 0, rgb, width, height, detection, paddedWidth, normalize);
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
async function detect(cv, image, size, slenderBoxes) {
  const edge = Math.max(image.width, image.height);
  // Small thumbnails can contain text narrower than a detection cell.
  // Enlarge the detection grid only, then recognize crops of the source pixels.
  const ratio = edge < 720 ? Math.min(2, 720 / edge) : Math.min(1, size / edge);
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
  const maskData = mask.data;
  const probabilities = output.data;
  for (let i = 0; i < w * h; i++) maskData[i] = probabilities[i] > 0.3 ? 255 : 0;
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
        if (short < 2) continue;
        const mapped = box.map(([x, y]) => [
          Math.max(0, Math.min(image.width - 1, (x * image.width) / w)),
          Math.max(0, Math.min(image.height - 1, (y * image.height) / h)),
        ]);
        if (
          distance(mapped[0], mapped[1]) > 5 &&
          distance(mapped[0], mapped[3]) > 5
        ) {
          if (short < 3) slenderBoxes.add(mapped);
          boxes.push(mapped);
        }
      } finally {
        contour.delete();
      }
    }
  } finally {
    mask.delete();
    contours.delete();
    hierarchy.delete();
  }
  if (boxes.length > 300) {
    const ordinary = boxes.filter(box => !slenderBoxes.has(box));
    if (ordinary.length <= 300) return ordinary;
    throw new Error("OCR page has too many lines");
  }
  return boxes;
}
async function crops(cv, image, boxes, slenderBoxes) {
  if (!boxes.length) return [];
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
      if (h > w * 1.5) slenderBoxes.add(box);
      if (w * h > 3000000 || (slenderBoxes.has(box) && (h > w * 3 || Math.max(w, h) > 64))) continue;
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
// The pinned recognition models output a softmax distribution for each
// timestep. A class above half the probability mass is the unique winner.
function mostLikelyClass(probabilities, offset, classes) {
  let best = 0;
  let maximum = probabilities[offset];
  for (let c = 1; c < classes && maximum <= 0.5; c++) {
    const probability = probabilities[offset + c];
    if (probability > maximum) {
      best = c;
      maximum = probability;
    }
  }
  return best;
}

function decodeLine(probabilities, classes, model, numericGlyphs, box) {
  let text = "",
    sum = 0,
    count = 0,
    last = -1,
    min = 1;
  const characterAlternatives = [];
  const weakDigits = [];
  let characterIndex = 0;
  for (let i = 0; i < probabilities.length; i += classes) {
    const best = mostLikelyClass(probabilities, i, classes);
    if (best !== 0 && best !== last) {
      const glyph = model.dictionary[best];
      const p = probabilities[i + best];
      if (p < 0.85 && /^\d$/.test(glyph)) weakDigits.push(characterIndex);
      if (characterAlternatives.length < 8 && p < 0.85 && /^[0-9OoIlSBZ]$/.test(glyph)) {
        let next = -1;
        for (const c of numericGlyphs) {
          if (c !== best && (next === -1 || probabilities[i + c] > probabilities[i + next])) next = c;
        }
        if (next !== -1 && probabilities[i + next] >= 0.1 && p - probabilities[i + next] <= 0.25) {
          characterAlternatives.push({ index: characterIndex, text: model.dictionary[next], confidence: probabilities[i + next] });
        }
      }
      text += glyph;
      characterIndex += Array.from(glyph).length;
      sum += p;
      min = Math.min(min, p);
      count++;
    }
    last = best;
  }
  if (!text.trim()) return null;
  return {
    text,
    weakDigits,
    characterAlternatives: characterAlternatives.map(candidate => ({
      ...candidate, index: candidate.index - Array.from(text.match(/^\s*/u)?.[0] ?? "").length,
    })),
    confidence: count ? sum / count : 0,
    minConfidence: min,
    box,
  };
}

async function recognize(lines, language, normalize = true) {
  if (!lines.length) return [];
  // Standard-width crops share identical padding. Batch them together even
  // when the detector interleaves wide rows, then restore detector order.
  const original = lines;
  lines = [...lines.filter(line => line.width <= 320), ...lines.filter(line => line.width > 320)];
  const model = await getModel(language);
  const results = new Map();
  const { numericGlyphs } = model;
  for (let start = 0; start < lines.length;) {
    const width = Math.max(320, lines[start].width);
    // Keep the exact original padding. A wider neighbour changes the model's
    // receptive field. Bound each batch, particularly for the Korean alphabet.
    let end = start + 1;
    while (width === 320 && end < lines.length && end - start < 4 && lines[end].width <= width) end++;
    const stride = 3 * 48 * width;
    const input = new Float32Array((end - start) * stride);
    for (let i = start; i < end; i++) {
      writeChannels(input, (i - start) * stride, lines[i].data, lines[i].width, 48, false, width, normalize);
    }
    const output = await infer(model, new ort.Tensor("float32", input, [end - start, 3, 48, width]));
    try {
      const [batch, steps, classes] = output.dims;
      if (batch !== end - start || classes !== model.dictionary.length)
        throw new Error(`Unexpected OCR output dimensions for ${language}`);
      const values = output.data;
      for (let i = 0; i < batch; i++) {
        const offset = i * steps * classes;
        const line = decodeLine(values.subarray(offset, offset + steps * classes), classes, model, numericGlyphs, lines[start + i].box);
        if (line) results.set(line.box, line);
      }
      start = end;
    } finally {
      output.dispose();
    }
  }
  return original.map(line => results.get(line.box)).filter(Boolean);
}
function rows(lines) {
  // Correct document skew before pairing distant labels and amounts. Reading
  // only top-left y joined TAX to the next GRAND TOTAL on tilted receipts.
  const slopes = lines
    .filter((l) => distance(l.box[0], l.box[1]) > 60)
    .map((l) => (l.box[1][1] - l.box[0][1]) / (l.box[1][0] - l.box[0][0]))
    .filter((s) => Math.abs(s) < 1)
    .sort((a, b) => a - b);
  const median = slopes[Math.floor(slopes.length / 2)] || 0;
  const supporting = slopes.filter(s => Math.abs(s - median) < 0.1).length;
  const slope = Math.abs(median) < 0.3 || supporting >= Math.max(3, slopes.length / 2) ? median : 0;
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
// Only resolve competing alphabetic words. Numerical fields keep their
// separate optical disagreement checks. Never invent a word from a dictionary.
function corroborateWords(best, other, independent, printedElsewhere) {
  if (!other || !independent || independent.confidence < 0.7 || /[0-9]/.test(best.text)) return best;
  // Accept one omitted space or interior letter when two other readings
  // agree on the complete phrase, including the printed punctuation.
  const preferred = best.text.trim();
  const agreed = other.text.trim();
  // A period and comma can look alike in a small item-name crop. Require
  // agreement on the full phrase and change only the separator between words.
  if (other.confidence >= 0.85 && independent.confidence >= 0.85 &&
      agreed === independent.text.trim() && preferred !== agreed &&
      /^[\p{Script=Latin} '.(),-]+$/u.test(preferred) &&
      preferred.replace(/(?<=\p{L})[.,](?=\s+\p{L})/gu, ",") ===
        agreed.replace(/(?<=\p{L})[.,](?=\s+\p{L})/gu, ",")) {
    return { ...best, text: agreed, originalText: best.text };
  }
  if (other.confidence >= 0.75 && agreed.toLowerCase() === independent.text.trim().toLowerCase() &&
      /^[A-Za-z][A-Za-z '&.,()/-]*$/.test(preferred) && /^[A-Za-z][A-Za-z '&.,()/-]*$/.test(agreed) &&
      Math.abs(preferred.length - agreed.length) === 1) {
    const shorter = preferred.length < agreed.length ? preferred : agreed;
    const longer = preferred.length < agreed.length ? agreed : preferred;
    const a = longer.toLowerCase(), b = shorter.toLowerCase();
    let index = 0;
    while (index < b.length && a[index] === b[index]) index++;
    const interiorLetter = /[a-z]/.test(a.charAt(index - 1)) && /[a-z]/.test(a.charAt(index)) &&
      /[a-z]/.test(a.charAt(index + 1)) && independent.confidence >= 0.85 && other.confidence >= 0.85;
    if ((a[index] === " " || interiorLetter) && a.slice(index + 1) === b.slice(index)) {
      return { ...best, text: agreed, originalText: best.text };
    }
  }
  const words = best.text.split(/\s+/);
  const alternative = other.text.trim().split(/\s+/);
  const witness = independent.text.trim().split(/\s+/).filter(word => /\p{L}/u.test(word));
  const tokens = words.filter(word => /\p{L}/u.test(word));
  const candidates = alternative.filter(word => /\p{L}/u.test(word));
  if (tokens.length !== witness.length || tokens.length !== candidates.length) return best;
  let index = 0;
  const text = words.map(word => {
    if (!/\p{L}/u.test(word)) return word;
    const corroborated = witness[index];
    const competing = candidates[index++];
    if (!/^\p{Script=Latin}{4,}$/u.test(word) || !/^\p{Script=Latin}+$/u.test(corroborated) || word.length !== corroborated.length) return word;
    const candidate = corroborated.toLowerCase();
    const old = word.toLowerCase();
    if (candidate === old || Array.from(old).filter((c,i) => c !== candidate[i]).length !== 1) return word;
    if (competing.toLowerCase() === candidate) return competing;
    // Two variants from the same recognizer can share a spelling error.
    // Require this exact spelling in a different, high-confidence printed row.
    const boxes = printedElsewhere.get(candidate);
    return boxes && (boxes.size > 1 || !boxes.has(best.box)) ? corroborated : word;
  }).join(" ");
  return text !== words.join(" ") ? { ...best, text, originalText: best.text } : best;
}
// An identical reading from both recognizers is sufficient for clear words.
function agreedWordLine(line, witness) {
  return witness && line.text === witness.text && line.minConfidence >= 0.93 &&
    witness.minConfidence >= 0.93 && /^\p{Script=Latin}[\p{Script=Latin} '.,()-]*$/u.test(line.text);
}
// Each recognizer has already seen this same box. Only resolve a standalone
// date when the two variants are weak at the exact disputed digit.
function strongerDateReading(primary, variant, witness) {
  if (!variant || !witness || !(witness.minConfidence >= 0.93) || witness.characterAlternatives?.length ||
      primary.text !== variant.text || primary.text.length !== witness.text.length ||
      !/^(?:\d{4}([/.-])\d{1,2}\1\d{1,2}|\d{1,2}([/.-])\d{1,2}\2(?:\d{2}|\d{4}))$/.test(primary.text)) return null;
  let changed = -1;
  for (let i = 0; i < primary.text.length; i++) {
    if (primary.text[i] === witness.text[i]) continue;
    if (changed !== -1 || !/\d/.test(witness.text[i]) || !primary.weakDigits?.includes(i) ||
        !variant.weakDigits?.includes(i)) return null;
    changed = i;
  }
  if (changed === -1) return null;
  const [a, b, c] = witness.text.split(/[./-]/);
  const yearFirst = a.length === 4;
  const year = yearFirst ? Number(a) : Number(c) + (c.length === 2 ? 2000 : 0);
  const isDay = (month, day) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  };
  if (yearFirst ? !isDay(Number(b),Number(c)) :
      (!isDay(Number(a),Number(b)) && !isDay(Number(b),Number(a)))) return null;
  return witness;
}
async function run(preview, timings) {
  const runtimeStarted = performance.now();
  if (!cvModule.Mat)
    await new Promise((resolve) => {
      cvModule.onRuntimeInitialized = resolve;
    });
  const cv = cvModule;
  const image = { ...preview, data: Buffer.from(preview.data.buffer, preview.data.byteOffset, preview.data.byteLength) };
  const modelsStarted = performance.now();
  if (timings) timings.runtimeInitMs = modelsStarted - runtimeStarted;
  await Promise.all(Object.keys(modelSpecs).map(getModel));
  const ocrStarted = performance.now();
  if (timings) timings.modelInitMs = ocrStarted - modelsStarted;
  const slenderBoxes = new Set();
  const boxes = await detect(cv, image, 1536, slenderBoxes);
  const lineImages = await crops(cv, image, boxes, slenderBoxes);
  const latin = await recognize(lineImages, "latin");
  // A confident standalone price offers no useful script evidence. Keep it
  // for the selected recognizer, and check every box on any Korean signal.
  const priceBoxes = new Set(latin.filter(line => line.minConfidence >= 0.97 &&
    /^\s*\d[\d,]*\.\d{2}\s*$/.test(line.text)).map(line => line.box));
  const korean = await recognize(lineImages.filter(line => !priceBoxes.has(line.box)), "korean");
  const hasKoreanText = line => !slenderBoxes.has(line.box) && line.confidence > 0.65 && /[가-힣]{2}/.test(line.text);
  if (priceBoxes.size && korean.some(hasKoreanText)) {
    korean.push(...await recognize(lineImages.filter(line => priceBoxes.has(line.box)), "korean"));
  }
  const score = (lines) =>
    lines.reduce(
      (sum, l) => sum + l.confidence * Math.min(30, l.text.length),
      0,
    ) /
    Math.max(
      1,
      lines.reduce((sum, l) => sum + Math.min(30, l.text.length), 0),
    );
  const hangul = korean.filter(hasKoreanText).length;
  const language = hangul >= 3 ? "korean" : "latin";
  const first = language === "korean" ? korean : latin;
  const witnesses = language === "latin" ? korean : latin;
  const independentByBox = new Map(witnesses.map(line => [line.box, line]));
  const agreedBoxes = new Set(first.filter(line => agreedWordLine(line, independentByBox.get(line.box))).map(line => line.box));
  const alternate = await recognize(lineImages.filter(line => !agreedBoxes.has(line.box)), language, false);
  const alternateByBox = new Map(alternate.map(line => [line.box, line]));
  const printedWords = new Map();
  for (const line of first) {
    if (line.confidence < 0.95) continue;
    for (const word of line.text.toLowerCase().split(/\s+/)) {
      if (!/^[a-z]{4,}$/.test(word)) continue;
      if (!printedWords.has(word)) printedWords.set(word, new Set());
      printedWords.get(word).add(line.box);
    }
  }
  const itemWordCorrections = [];
  const dateCorrections = [];
  const lines = first.map((line) => {
    const other = alternateByBox.get(line.box);
    const best = other?.confidence > line.confidence ? other : line;
    const runnerUp = best === line ? other : line;
    const witness = independentByBox.get(line.box);
    const date = strongerDateReading(best, runnerUp, witness);
    if (date) {
      dateCorrections.push({ original: best.text, corrected: date.text, box: best.box,
        primaryConfidence: best.confidence, witnessConfidence: date.confidence });
      return { ...date, alternatives: [] };
    }
    const supported = corroborateWords(best, runnerUp, language === "latin" ? independentByBox.get(line.box) : null, printedWords);
    if (supported !== best && best.confidence >= 0.5) {
      itemWordCorrections.push({ original: best.text.trim(), corrected: supported.text.trim() });
    }
    return {
      ...best,
      alternatives: [runnerUp, witness].filter(candidate => candidate && /\d/.test(best.text) &&
        candidate.text.trim() !== best.text.trim() && (candidate === runnerUp ||
          (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(best.text) && candidate.minConfidence >= 0.85 &&
           candidate.text.replace(/\d/g, "#") === best.text.replace(/\d/g, "#")) ||
          (candidate.minConfidence >= 0.93 && best.minConfidence < 0.85 &&
           best.text.replace(/\d/g, "#") === candidate.text.replace(/\d/g, "#"))))
        .map(candidate => ({ text:candidate.text, confidence:candidate.confidence })),
    };
  });
  // Narrow single digits often sit by themselves in a quantity column.
  // Discard punctuation and uncertain readings from these extra contours.
  const readable = lines.filter(line => slenderBoxes.has(line.box)
    ? line.confidence >= 0.8 && /^[0-9]$/.test(line.text.trim())
    : line.confidence >= 0.5);
  const clamp = value => Math.max(0, Math.min(1, value));
  const opticalLines = readable.map(line => {
    const x = line.box.map(point => point[0] / image.width);
    const y = line.box.map(point => point[1] / image.height);
    return {
      text: line.text,
      box: [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)].map(clamp),
      confidence: line.confidence,
      minimumCharacterConfidence: line.minConfidence,
      alternatives: line.alternatives,
      characterAlternatives: line.characterAlternatives,
    };
  });
  const text = rows(readable);
  if (timings) timings.localOcrMs = performance.now() - ocrStarted;
  return {
    engine: "ppocr-v5-local",
    language,
    text,
    opticalLines,
    ...(itemWordCorrections.length ? { itemWordCorrections } : {}),
    ...(dateCorrections.length ? {dateCorrections} : {}),
    lines: lines.map(({weakDigits, ...line}) => line),
    confidence: score(lines),
  };
}
module.exports = { run, rows, modelDictionary, tensor, corroborateWords, mostLikelyClass, agreedWordLine, strongerDateReading };
if (parentPort)
  parentPort.on("message", async (input) => {
    const timings = input.measure ? {} : undefined;
    try {
      parentPort.postMessage({ ok: true, result: await run(input.preview, timings), timings });
    } catch {
      parentPort.postMessage({ ok: false, timings });
    }
  });
