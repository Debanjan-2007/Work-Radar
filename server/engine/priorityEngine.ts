export interface PriorityInput {
  deadline?: string | Date | null;
  importance?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  source?: 'gmail' | 'github' | 'outlook' | 'teams' | 'chrome' | 'manual' | string;
  sourceType?: 'client_email' | 'work_email' | 'github' | 'website' | 'manual';
  createdAt?: string | Date;
  userPriority?: number;
}

export interface PriorityBreakdown {
  deadlineScore: number;    // 0-50
  importanceScore: number;  // 0-30
  urgencyScore: number;     // 0-20
  sourceScore: number;       // 0-10
  ageScore: number;          // 0-5
  userPriorityScore: number; // 0-10
  totalScore: number;        // 0-125
  tier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
}

export class PriorityEngine {
  /**
   * Computes the bounded priority score (0-125) and derived tier according to Section 19 & 20.
   */
  public static calculatePriority(input: PriorityInput): PriorityBreakdown {
    const now = new Date();

    // 1. Deadline Score (0 - 50)
    let deadlineScore = 0;
    let deadlineCategory = 'None';
    if (input.deadline) {
      const deadlineDate = new Date(input.deadline);
      const diffMs = deadlineDate.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // Start and end of today in local time
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayEnd = todayStart + 24 * 60 * 60 * 1000;
      const dTime = deadlineDate.getTime();

      if (diffMs < 0) {
        deadlineScore = 50; // Overdue
        deadlineCategory = 'Overdue';
      } else if (dTime >= todayStart && dTime <= todayEnd) {
        deadlineScore = 40; // Due Today
        deadlineCategory = 'Due Today';
      } else if (diffHours <= 48) {
        deadlineScore = 30; // Tomorrow
        deadlineCategory = 'Due Tomorrow';
      } else if (diffHours <= 72) {
        deadlineScore = 20; // Within 3 Days
        deadlineCategory = 'Due within 3 days';
      } else if (diffHours <= 168) {
        deadlineScore = 10; // Within 7 Days
        deadlineCategory = 'Due this week';
      } else {
        deadlineScore = 0;
        deadlineCategory = 'Upcoming';
      }
    }
    deadlineScore = Math.min(50, Math.max(0, deadlineScore));

    // 2. Importance Score (0 - 30)
    let importanceScore = 15; // default MEDIUM
    const imp = (input.importance || 'MEDIUM').toUpperCase();
    if (imp === 'CRITICAL') importanceScore = 30;
    else if (imp === 'HIGH') importanceScore = 25;
    else if (imp === 'MEDIUM') importanceScore = 15;
    else if (imp === 'LOW') importanceScore = 5;
    importanceScore = Math.min(30, Math.max(0, importanceScore));

    // 3. Urgency Score (0 - 20)
    let urgencyScore = 8; // default MEDIUM
    const urg = (input.urgency || 'MEDIUM').toUpperCase();
    if (urg === 'CRITICAL') urgencyScore = 20;
    else if (urg === 'HIGH') urgencyScore = 14;
    else if (urg === 'MEDIUM') urgencyScore = 8;
    else if (urg === 'LOW') urgencyScore = 2;
    urgencyScore = Math.min(20, Math.max(0, urgencyScore));

    // 4. Source Score (0 - 10)
    let sourceScore = 3;
    const src = (input.source || 'manual').toLowerCase();
    const srcType = input.sourceType;

    if (srcType === 'client_email') {
      sourceScore = 10;
    } else if (src === 'gmail' || src === 'outlook' || srcType === 'work_email') {
      sourceScore = 8;
    } else if (src === 'github') {
      sourceScore = 7;
    } else if (src === 'chrome' || src === 'website' || srcType === 'website') {
      sourceScore = 5;
    } else {
      sourceScore = 3;
    }
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

    // Total Score Clamped to 125
    const totalScore = Math.min(
      125,
      deadlineScore + importanceScore + urgencyScore + sourceScore + ageScore + userPriorityScore
    );

    // Derived Tier
    let tier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (totalScore >= 120) {
      tier = 'CRITICAL';
    } else if (totalScore >= 80) {
      tier = 'HIGH';
    } else if (totalScore >= 40) {
      tier = 'MEDIUM';
    } else {
      tier = 'LOW';
    }

    // Plain-language reason for Do This Now
    const reason = this.generateReason(deadlineCategory, imp, urg, totalScore);

    return {
      deadlineScore,
      importanceScore,
      urgencyScore,
      sourceScore,
      ageScore,
      userPriorityScore,
      totalScore,
      tier,
      reason
    };
  }

  private static generateReason(deadlineCat: string, importance: string, urgency: string, score: number): string {
    if (deadlineCat === 'Overdue') {
      return `This task is overdue and requires immediate attention (Score: ${score}).`;
    }
    if (deadlineCat === 'Due Today') {
      return `This task is due today with ${importance.toLowerCase()} importance and ${urgency.toLowerCase()} urgency.`;
    }
    if (importance === 'CRITICAL' || urgency === 'CRITICAL') {
      return `This task has critical importance and time-sensitive requirements.`;
    }
    if (deadlineCat === 'Due Tomorrow') {
      return `This task is due tomorrow and ranked as high priority in your queue.`;
    }
    return `Top-ranked task based on deadline proximity and strategic importance (Score: ${score}).`;
  }
}
