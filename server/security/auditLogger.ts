import fs from 'fs';
import path from 'path';

export interface AuditEvent {
  id?: string;
  timestamp: string;
  eventType: 'AUTH_LOGIN' | 'AUTH_LOGOUT' | 'INTEGRATION_CONNECT' | 'INTEGRATION_DISCONNECT' | 'DATA_DELETION' | 'SECURITY_VIOLATION' | 'PRIORITY_DISAGREEMENT';
  userId?: string;
  ipAddress?: string;
  details: Record<string, any>;
}

export class AuditLogger {
  private static logFilePath: string = path.resolve(process.cwd(), 'audit.log');

  public static log(event: Omit<AuditEvent, 'timestamp'>): void {
    const fullEvent: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    const logEntry = JSON.stringify(fullEvent) + '\n';

    // Print to console in development
    console.log(`[AUDIT ${fullEvent.eventType}] User: ${fullEvent.userId || 'anonymous'} | ${JSON.stringify(fullEvent.details)}`);

    // Append to file asynchronously
    fs.appendFile(this.logFilePath, logEntry, (err) => {
      if (err) {
        console.error('[AuditLogger] Failed to write audit record to file:', err);
      }
    });
  }
}
