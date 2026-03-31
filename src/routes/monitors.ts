import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const createMonitorSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    url: z.string().url('Invalid URL format'),
    interval: z.number()
        .int('Interval must be an integer')
        .min(1, 'Interval must be at least 1 minute')
        .max(1440, 'Interval cannot exceed 1440 minutes (24 hours)')
});

const updateMonitorSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    url: z.string().url().optional(),
    interval: z.number().int().min(1).max(1440).optional(),
    isActive: z.boolean().optional()
});

// ============================================
// HELPER FUNCTION: CHECK MONITOR OWNERSHIP
// ============================================

/**
 * Verifies that a monitor exists and belongs to the specified user
 * @param monitorId - The monitor's ID
 * @param userId - The user's ID
 * @returns The monitor object if found and owned by user
 * @throws 404 if monitor doesn't exist, 403 if not owned by user
 */
async function checkMonitorOwnership(monitorId: string, userId: string) {
    const monitor = await prisma.monitor.findUnique({
        where: { id: monitorId }
    });

    // Monitor doesn't exist at all
    if (!monitor) {
        throw {
            status: 404,
            error: {
                message: 'Monitor not found',
                code: 'MONITOR_NOT_FOUND'
            }
        };
    }

    // Monitor exists but belongs to someone else
    if (monitor.userId !== userId) {
        throw {
            status: 403,
            error: {
                message: 'Access denied: you do not own this monitor',
                code: 'FORBIDDEN'
            }
        };
    }

    return monitor;
}

// ============================================
// ROUTE: POST /api/monitors
// Create a new monitor
// ============================================

router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        // Validate input
        const validatedData = createMonitorSchema.parse(req.body);

        // Create monitor (userId comes from auth middleware)
        const monitor = await prisma.monitor.create({
            data: {
                name: validatedData.name,
                url: validatedData.url,
                interval: validatedData.interval,
                userId: req.userId!, // Set by authMiddleware
                isActive: true,
                status: 'pending'
            }
        });

        res.status(201).json({
            message: 'Monitor created successfully',
            monitor
        });
    } catch (error) {
        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
            res.status(400).json({
                error: {
                    message: 'Validation failed',
                    code: 'VALIDATION_ERROR',
                    details: error.errors
                }
            });
            return;
        }

        // Handle unexpected errors
        console.error('Create monitor error:', error);
        res.status(500).json({
            error: {
                message: 'Internal server error',
                code: 'INTERNAL_ERROR'
            }
        });
    }
});

// ============================================
// ROUTE: GET /api/monitors
// Get all monitors for the authenticated user
// ============================================

router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const monitors = await prisma.monitor.findMany({
            where: {
                userId: req.userId!
            },
            orderBy: {
                createdAt: 'desc' // Newest first
            }
        });

        res.status(200).json({
            count: monitors.length,
            monitors
        });
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

// ============================================
// ROUTE: GET /api/monitors/:id
// Get a single monitor by ID (with ownership check)
// ============================================

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Check ownership (throws error if not owned or not found)
        const monitor = await checkMonitorOwnership(id, req.userId!);

        res.status(200).json({
            monitor
        });
    } catch (error: any) {
        // Handle custom errors from checkMonitorOwnership
        if (error.status) {
            res.status(error.status).json(error.error);
            return;
        }

        console.error('Get monitor by ID error:', error);
        res.status(500).json({
            error: {
                message: 'Internal server error',
                code: 'INTERNAL_ERROR'
            }
        });
    }
});

// ============================================
// ROUTE: PUT /api/monitors/:id
// Update a monitor (with ownership check)
// ============================================

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Validate input
        const validatedData = updateMonitorSchema.parse(req.body);

        // Check if there's anything to update
        if (Object.keys(validatedData).length === 0) {
            res.status(400).json({
                error: {
                    message: 'No valid fields provided for update',
                    code: 'NO_UPDATE_DATA'
                }
            });
            return;
        }

        // Check ownership
        await checkMonitorOwnership(id, req.userId!);

        // Update monitor
        const updatedMonitor = await prisma.monitor.update({
            where: { id },
            data: validatedData
        });

        res.status(200).json({
            message: 'Monitor updated successfully',
            monitor: updatedMonitor
        });
    } catch (error: any) {
        // Handle custom errors from checkMonitorOwnership
        if (error.status) {
            res.status(error.status).json(error.error);
            return;
        }

        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
            res.status(400).json({
                error: {
                    message: 'Validation failed',
                    code: 'VALIDATION_ERROR',
                    details: error.errors
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

// ============================================
// ROUTE: DELETE /api/monitors/:id
// Delete a monitor (with ownership check)
// ============================================

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Check ownership
        await checkMonitorOwnership(id, req.userId!);

        // Delete monitor (cascade will delete related records)
        await prisma.monitor.delete({
            where: { id }
        });

        res.status(204).send(); // No content
    } catch (error: any) {
        // Handle custom errors from checkMonitorOwnership
        if (error.status) {
            res.status(error.status).json(error.error);
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

// ============================================
// ROUTE: GET /api/monitors/:id/stats
// Get statistics for a monitor
// ============================================

router.get('/:id/stats', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Verify ownership
        await checkMonitorOwnership(id, req.userId!);

        // Define time windows
        const now = Date.now();
        const h24 = new Date(now - 24 * 60 * 60 * 1000);
        const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

        // Calculate 24h uptime
        const checks24h = await prisma.healthCheck.count({
            where: { monitorId: id, checkedAt: { gte: h24 } }
        });
        const upChecks24h = await prisma.healthCheck.count({
            where: { monitorId: id, checkedAt: { gte: h24 }, isUp: true }
        });
        const uptime24h = checks24h > 0 ? (upChecks24h / checks24h) * 100 : 100;

        // Calculate 7d uptime
        const checks7d = await prisma.healthCheck.count({
            where: { monitorId: id, checkedAt: { gte: d7 } }
        });
        const upChecks7d = await prisma.healthCheck.count({
            where: { monitorId: id, checkedAt: { gte: d7 }, isUp: true }
        });
        const uptime7d = checks7d > 0 ? (upChecks7d / checks7d) * 100 : 100;

        // Calculate 30d uptime
        const checks30d = await prisma.healthCheck.count({
            where: { monitorId: id, checkedAt: { gte: d30 } }
        });
        const upChecks30d = await prisma.healthCheck.count({
            where: { monitorId: id, checkedAt: { gte: d30 }, isUp: true }
        });
        const uptime30d = checks30d > 0 ? (upChecks30d / checks30d) * 100 : 100;

        // Calculate average response times
        const avgResponseTime24h = await prisma.healthCheck.aggregate({
            where: { monitorId: id, checkedAt: { gte: h24 }, responseTimeMs: { not: null } },
            _avg: { responseTimeMs: true }
        });

        const avgResponseTime7d = await prisma.healthCheck.aggregate({
            where: { monitorId: id, checkedAt: { gte: d7 }, responseTimeMs: { not: null } },
            _avg: { responseTimeMs: true }
        });

        const avgResponseTime30d = await prisma.healthCheck.aggregate({
            where: { monitorId: id, checkedAt: { gte: d30 }, responseTimeMs: { not: null } },
            _avg: { responseTimeMs: true }
        });

        // Count total incidents
        const totalIncidents = await prisma.incident.count({
            where: { monitorId: id }
        });

        // Calculate current uptime streak
        const recentChecks = await prisma.healthCheck.findMany({
            where: { monitorId: id },
            select: { isUp: true },
            orderBy: { checkedAt: 'desc' },
            take: 100
        });

        let currentStreak = 0;
        for (const check of recentChecks) {
            if (check.isUp) {
                currentStreak++;
            } else {
                break;
            }
        }

        res.status(200).json({
            uptime: {
                h24: parseFloat(uptime24h.toFixed(2)),
                d7: parseFloat(uptime7d.toFixed(2)),
                d30: parseFloat(uptime30d.toFixed(2))
            },
            avgResponseTime: {
                h24: Math.round(avgResponseTime24h._avg.responseTimeMs || 0),
                d7: Math.round(avgResponseTime7d._avg.responseTimeMs || 0),
                d30: Math.round(avgResponseTime30d._avg.responseTimeMs || 0)
            },
            totalIncidents,
            currentStreak
        });
    } catch (error: any) {
        if (error.status) {
            res.status(error.status).json(error.error);
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


// ============================================
// ROUTE: GET /api/monitors/:id/checks
// Get health check history for a monitor
// ============================================

router.get('/:id/checks', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = 100;
        const skip = (page - 1) * limit;

        // Verify ownership
        await checkMonitorOwnership(id, req.userId!);

        // Get health checks
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

        // Get total count for pagination
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
        if (error.status) {
            res.status(error.status).json(error.error);
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



export default router;