import { AiTaskExtractor, ExtractedTaskData } from '../engine/aiExtractor.js';
import { DuplicateDetector, DuplicateCheckResult } from '../engine/duplicateDetector.js';
import { TaskService } from './taskService.js';
import { db, DbTask } from '../db/database.js';

export interface CapturePayload {
  content: string;
  source?: 'gmail' | 'github' | 'outlook' | 'teams' | 'chrome' | 'manual';
  url?: string;
  sender?: string;
  subject?: string;
  forceCreate?: boolean; // if user acknowledges duplicate prompt
}

export interface CaptureResult {
  actionable: boolean;
  isDuplicate: boolean;
  duplicateDetails?: DuplicateCheckResult;
  extracted: ExtractedTaskData;
  task?: DbTask;
  sourceMessageId?: string;
  message: string;
}

export class CaptureService {
  /**
   * Processes an incoming raw piece of content from browser extension, web quick-add, or connector.
   */
  public static async processCapture(userId: string, payload: CapturePayload): Promise<CaptureResult> {
    const rawContent = (payload.content || '').trim();
    const source = payload.source || 'chrome';

    // 1. AI Task Extraction & Actionable Pre-filter
    const extracted = await AiTaskExtractor.extractTask(rawContent, {
      sender: payload.sender,
      url: payload.url
    });

    if (!extracted.isActionable) {
      return {
        actionable: false,
        isDuplicate: false,
        extracted,
        message: extracted.rejectionReason || 'Content filtered: Not identified as an actionable task.'
      };
    }

    // 2. Duplicate Detection against open tasks from past 14 days
    const openTasks = await db.getTasks(userId);
    const dupCheck = DuplicateDetector.checkDuplicate(
      { title: extracted.title, deadline: extracted.deadline },
      openTasks
    );

    // If likely duplicate and not explicitly forced by user confirmation, prompt user
    if (dupCheck.isPossibleDuplicate && !payload.forceCreate) {
      return {
        actionable: true,
        isDuplicate: true,
        duplicateDetails: dupCheck,
        extracted,
        message: `Likely duplicate detected: "${dupCheck.matchedTask?.title}". Please confirm action.`
      };
    }

    // 3. Create Authoritative Task through TaskService
    const createdTask = await TaskService.createTask(userId, {
      title: extracted.title,
      description: extracted.description,
      source,
      source_url: payload.url,
      deadline: extracted.deadline,
      importance: extracted.importance,
      urgency: extracted.urgency,
      user_priority: 0
    });

    // 4. Retain Original Source Message & Context (Section 25 & 32)
    const sourceMsg = await db.saveSourceMessage({
      user_id: userId,
      provider: source,
      sender: payload.sender || 'Chrome Extension / Quick Capture',
      subject: payload.subject || extracted.title,
      content: rawContent,
      source_url: payload.url,
      task_id: createdTask.id
    });

    return {
      actionable: true,
      isDuplicate: false,
      extracted,
      task: createdTask,
      sourceMessageId: sourceMsg.id,
      message: 'Task successfully analyzed, prioritized, and added to the Work Radar queue.'
    };
  }
}
