import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/status/:userId - Public status page (NO AUTH REQUIRED)
router.get('/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true }
    });

    if (!user) {
      res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
      return;
    }

    // Get all active monitors for this user
    const monitors = await prisma.monitor.findMany({
      where: {
        userId: userId,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        url: true,
        status: true,
        lastCheckedAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Calculate 7-day uptime for each monitor
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const monitorsWithUptime = await Promise.all(
      monitors.map(async (monitor) => {
        const checks = await prisma.healthCheck.findMany({
          where: {
            monitorId: monitor.id,
            checkedAt: { gte: sevenDaysAgo }  // ✅ FIXED: Use checkedAt
          },
          select: { isUp: true }
        });

        const totalChecks = checks.length;
        const upChecks = checks.filter(c => c.isUp).length;
        const uptime7d = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 0;

        return {
          id: monitor.id,
          name: monitor.name,
          url: monitor.url,
          status: monitor.status,
          lastCheckedAt: monitor.lastCheckedAt,
          uptime7d: Math.round(uptime7d * 10) / 10
        };
      })
    );

    // Get recent incidents (last 5 resolved across all monitors)
    const recentIncidents = await prisma.incident.findMany({
      where: {
        monitor: {
          userId: userId
        },
        resolvedAt: { not: null }
      },
      include: {
        monitor: {
          select: {
            name: true
          }
        }
      },
      orderBy: { resolvedAt: 'desc' },
      take: 5
    });

    const formattedIncidents = recentIncidents.map(incident => ({
      id: incident.id,
      monitorName: incident.monitor.name,
      startedAt: incident.startedAt,
      resolvedAt: incident.resolvedAt,
      durationSeconds: incident.durationSeconds
    }));

    // Calculate overall system status
    const totalMonitors = monitorsWithUptime.length;
    const upMonitors = monitorsWithUptime.filter(m => m.status === 'up').length;
    const downMonitors = monitorsWithUptime.filter(m => m.status === 'down').length;

    let overallStatus: 'operational' | 'partial' | 'major';
    if (downMonitors === 0) {
      overallStatus = 'operational';
    } else if (downMonitors === totalMonitors) {
      overallStatus = 'major';
    } else {
      overallStatus = 'partial';
    }

    res.status(200).json({
      user: {
        name: user.name
      },
      overallStatus,
      stats: {
        total: totalMonitors,
        up: upMonitors,
        down: downMonitors
      },
      monitors: monitorsWithUptime,
      recentIncidents: formattedIncidents
    });

  } catch (error) {
    console.error('Public status page error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

export default router;