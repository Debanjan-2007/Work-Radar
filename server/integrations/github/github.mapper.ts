import { NormalizedMessage } from '../integration.interface.js';

export interface RawGitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  html_url: string;
  user: {
    login: string;
    avatar_url?: string;
  };
  created_at: string;
  labels?: Array<{ name: string }>;
}

export class GitHubMapper {
  public static mapToNormalized(raw: RawGitHubIssue): NormalizedMessage {
    return {
      externalId: `github-issue-${raw.number}`,
      provider: 'github',
      sender: raw.user.login,
      senderName: raw.user.login,
      subject: `Issue #${raw.number}: ${raw.title}`,
      content: `${raw.title}\n\n${raw.body || ''}`,
      sourceUrl: raw.html_url,
      receivedAt: new Date(raw.created_at || Date.now()),
      metadata: {
        issueNumber: raw.number,
        labels: raw.labels?.map(l => l.name)
      }
    };
  }
}
