import { SpeechToText } from './speechToText.js';
import { TextToSpeech } from './textToSpeech.js';
import { TaskService } from '../services/taskService.js';
import { CaptureService } from '../services/captureService.js';

export interface VoiceAgentResponse {
  spokenText: string;
  actionTaken: 'FETCHED_NEXT' | 'FETCHED_SUMMARY' | 'TASK_CREATED' | 'UNRECOGNIZED';
  taskData?: any;
}

export class VoiceAgent {
  public static async processVoiceInput(transcript: string, userId: string): Promise<VoiceAgentResponse> {
    const command = SpeechToText.parseCommand(transcript);

    if (command.type === 'QUERY_NEXT') {
      const topTask = await TaskService.getNextTask(userId);
      if (topTask) {
        const spoken = `Your top task is "${topTask.title}". ${topTask.reason || ''}`;
        return {
          spokenText: spoken,
          actionTaken: 'FETCHED_NEXT',
          taskData: topTask
        };
      } else {
        return {
          spokenText: 'Your radar is clear! There are no pending tasks right now.',
          actionTaken: 'FETCHED_NEXT'
        };
      }
    }

    if (command.type === 'QUERY_SUMMARY') {
      const stats = await TaskService.getWorkStatus(userId);
      const topTask = await TaskService.getNextTask(userId);
      const briefing = TextToSpeech.generateBriefingScript({
        topTaskTitle: topTask?.title,
        topTaskReason: topTask?.reason,
        remainingCount: stats.remaining,
        dueTodayCount: stats.dueToday,
        overdueCount: stats.overdue
      });

      return {
        spokenText: briefing,
        actionTaken: 'FETCHED_SUMMARY',
        taskData: stats
      };
    }

    if (command.type === 'CREATE_TASK' && command.extractedTaskText) {
      // Route through authoritative capture pipeline (AI extraction + Dup Check + TaskService)
      const captureResult = await CaptureService.processCapture(userId, {
        content: command.extractedTaskText,
        source: 'manual'
      });

      const spoken = `Got it. Added task "${captureResult.task?.title || command.extractedTaskText}" with priority ${captureResult.task?.priority || 'MEDIUM'}.`;
      return {
        spokenText: spoken,
        actionTaken: 'TASK_CREATED',
        taskData: captureResult
      };
    }

    return {
      spokenText: `I didn't quite catch that. You can ask "What should I do next?", "What work is pending?", or dictate a task.`,
      actionTaken: 'UNRECOGNIZED'
    };
  }
}
