export interface ParsedVoiceCommand {
  type: 'QUERY_NEXT' | 'QUERY_SUMMARY' | 'CREATE_TASK' | 'UNKNOWN';
  rawTranscript: string;
  extractedTaskText?: string;
}

export class SpeechToText {
  /**
   * Parses audio transcripts or spoken commands.
   */
  public static parseCommand(transcript: string): ParsedVoiceCommand {
    const text = (transcript || '').trim();
    const lower = text.toLowerCase();

    // 1. "What should I do next?" / "What is next?" / "Top task"
    if (/(what('s| is| should i do) next|what task|top task|do this now)/i.test(lower)) {
      return {
        type: 'QUERY_NEXT',
        rawTranscript: text
      };
    }

    // 2. "What work is pending?" / "Daily briefing" / "Summary"
    if (/(how many tasks|work left|pending work|summary|briefing|status report)/i.test(lower)) {
      return {
        type: 'QUERY_SUMMARY',
        rawTranscript: text
      };
    }

    // 3. "Add task ...", "Remember to ...", "Remind me to ..."
    const addMatch = text.match(/(?:add task|remind me to|create task|new task|remember to)\s+(.+)/i);
    if (addMatch && addMatch[1]) {
      return {
        type: 'CREATE_TASK',
        rawTranscript: text,
        extractedTaskText: addMatch[1].trim()
      };
    }

    // Default fallback: treat as new work capture if long enough
    if (text.split(' ').length >= 3) {
      return {
        type: 'CREATE_TASK',
        rawTranscript: text,
        extractedTaskText: text
      };
    }

    return {
      type: 'UNKNOWN',
      rawTranscript: text
    };
  }
}
