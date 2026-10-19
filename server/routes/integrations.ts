import { Router } from 'express';
import { integrationManager } from '../integrations/integration.manager.js';
import { db } from '../db/database.js';
import { CaptureService } from '../services/captureService.js';
import { AuditLogger } from '../security/auditLogger.js';

const router = Router();

// GET /api/v1/integrations - List user integrations
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const integrations = await db.getIntegrations(userId);

    // Sanitize: Never expose tokens to client (PRD Section 36 & Requirements)
    const sanitized = integrations.map(i => ({
      id: i.id,
      provider: i.provider,
      scopes: i.scopes,
      status: i.status,
      last_sync_at: i.last_sync_at,
      created_at: i.created_at
    }));

    res.json({
      integrations: sanitized,
      availableProviders: integrationManager.getAllProviders()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/v1/integrations/health - Run health check on all adapters
router.get('/health', async (req, res) => {
  try {
    const userId = req.user!.id;
    const health = await integrationManager.checkHealth(userId);
    res.json({ health });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/integrations/:provider/connect
router.post('/:provider/connect', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { provider } = req.params;
    const authCode = req.body.authCode || `mock-auth-${provider}-${Date.now()}`;

    const result = await integrationManager.connectProvider(provider, authCode, userId);

    AuditLogger.log({
      eventType: 'INTEGRATION_CONNECT',
      userId,
      details: { provider }
    });

    res.json({
      success: true,
      provider,
      status: 'CONNECTED',
      scopes: result.scopes
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/integrations/:provider/refresh
router.post('/:provider/refresh', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { provider } = req.params;
    await integrationManager.refreshProviderToken(provider, userId);
    res.json({ success: true, message: `Tokens refreshed for ${provider}` });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/integrations/:provider/sync - Pull messages & pass through CaptureService
router.post('/:provider/sync', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { provider } = req.params;
    const adapter = integrationManager.getAdapter(provider);

    if (!adapter) {
      return res.status(400).json({ error: 'Invalid provider', message: `Unknown provider: ${provider}` });
    }

    const messages = await adapter.fetchMessages(userId);
    const createdTasks: any[] = [];
    const duplicates: any[] = [];

    for (const msg of messages) {
      const result = await CaptureService.processCapture(userId, {
        content: msg.content,
        source: msg.provider,
        url: msg.sourceUrl,
        sender: msg.senderName ? `${msg.senderName} <${msg.sender}>` : msg.sender,
        subject: msg.subject
      });

      if (result.task) {
        createdTasks.push(result.task);
      } else if (result.isDuplicate) {
        duplicates.push({ message: msg, duplicateDetails: result.duplicateDetails });
      }
    }

    res.json({
      success: true,
      provider,
      fetchedCount: messages.length,
      createdCount: createdTasks.length,
      duplicateCount: duplicates.length,
      tasks: createdTasks,
      duplicates
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// DELETE /api/v1/integrations/:provider - Disconnect integration
router.delete('/:provider', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { provider } = req.params;
    await integrationManager.disconnectProvider(provider, userId);

    AuditLogger.log({
      eventType: 'INTEGRATION_DISCONNECT',
      userId,
      details: { provider }
    });

    res.json({ success: true, message: `Disconnected ${provider}` });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
