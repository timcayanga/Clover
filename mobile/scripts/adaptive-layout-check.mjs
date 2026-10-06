import assert from 'node:assert/strict';
import { adaptiveLayout, adaptiveColumns, planCardLayout } from '../src/adaptive-layout.ts';
import { allowLayoutPreview } from '../src/layout-preview.ts';

for (const platform of ['ios', 'android']) {
  assert(!allowLayoutPreview(true, platform, false), 'Sample preview must never activate in native release builds');
  assert(allowLayoutPreview(true, platform, true));
  assert(!allowLayoutPreview(false, platform, true));
}
assert(allowLayoutPreview(true, 'web', false, 'localhost'));
assert(!allowLayoutPreview(true, 'web', true, 'clover.ph'));

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

const { usablePane, focusScrollDelta, supportsDetailPane } = await import('../src/device-geometry.ts');
assert.deepEqual(usablePane(1000, 800, []), { x: 0, y: 0, width: 1000, height: 800 });
assert.deepEqual(usablePane(1000, 800, [{ x: 490, y: 0, width: 20, height: 800, vertical: true, separating: true }]), { x: 0, y: 0, width: 490, height: 800 });
assert.deepEqual(usablePane(1000, 800, [{ x: 400, y: 0, width: 20, height: 800, vertical: true, separating: true }]), { x: 420, y: 0, width: 580, height: 800 });
assert.deepEqual(usablePane(800, 1000, [{ x: 0, y: 490, width: 800, height: 20, vertical: false, separating: true }]), { x: 0, y: 0, width: 800, height: 490 });
assert.deepEqual(usablePane(1000, 800, [{ x: 500, y: 0, width: 0, height: 800, vertical: true, separating: false }]), { x: 0, y: 0, width: 1000, height: 800 });
// OEM stale, outside-window and malformed coordinates cannot collapse the UI.
for (const x of [-30, 1001, NaN]) assert.equal(usablePane(1000, 800, [{ x, y: 0, width: 20, height: 800, vertical: true, separating: true }]).width, 1000);
const viewport = { x: 0, y: 50, width: 1000, height: 700 };
const field = { x: 20, y: 600, width: 300, height: 48 };
assert.equal(focusScrollDelta(field, viewport, null), 0);
assert.equal(focusScrollDelta(field, viewport, { x: 0, y: 500, width: 1000, height: 300 }), 164);
assert.equal(focusScrollDelta(field, viewport, { x: 500, y: 500, width: 400, height: 200 }), 0, 'Floating keyboard elsewhere must not move the field');
assert.equal(focusScrollDelta(field, viewport, { x: 100, y: 500, width: 400, height: 200 }), 164);
assert.equal(focusScrollDelta({ ...field, y: 20 }, viewport, null), -46);
assert.equal(focusScrollDelta(field, { ...viewport, height: 400 }, null), 214, 'Android already-resized viewport is respected without adding keyboard height twice');
assert(supportsDetailPane(1366));
assert(!supportsDetailPane(820));
assert(!supportsDetailPane(1366, 2), 'Large text returns to a readable single pane');
for (const width of [1600, 2048, 2560]) {
  assert(!supportsDetailPane(width, 2), 'The capped content width must govern large-text layout, not the display width');
  assert(!supportsDetailPane(width, 3), 'Maximum text size must remain readable on large displays');
}
console.log('PASS foldable panes, stale hinge data, floating/docked keyboards, resized viewports and accessible split thresholds');

assert.deepEqual(usablePane(1000, 800, [{ x: -10, y: 0, width: 20, height: 800, vertical: true, separating: true }]), { x: 10, y: 0, width: 990, height: 800 }, 'A partial hinge at the edge of a split window must still be avoided');
assert.deepEqual(usablePane(1000, 500, [{ x: 0, y: 490, width: 1000, height: 20, vertical: false, separating: true }]), { x: 0, y: 0, width: 1000, height: 490 }, 'A keyboard-resized window must not draw into the visible half of a hinge');
assert.deepEqual(usablePane(1200, 800, [{ x: 500, y: 0, width: 20, height: 800, vertical: true, separating: true }, { x: 850, y: 0, width: 20, height: 800, vertical: true, separating: true }]), { x: 0, y: 0, width: 500, height: 800 }, 'Multiple folds must choose the largest final pane, not a greedy intermediate pane');
console.log('PASS partial hinges in split/keyboard windows and multi-fold pane selection');
