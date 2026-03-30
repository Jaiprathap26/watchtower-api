import cron from 'node-cron';
import prisma from '../lib/prisma';
import { checkMonitor } from './healthCheck';

/**
 * Runs health checks on all active monitors
 */
async function runHealthChecks(): Promise<void> {
    try {
        // Get all active monitors
        const activeMonitors = await prisma.monitor.findMany({
            where: {
                isActive: true
            },
            select: {
                id: true,
                name: true,
                url: true,
                userId: true
            }
        });

        if (activeMonitors.length === 0) {
            console.log('[SCHEDULER] No active monitors to check');
            return;
        }

        console.log(`[SCHEDULER] Checking ${activeMonitors.length} active monitor(s)...`);

        // Check all monitors in parallel
        // Using Promise.allSettled ensures one failure doesn't stop others
        const results = await Promise.allSettled(
            activeMonitors.map(monitor => checkMonitor(monitor))
        );

        // Count successes and failures
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        console.log(`[SCHEDULER] Completed: ${successful} successful, ${failed} failed`);

        // Log any rejected promises (shouldn't happen if checkMonitor handles errors properly)
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`[SCHEDULER] Monitor check failed unexpectedly:`, {
                    monitor: activeMonitors[index].name,
                    error: result.reason
                });
            }
        });

    } catch (error) {
        console.error('[SCHEDULER] Error running health checks:', error);
    }
}

/**
 * Starts the health check scheduler
 * Runs every minute
 */
export function startScheduler(): void {
    console.log('[SCHEDULER] Health check scheduler starting...');
    console.log('[SCHEDULER] Monitors will be checked every minute');

    // Schedule: runs every minute (at :00 seconds)
    // Cron syntax: * * * * *
    // ┬ ┬ ┬ ┬ ┬
    // │ │ │ │ │
    // │ │ │ │ └─── Day of week (0-7, 0 and 7 are Sunday)
    // │ │ │ └───── Month (1-12)
    // │ │ └─────── Day of month (1-31)
    // │ └───────── Hour (0-23)
    // └─────────── Minute (0-59)

    cron.schedule('* * * * *', () => {
        const now = new Date().toLocaleTimeString();
        console.log(`\n[SCHEDULER] ⏰ Running health checks at ${now}`);
        runHealthChecks();
    });

    // Run immediately on startup (optional)
    console.log('[SCHEDULER] Running initial health check...');
    runHealthChecks();
}