import { DbTask } from '../db/database.js';

export interface DuplicateCheckResult {
  isPossibleDuplicate: boolean;
  similarityScore: number;
  matchedTask?: DbTask;
  reason?: string;
}

export class DuplicateDetector {
  /**
   * Normalizes text by lowercasing, stripping punctuation, and trimming extra spaces.
   */
  public static normalize(text: string): string {
    return (text || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculates Levenshtein edit distance between two strings.
   */
  public static levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const matrix: number[][] = [];
    for (let i = 0; i <= m; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= n; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    return matrix[m][n];
  }

  /**
   * Calculates token overlap Jaccard similarity (0 to 1).
   */
  public static tokenSimilarity(a: string, b: string): number {
    const tokensA = new Set(this.normalize(a).split(' ').filter(w => w.length > 2));
    const tokensB = new Set(this.normalize(b).split(' ').filter(w => w.length > 2));

    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersectionCount = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersectionCount++;
    }

    const unionCount = new Set([...tokensA, ...tokensB]).size;
    return unionCount === 0 ? 0 : intersectionCount / unionCount;
  }

  /**
   * Checks if candidate task is a likely duplicate of open tasks from the last 14 days.
   */
  public static checkDuplicate(
    candidate: { title: string; deadline?: string | null },
    existingTasks: DbTask[]
  ): DuplicateCheckResult {
    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const normCandidate = this.normalize(candidate.title);

    // Filter to active tasks created/updated within last 14 days
    const recentTasks = existingTasks.filter(t => {
      if (['COMPLETED', 'CANCELLED'].includes(t.status)) return false;
      const tTime = new Date(t.created_at).getTime();
      return (now - tTime) <= fourteenDaysMs;
    });

    let bestMatch: DbTask | null = null;
    let highestSimilarity = 0;

    for (const task of recentTasks) {
      const normExisting = this.normalize(task.title);

      // Token overlap similarity
      const tokenSim = this.tokenSimilarity(normCandidate, normExisting);

      // String distance similarity
      const maxLen = Math.max(normCandidate.length, normExisting.length);
      const dist = this.levenshteinDistance(normCandidate, normExisting);
      const strSim = maxLen === 0 ? 1 : 1 - (dist / maxLen);

      // Combined similarity score
      const combinedSim = (tokenSim * 0.6) + (strSim * 0.4);

      // Check deadline proximity window
      let deadlineOverlap = false;
      if (candidate.deadline && task.deadline) {
        const d1 = new Date(candidate.deadline).getTime();
        const d2 = new Date(task.deadline).getTime();
        // Within 48 hours of each other
        if (Math.abs(d1 - d2) <= 48 * 60 * 60 * 1000) {
          deadlineOverlap = true;
        }
      } else if (!candidate.deadline && !task.deadline) {
        deadlineOverlap = true;
      }

      // Threshold: >= 0.70 similarity, or >= 0.60 with overlapping deadline
      const isMatch = combinedSim >= 0.75 || (combinedSim >= 0.60 && deadlineOverlap);

      if (isMatch && combinedSim > highestSimilarity) {
        highestSimilarity = combinedSim;
        bestMatch = task;
      }
    }

    if (bestMatch) {
      return {
        isPossibleDuplicate: true,
        similarityScore: Math.round(highestSimilarity * 100),
        matchedTask: bestMatch,
        reason: `Matched existing task "${bestMatch.title}" with ${Math.round(highestSimilarity * 100)}% title similarity.`
      };
    }

    return {
      isPossibleDuplicate: false,
      similarityScore: 0
    };
  }
}
