import assert from "node:assert/strict";
import test from "node:test";
import { inspectImages } from "./inspection-core.js";

const width = 100, height = 80;

function image(drawDefect = false, shiftX = 0, shiftY = 0, brighten = 0) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rx = x - shiftX, ry = y - shiftY;
      const plate = rx >= 12 && rx < 88 && ry >= 10 && ry < 70;
      const screw1 = (rx - 28) ** 2 + (ry - 28) ** 2 < 42;
      const screw2 = (rx - 70) ** 2 + (ry - 51) ** 2 < 42;
      const defect = drawDefect && rx >= 47 && rx < 59 && ry >= 35 && ry < 47;
      const value = Math.min(255, (screw1 || screw2 ? 65 : plate ? 170 : 25) + (defect ? 65 : 0) + brighten);
      const index = (y * width + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

test("identical part is clear", () => {
  const reference = image();
  const result = inspectImages(reference, image(), width, height, { threshold: 35, minArea: 15 });
  assert.equal(result.verdict, "clear");
  assert.equal(result.regions, 0);
});

test("localized defect is found with a bounding box", () => {
  const result = inspectImages(image(), image(true), width, height, { threshold: 35, minArea: 15 });
  assert.equal(result.verdict, "review");
  assert.ok(result.boxes.some((box) => box.x <= 47 && box.x + box.w >= 58));
});

test("global brightness change is compensated", () => {
  const result = inspectImages(image(), image(false, 0, 0, 15), width, height, { threshold: 35, minArea: 15 });
  assert.equal(result.verdict, "clear");
  assert.ok(Math.abs(result.brightnessShift + 15) <= 1);
});

test("small position shift is aligned before inspection", () => {
  const result = inspectImages(image(), image(false, 3, -2), width, height, { threshold: 35, minArea: 15, maxShift: 5 });
  assert.deepEqual(result.offset, { x: 3, y: -2 });
  assert.equal(result.verdict, "clear");
});

test("ROI ignores a defect outside the inspection zone", () => {
  const result = inspectImages(image(), image(true), width, height, {
    threshold: 35, minArea: 15, roi: { x: 12, y: 10, w: 24, h: 25 }, maxShift: 0
  });
  assert.equal(result.verdict, "clear");
});

test("wafer circle mask excludes corners but keeps central defects", () => {
  const outside = image();
  for (let y = 6; y < 14; y++) {
    for (let x = 7; x < 15; x++) {
      const index = (y * width + x) * 4;
      outside[index] = outside[index + 1] = outside[index + 2] = 240;
    }
  }
  const options = { threshold: 35, minArea: 15, maxShift: 0 };
  assert.equal(inspectImages(image(), outside, width, height, options).verdict, "review");
  assert.equal(inspectImages(image(), outside, width, height, { ...options, circleMask: true }).verdict, "clear");
  const central = inspectImages(image(), image(true), width, height, { ...options, circleMask: true });
  assert.equal(central.verdict, "review");
  assert.equal(central.maskMode, "circle");
});

test("input size mismatch is rejected", () => {
  assert.throws(() => inspectImages(image(), new Uint8Array(5), width, height), RangeError);
});
