import test from 'node:test';
import assert from 'node:assert';

// Priority Engine logic directly tested
function calculatePriority(input) {
  const now = new Date();

  // 1. Deadline Score (0 - 50)
  let deadlineScore = 0;
  if (input.deadline) {
    const deadlineDate = new Date(input.deadline);
    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;
    const dTime = deadlineDate.getTime();

    if (diffMs < 0) {
      deadlineScore = 50; // Overdue
    } else if (dTime >= todayStart && dTime <= todayEnd) {
      deadlineScore = 40; // Due Today
    } else if (diffHours <= 48) {
      deadlineScore = 30; // Tomorrow
    } else if (diffHours <= 72) {
      deadlineScore = 20; // Within 3 Days
    } else if (diffHours <= 168) {
      deadlineScore = 10; // Within 7 Days
    } else {
      deadlineScore = 0;
    }
  }
  deadlineScore = Math.min(50, Math.max(0, deadlineScore));

  // 2. Importance Score (0 - 30)
  let importanceScore = 15;
  const imp = (input.importance || 'MEDIUM').toUpperCase();
  if (imp === 'CRITICAL') importanceScore = 30;
  else if (imp === 'HIGH') importanceScore = 25;
  else if (imp === 'MEDIUM') importanceScore = 15;
  else if (imp === 'LOW') importanceScore = 5;
  importanceScore = Math.min(30, Math.max(0, importanceScore));

  // 3. Urgency Score (0 - 20)
  let urgencyScore = 8;
  const urg = (input.urgency || 'MEDIUM').toUpperCase();
  if (urg === 'CRITICAL') urgencyScore = 20;
  else if (urg === 'HIGH') urgencyScore = 14;
  else if (urg === 'MEDIUM') urgencyScore = 8;
  else if (urg === 'LOW') urgencyScore = 2;
  urgencyScore = Math.min(20, Math.max(0, urgencyScore));

  // 4. Source Score (0 - 10)
  let sourceScore = 3;
  const src = (input.source || 'manual').toLowerCase();
  if (src === 'client_email') sourceScore = 10;
  else if (src === 'gmail' || src === 'outlook' || src === 'work_email') sourceScore = 8;
  else if (src === 'github') sourceScore = 7;
  else if (src === 'chrome' || src === 'website') sourceScore = 5;
  else sourceScore = 3;
  sourceScore = Math.min(10, Math.max(0, sourceScore));

  // 5. Age Score (0 - 5)
  let ageScore = 0;
  if (input.createdAt) {
    const createdDate = new Date(input.createdAt);
    const daysOpen = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    ageScore = Math.min(5, Math.max(0, daysOpen));
  }

  // 6. User Priority (0 - 10)
  const userPriorityScore = Math.min(10, Math.max(0, Number(input.userPriority || 0)));

  // Total Score (Bounded max 125)
  const totalScore = Math.min(
    125,
    deadlineScore + importanceScore + urgencyScore + sourceScore + ageScore + userPriorityScore
  );

  // Derived Tier
  let tier = 'LOW';
  if (totalScore >= 120) tier = 'CRITICAL';
  else if (totalScore >= 80) tier = 'HIGH';
  else if (totalScore >= 40) tier = 'MEDIUM';
  else tier = 'LOW';

  return { deadlineScore, importanceScore, urgencyScore, sourceScore, ageScore, userPriorityScore, totalScore, tier };
}

test('PriorityEngine: enforces bounded ceiling of 125', () => {
  const result = calculatePriority({
    deadline: new Date(Date.now() - 100000).toISOString(), // Overdue = 50
    importance: 'CRITICAL', // 30
    urgency: 'CRITICAL',    // 20
    source: 'client_email', // 10
    createdAt: new Date(Date.now() - 3600000 * 24 * 10).toISOString(), // Age 10 days = 5
    userPriority: 10        // 10
  });

  // 50 + 30 + 20 + 10 + 5 + 10 = 125
  assert.strictEqual(result.totalScore, 125);
  assert.strictEqual(result.tier, 'CRITICAL');
});

test('PriorityEngine: correctly computes tiers at threshold boundaries', () => {
  // Low tier: < 40
  const low = calculatePriority({ importance: 'LOW', urgency: 'LOW', source: 'manual' });
  assert.ok(low.totalScore < 40, `Expected < 40, got ${low.totalScore}`);
  assert.strictEqual(low.tier, 'LOW');

  // Medium tier: 40 - 79
  const med = calculatePriority({
    deadline: new Date(Date.now() + 3600000 * 40).toISOString(), // Tomorrow = 30
    importance: 'MEDIUM', // 15
    urgency: 'LOW', // 2
    source: 'github' // 7 -> 30 + 15 + 2 + 7 = 54
  });
  assert.strictEqual(med.totalScore, 54);
  assert.strictEqual(med.tier, 'MEDIUM');

  // High tier: 80 - 119
  const high = calculatePriority({
    deadline: new Date().toISOString(), // Due today = 40
    importance: 'HIGH', // 25
    urgency: 'HIGH', // 14
    source: 'gmail', // 8
    userPriority: 5 // 5 -> 40 + 25 + 14 + 8 + 5 = 92
  });
  assert.strictEqual(high.totalScore, 92);
  assert.strictEqual(high.tier, 'HIGH');
});

test('PriorityEngine: clamps age score strictly to 5', () => {
  const oldTask = calculatePriority({
    createdAt: new Date(Date.now() - 3600000 * 24 * 30).toISOString() // 30 days ago
  });
  assert.strictEqual(oldTask.ageScore, 5);
});
