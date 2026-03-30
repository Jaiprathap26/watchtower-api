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
// Get health check statistics for a monitor
// ============================================

router.get('/:id/stats', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Check ownership
        await checkMonitorOwnership(id, req.userId!);

        // Get recent health checks (last 100)
        const healthChecks = await prisma.healthCheck.findMany({
            where: { monitorId: id },
            orderBy: { checkedAt: 'desc' },
            take: 100
        });

        if (healthChecks.length === 0) {
            res.status(200).json({
                message: 'No health checks yet',
                stats: {
                    totalChecks: 0,
                    upCount: 0,
                    downCount: 0,
                    uptimePercentage: 0,
                    averageResponseTime: 0
                }
            });
            return;
        }

        // Calculate statistics
        const totalChecks = healthChecks.length;
        const upCount = healthChecks.filter(hc => hc.isUp).length;
        const downCount = totalChecks - upCount;
        const uptimePercentage = ((upCount / totalChecks) * 100).toFixed(2);

        const validResponseTimes = healthChecks
            .filter(hc => hc.responseTimeMs !== null)
            .map(hc => hc.responseTimeMs!);

        const averageResponseTime = validResponseTimes.length > 0
            ? Math.round(validResponseTimes.reduce((a, b) => a + b, 0) / validResponseTimes.length)
            : 0;

        res.status(200).json({
            stats: {
                totalChecks,
                upCount,
                downCount,
                uptimePercentage: parseFloat(uptimePercentage),
                averageResponseTime,
                recentChecks: healthChecks.slice(0, 10) // Last 10 checks
            }
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

export default router;