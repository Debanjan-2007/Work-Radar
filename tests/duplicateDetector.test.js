import test from 'node:test';
import assert from 'node:assert';

function normalize(text) {
  return (text || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenSimilarity(a, b) {
  const tokensA = new Set(normalize(a).split(' ').filter(w => w.length > 2));
  const tokensB = new Set(normalize(b).split(' ').filter(w => w.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersectionCount = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersectionCount++;
  }
  const unionCount = new Set([...tokensA, ...tokensB]).size;
  return intersectionCount / unionCount;
}

test('DuplicateDetector: flags near-identical titles', () => {
  const t1 = 'Submit Final Project Milestone Report';
  const t2 = 'Submit Final Project Milestone Deliverables Report';
  const sim = tokenSimilarity(t1, t2);
  assert.ok(sim >= 0.7, `Expected similarity >= 0.7, got ${sim}`);
});

test('DuplicateDetector: does not flag unrelated tasks', () => {
  const t1 = 'Fix Authentication Token Expiry Bug';
  const t2 = 'Make Presentation for Executive Stakeholders';
  const sim = tokenSimilarity(t1, t2);
  assert.ok(sim < 0.2, `Expected low similarity, got ${sim}`);
});
