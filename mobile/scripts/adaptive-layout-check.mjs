import assert from 'node:assert/strict';
import { adaptiveLayout, adaptiveColumns, planCardLayout } from '../src/adaptive-layout.ts';

// Logical window sizes, not a hardware allowlist: cover phones, tablets,
// foldable cover/inner windows, split windows and landscape.
const windows = [[280,653],[320,568],[390,844],[430,932],[540,720],[600,960],[744,1133],[820,1180],[1024,1366],[1366,1024],[1600,900],[844,390]];
for (const [width, height] of windows) {
  for (const fontScale of [1, 1.3, 1.5, 2, 3]) {
    const layout = adaptiveLayout(width, height, fontScale);
    assert.equal(layout.compact, width < 600);
    assert.equal(layout.short, height < 500);
    const available = Math.min(width, layout.pageMaxWidth) - layout.gutter * 2;
    for (const min of [100, 140, 150, 300]) {
      const columns = adaptiveColumns(available, min, 4, 16, fontScale);
      assert(columns >= 1 && columns <= 4);
      const itemWidth = (available - (columns - 1) * 16) / columns;
      assert(itemWidth > 0);
      if (columns > 1) assert(itemWidth >= min * fontScale - .01, 'Columns must leave room for enlarged text');
      assert(Math.abs(itemWidth * columns + (columns - 1) * 16 - available) < .01);
    }
    const plans = planCardLayout(available, fontScale);
    assert(plans.width > 0 && plans.width <= available);
    assert(plans.width * plans.columns + (plans.columns - 1) * 16 <= available + .01, 'Visible comparison cards must fit the container');
    const sheet = Math.min(width, 720) - layout.gutter * 2;
    assert(sheet > 0 && sheet <= width);
  }
}
assert.equal(planCardLayout(1000).columns, 3);
assert.equal(planCardLayout(1000, 2).columns, 1);
assert.equal(adaptiveColumns(540, 300, 3), 1, 'A narrow tablet split window must use the phone layout');
assert.equal(adaptiveColumns(1080, 300, 3), 3);
console.log('PASS adaptive geometry: 12 windows × 5 text scales, readable columns, bounded forms and fitting plan cards');
