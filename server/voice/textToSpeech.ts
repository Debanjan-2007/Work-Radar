export class TextToSpeech {
  /**
   * Formats a crisp, conversational voice briefing string.
   */
  public static generateBriefingScript(options: {
    topTaskTitle?: string;
    topTaskReason?: string;
    remainingCount: number;
    dueTodayCount: number;
    overdueCount: number;
  }): string {
    const parts: string[] = [];

    if (options.overdueCount > 0) {
      parts.push(`Attention: you have ${options.overdueCount} overdue ${options.overdueCount === 1 ? 'task' : 'tasks'}.`);
    }

    if (options.topTaskTitle) {
      parts.push(`Your top priority is "${options.topTaskTitle}". ${options.topTaskReason || ''}`);
    } else {
      parts.push(`All clear! You currently have no active pending tasks.`);
    }

    parts.push(`Overall, there are ${options.remainingCount} tasks pending, with ${options.dueTodayCount} due today.`);

    return parts.join(' ');
  }
}
