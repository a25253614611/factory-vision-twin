/** Fixed-camera reference inspection. No model, network call, or ground truth input. */

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function normalizeRoi(roi, width, height) {
  const fallback = {
    x: Math.round(width * 0.05), y: Math.round(height * 0.05),
    w: Math.round(width * 0.90), h: Math.round(height * 0.90)
  };
  const candidate = roi || fallback;
  const x = clamp(Math.round(candidate.x), 0, width - 1);
  const y = clamp(Math.round(candidate.y), 0, height - 1);
  const w = clamp(Math.round(candidate.w), 1, width - x);
  const h = clamp(Math.round(candidate.h), 1, height - y);
  return { x, y, w, h };
}

function grayscale(rgba, pixelCount) {
  const result = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const index = pixel * 4;
    result[pixel] = rgba[index] * 0.299 + rgba[index + 1] * 0.587 + rgba[index + 2] * 0.114;
  }
  return result;
}

function blurred(source, width, height) {
  const result = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += source[yy * width + xx];
          count++;
        }
      }
      result[y * width + x] = sum / count;
    }
  }
  return result;
}

function edges(gray, width, height) {
  const result = new Float32Array(gray.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      result[index] = Math.abs(gray[index + 1] - gray[index - 1]) +
        Math.abs(gray[index + width] - gray[index - width]);
    }
  }
  return result;
}

function estimateOffset(referenceEdge, sampleEdge, width, height, roi, maxShift) {
  if (!maxShift) return { x: 0, y: 0, alignmentScore: 0 };
  const pad = maxShift + 2;
  const x0 = Math.max(roi.x + pad, pad);
  const y0 = Math.max(roi.y + pad, pad);
  const x1 = Math.min(roi.x + roi.w - pad, width - pad);
  const y1 = Math.min(roi.y + roi.h - pad, height - pad);
  if (x1 - x0 < 16 || y1 - y0 < 16) return { x: 0, y: 0, alignmentScore: 0 };
  let referenceEnergy = 0;
  let samples = 0;
  for (let y = y0; y < y1; y += 6) {
    for (let x = x0; x < x1; x += 6) {
      referenceEnergy += referenceEdge[y * width + x];
      samples++;
    }
  }
  if (referenceEnergy / samples < 2) return { x: 0, y: 0, alignmentScore: 0 };
  let best = { x: 0, y: 0, alignmentScore: Infinity };
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      let sum = 0;
      for (let y = y0; y < y1; y += 6) {
        for (let x = x0; x < x1; x += 6) {
          const first = referenceEdge[y * width + x];
          const second = sampleEdge[(y + dy) * width + x + dx];
          sum += Math.min(Math.abs(first - second), 100);
        }
      }
      const score = sum / samples + (Math.abs(dx) + Math.abs(dy)) * 0.015;
      if (score < best.alignmentScore) best = { x: dx, y: dy, alignmentScore: score };
    }
  }
  return { ...best, alignmentScore: Number(best.alignmentScore.toFixed(2)) };
}

function estimateBrightness(referenceGray, sampleGray, width, height, roi, offset) {
  const differences = [];
  for (let y = roi.y + 2; y < roi.y + roi.h - 2; y += 5) {
    for (let x = roi.x + 2; x < roi.x + roi.w - 2; x += 5) {
      const sx = x + offset.x;
      const sy = y + offset.y;
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
      differences.push(referenceGray[y * width + x] - sampleGray[sy * width + sx]);
    }
  }
  if (!differences.length) return 0;
  differences.sort((a, b) => a - b);
  return Math.round(clamp(differences[Math.floor(differences.length / 2)], -40, 40));
}

function components(mask, difference, width, height, roi, minArea) {
  const visited = new Uint8Array(mask.length);
  const boxes = [];
  let acceptedPixels = 0;
  const stack = [];
  for (let y = roi.y; y < roi.y + roi.h; y++) {
    for (let x = roi.x; x < roi.x + roi.w; x++) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;
      visited[start] = 1;
      stack.push(start);
      let area = 0;
      let peak = 0;
      let left = x, right = x, top = y, bottom = y;
      while (stack.length) {
        const current = stack.pop();
        const cy = Math.floor(current / width);
        const cx = current - cy * width;
        area++;
        peak = Math.max(peak, difference[current]);
        left = Math.min(left, cx);
        right = Math.max(right, cx);
        top = Math.min(top, cy);
        bottom = Math.max(bottom, cy);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < roi.x || nx >= roi.x + roi.w || ny < roi.y || ny >= roi.y + roi.h) continue;
            const next = ny * width + nx;
            if (mask[next] && !visited[next]) {
              visited[next] = 1;
              stack.push(next);
            }
          }
        }
      }
      if (area >= minArea) {
        acceptedPixels += area;
        boxes.push({ x: left, y: top, w: right - left + 1, h: bottom - top + 1, area, peak });
      }
    }
  }
  boxes.sort((a, b) => b.area - a.area);
  return { boxes, acceptedPixels };
}

export function inspectImages(referenceRGBA, sampleRGBA, width, height, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 20 || height < 20 || width * height > 1_000_000) {
    throw new RangeError("Image dimensions must be 20–1,000,000 pixels total.");
  }
  const pixelCount = width * height;
  if (referenceRGBA.length !== pixelCount * 4 || sampleRGBA.length !== pixelCount * 4) {
    throw new RangeError("Reference and sample must be equal-size RGBA images.");
  }
  const roi = normalizeRoi(options.roi, width, height);
  const threshold = clamp(Number(options.threshold ?? 42), 5, 150);
  const minArea = clamp(Math.round(Number(options.minArea ?? 30)), 1, 10000);
  const maxShift = clamp(Math.round(Number(options.maxShift ?? 8)), 0, 16);
  const referenceGray = grayscale(referenceRGBA, pixelCount);
  const sampleGray = grayscale(sampleRGBA, pixelCount);
  const referenceEdge = edges(blurred(referenceGray, width, height), width, height);
  const sampleEdge = edges(blurred(sampleGray, width, height), width, height);
  const offset = estimateOffset(referenceEdge, sampleEdge, width, height, roi, maxShift);
  const brightnessShift = estimateBrightness(referenceGray, sampleGray, width, height, roi, offset);
  const difference = new Uint8Array(pixelCount);
  const mask = new Uint8Array(pixelCount);
  let comparedPixels = 0;
  const border = 2;
  for (let y = roi.y + border; y < roi.y + roi.h - border; y++) {
    for (let x = roi.x + border; x < roi.x + roi.w - border; x++) {
      const sx = x + offset.x, sy = y + offset.y;
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
      const first = (y * width + x) * 4;
      const second = (sy * width + sx) * 4;
      const score = Math.max(
        Math.abs(referenceRGBA[first] - sampleRGBA[second] - brightnessShift),
        Math.abs(referenceRGBA[first + 1] - sampleRGBA[second + 1] - brightnessShift),
        Math.abs(referenceRGBA[first + 2] - sampleRGBA[second + 2] - brightnessShift)
      );
      const pixel = y * width + x;
      difference[pixel] = Math.round(clamp(score, 0, 255));
      if (score >= threshold) mask[pixel] = 1;
      comparedPixels++;
    }
  }
  const { boxes, acceptedPixels } = components(mask, difference, width, height, roi, minArea);
  return {
    verdict: boxes.length ? "review" : "clear",
    boxes,
    regions: boxes.length,
    anomalyPercent: Number((100 * acceptedPixels / Math.max(1, comparedPixels)).toFixed(2)),
    comparedPixels,
    offset: { x: offset.x, y: offset.y },
    alignmentScore: offset.alignmentScore,
    brightnessShift,
    threshold,
    minArea,
    roi,
    difference,
    mask
  };
}
