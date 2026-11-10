import { describe, expect, it } from 'vitest';
import { orientationMatrix, planDraw, type OrientationHandling } from './process.ts';

type M = ReturnType<typeof orientationMatrix>;
const apply = ([a, b, c, d, e, f]: M, x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];

const RAW_NOT_UPRIGHT: OrientationHandling = { sizeUpright: false, drawUpright: false };
const FULLY_UPRIGHT: OrientationHandling = { sizeUpright: true, drawUpright: true };
const SIZE_ONLY: OrientationHandling = { sizeUpright: true, drawUpright: false };

describe('orientationMatrix', () => {
  // A raw 4×3 picture; where each raw corner should end up once upright.
  const w = 4;
  const h = 3;
  const cases: [number, [number, number][]][] = [
    // corners: top-left, top-right, bottom-left of the raw pixels
    [1, [[0, 0], [4, 0], [0, 3]]],
    [2, [[4, 0], [0, 0], [4, 3]]], // mirrored
    [3, [[4, 3], [0, 3], [4, 0]]], // upside down
    [4, [[0, 3], [4, 3], [0, 0]]], // flipped vertically
    [5, [[0, 0], [0, 4], [3, 0]]], // transposed
    [6, [[3, 0], [3, 4], [0, 0]]], // iPhone portrait: turn 90° clockwise
    [7, [[3, 4], [3, 0], [0, 4]]],
    [8, [[0, 4], [0, 0], [3, 4]]], // turn 90° anticlockwise
  ];
  it.each(cases)('orientation %i maps corners correctly', (orientation, [tl, tr, bl]) => {
    const m = orientationMatrix(orientation, w, h);
    expect(apply(m, 0, 0)).toEqual(tl);
    expect(apply(m, w, 0)).toEqual(tr);
    expect(apply(m, 0, h)).toEqual(bl);
  });
});

describe('planDraw', () => {
  const rawLandscape = { width: 4032, height: 3024 }; // how an iPhone stores a portrait photo

  it('turns a portrait iPhone photo upright when the browser does not', () => {
    const plan = planDraw(rawLandscape, 6, RAW_NOT_UPRIGHT, 2000);
    expect([plan.canvasWidth, plan.canvasHeight]).toEqual([1500, 2000]);
    expect([plan.drawWidth, plan.drawHeight]).toEqual([2000, 1500]);
    expect(plan.matrix).toEqual(orientationMatrix(6, 2000, 1500));
  });

  it('leaves it alone when the browser already draws it upright (never turns twice)', () => {
    const uprightSize = { width: 3024, height: 4032 };
    const plan = planDraw(uprightSize, 6, FULLY_UPRIGHT, 2000);
    expect(plan.matrix).toBeNull();
    expect([plan.canvasWidth, plan.canvasHeight]).toEqual([1500, 2000]);
  });

  it('handles a browser that reports upright size but draws raw pixels', () => {
    const plan = planDraw({ width: 3024, height: 4032 }, 6, SIZE_ONLY, 2000);
    expect(plan.matrix).not.toBeNull();
    expect([plan.drawWidth, plan.drawHeight]).toEqual([2000, 1500]);
    expect([plan.canvasWidth, plan.canvasHeight]).toEqual([1500, 2000]);
  });

  it('does nothing extra for photos that are already upright', () => {
    for (const handling of [RAW_NOT_UPRIGHT, FULLY_UPRIGHT, SIZE_ONLY]) {
      const plan = planDraw(rawLandscape, 1, handling, 2000);
      expect(plan.matrix).toBeNull();
      expect([plan.canvasWidth, plan.canvasHeight]).toEqual([2000, 1500]);
    }
  });

  it('keeps the same shape for upside-down photos and never scales up', () => {
    const plan = planDraw({ width: 800, height: 600 }, 3, RAW_NOT_UPRIGHT, 2000);
    expect([plan.canvasWidth, plan.canvasHeight]).toEqual([800, 600]);
    expect(plan.matrix).toEqual(orientationMatrix(3, 800, 600));
  });
});
