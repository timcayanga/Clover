import assert from "node:assert/strict";
import { stepWalletSpring, walletCardLayout, walletGeometry } from "../../shared/account-wallet";

for (const width of [248, 320, 348, 600]) {
  for (const progress of [0, .1, .5, .9, 1]) {
    const card = walletCardLayout(width, progress);
    assert(Math.abs(card.cardWidth / card.cardHeight - 85.6 / 53.98) < 1e-10);
    assert(card.x >= 3 && card.x + card.cardWidth * card.scale <= width - 3);
    if (progress === 1) assert(card.y + card.cardHeight * card.scale < card.height - walletGeometry.sleeve);
  }
}
let state = { position: 0, velocity: 0 };
// Rapid reversals retain momentum, remain bounded, and settle at the requested end.
for (let frame = 0; frame < 500; frame++) {
  const target = frame < 100 ? Math.floor(frame / 7) % 2 : 1;
  const previous = state.position;
  state = stepWalletSpring(state.position, state.velocity, target, 1 / 60);
  assert(state.position >= 0 && state.position <= 1);
  assert(Math.abs(state.position - previous) < .15, "No discontinuous jump on reversal");
}
assert.deepEqual(state, { position: 1, velocity: 0 });
for (let frame = 0; frame < 200; frame++) state = stepWalletSpring(state.position, state.velocity, 0, 1 / 60);
assert.deepEqual(state, { position: 0, velocity: 0 });
console.log("PASS wallet physical proportions, sleeve clearance, rapid spring reversal and settling");
