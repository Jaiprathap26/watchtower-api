import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AppError } from '../lib/errors';
import { monitorCreationLimiter } from '../middleware/rateLimiter';

const router = Router();

// Helper function to check monitor ownership
async function checkMonitorOwnership(monitorId: string, userId: string) {
  const monitor = await prisma.monitor.findUnique({
    where: { id: monitorId }
  });

  if (!monitor) {
    throw new AppError('Monitor not found', 404, 'MONITOR_NOT_FOUND');
  }

  if (monitor.userId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  return monitor;
}

// POST /api/monitors - Create new monitor with rate limiting
router.post('/', monitorCreationLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, url, interval } = req.body;

    // Validate required fields
    if (!name || !url || !interval) {
      throw new AppError('Name, URL, and interval are required', 400, 'MISSING_FIELDS');
    }

    // URL validation
    try {
      new URL(url);
    } catch {
      throw new AppError('Invalid URL format', 400, 'INVALID_URL');
    }

    // Interval validation
    if (interval < 1 || interval > 60) {
      throw new AppError('Interval must be between 1 and 60 minutes', 400, 'INVALID_INTERVAL');
    }

    const monitor = await prisma.monitor.create({
      data: {
        userId: req.userId!,
        name,
        url,
        interval,
        status: 'pending'
      }
    });

    res.status(201).json(monitor);
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: {
          message: error.message,
          code: error.code
        }
      });
      return;
    }

    console.error('Create monitor error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

// GET /api/monitors - Get all monitors for current user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const monitors = await prisma.monitor.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ monitors });
  } catch (error) {
    console.error('Get monitors error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

// GET /api/monitors/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const monitor = await checkMonitorOwnership(id, req.userId!);
    
    res.status(200).json(monitor);
  } catch (error: any) {
    // ADD DETAILED LOGGING
    console.error('[GET MONITOR ERROR]', {
      errorType: error.constructor.name,
      isAppError: error instanceof AppError,
      hasStatus: 'status' in error,
      statusValue: error.status,
      message: error.message,
      fullError: error
    });

    if (error instanceof AppError) {
      res.status(error.status).json({
        error: { message: error.message, code: error.code }
      });
      return;
    }

    console.error('Get monitor error (fallback):', error);
    res.status(500).json({
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/monitors/:id/stats - Get monitor stats with ownership check
router.get('/:id/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    await checkMonitorOwnership(id, req.userId!);

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Calculate uptimes
    const [checks24h, checks7d, checks30d] = await Promise.all([
      prisma.healthCheck.findMany({
        where: {
          monitorId: id,
          checkedAt: { gte: oneDayAgo }
        },
        select: { isUp: true, responseTimeMs: true }
      }),
      prisma.healthCheck.findMany({
        where: {
          monitorId: id,
          checkedAt: { gte: sevenDaysAgo }
        },
        select: { isUp: true, responseTimeMs: true }
      }),
      prisma.healthCheck.findMany({
        where: {
          monitorId: id,
          checkedAt: { gte: thirtyDaysAgo }
        },
        select: { isUp: true, responseTimeMs: true }
      })
    ]);

    const calculateUptime = (checks: any[]) => {
      if (checks.length === 0) return 0;
      const upChecks = checks.filter(c => c.isUp).length;
      return (upChecks / checks.length) * 100;
    };

    const calculateAvgResponseTime = (checks: any[]) => {
      if (checks.length === 0) return 0;
      const total = checks.reduce((sum, c) => sum + (c.responseTimeMs || 0), 0);
      return Math.round(total / checks.length);
    };

    const totalIncidents = await prisma.incident.count({
      where: { monitorId: id }
    });

    const currentIncident = await prisma.incident.findFirst({
      where: {
        monitorId: id,
        resolvedAt: null
      }
    });

    const currentStreak = currentIncident ? 0 : 100;

    res.status(200).json({
      uptime: {
        h24: Math.round(calculateUptime(checks24h) * 10) / 10,
        d7: Math.round(calculateUptime(checks7d) * 10) / 10,
        d30: Math.round(calculateUptime(checks30d) * 10) / 10
      },
      avgResponseTime: {
        h24: calculateAvgResponseTime(checks24h),
        d7: calculateAvgResponseTime(checks7d),
        d30: calculateAvgResponseTime(checks30d)
      },
      totalIncidents,
      currentStreak
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: {
          message: error.message,
          code: error.code
        }
      });
      return;
    }

    console.error('Get monitor stats error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

// GET /api/monitors/:id/checks - Get health checks with ownership check
router.get('/:id/checks', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = 100;
    const skip = (page - 1) * limit;

    await checkMonitorOwnership(id, req.userId!);

    const checks = await prisma.healthCheck.findMany({
      where: { monitorId: id },
      select: {
        id: true,
        isUp: true,
        statusCode: true,
        responseTimeMs: true,
        checkedAt: true
      },
      orderBy: { checkedAt: 'desc' },
      take: limit,
      skip: skip
    });

    const totalChecks = await prisma.healthCheck.count({
      where: { monitorId: id }
    });

    res.status(200).json({
      page,
      limit,
      totalChecks,
      totalPages: Math.ceil(totalChecks / limit),
      checks
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: {
          message: error.message,
          code: error.code
        }
      });
      return;
    }

    console.error('Get monitor checks error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

// GET /api/monitors/:id/incidents - Get incidents with ownership check
router.get('/:id/incidents', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await checkMonitorOwnership(id, req.userId!);

    const incidents = await prisma.incident.findMany({
      where: { monitorId: id },
      orderBy: { startedAt: 'desc' },
      take: 50
    });

    res.status(200).json({ incidents });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: {
          message: error.message,
          code: error.code
        }
      });
      return;
    }

    console.error('Get monitor incidents error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

// PUT /api/monitors/:id - Update monitor with ownership check
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, url, interval } = req.body;

    await checkMonitorOwnership(id, req.userId!);

    // Validate fields if provided
    if (url) {
      try {
        new URL(url);
      } catch {
        throw new AppError('Invalid URL format', 400, 'INVALID_URL');
      }
    }

    if (interval && (interval < 1 || interval > 60)) {
      throw new AppError('Interval must be between 1 and 60 minutes', 400, 'INVALID_INTERVAL');
    }

    const updatedMonitor = await prisma.monitor.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(url && { url }),
        ...(interval && { interval })
      }
    });

    res.status(200).json(updatedMonitor);
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: {
          message: error.message,
          code: error.code
        }
      });
      return;
    }

    console.error('Update monitor error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

// DELETE /api/monitors/:id - Delete monitor with ownership check
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await checkMonitorOwnership(id, req.userId!);

    await prisma.monitor.delete({
      where: { id }
    });

    res.status(200).json({ message: 'Monitor deleted successfully' });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: {
          message: error.message,
          code: error.code
        }
      });
      return;
    }

    console.error('Delete monitor error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

export default router;