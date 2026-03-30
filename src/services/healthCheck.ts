import prisma from '../lib/prisma';

interface Monitor {
    id: string;
    name: string;
    url: string;
    userId: string;
}

interface CheckResult {
    statusCode: number;
    responseTimeMs: number;
    isUp: boolean;
    error?: string;
}

/**
 * Checks a single monitor by fetching its URL
 * Records the result in the database
 * @param monitor - The monitor to check
 */
export async function checkMonitor(monitor: Monitor): Promise<void> {
    const startTime = Date.now();
    let result: CheckResult;

    try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        // Fetch the URL
        const response = await fetch(monitor.url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'WatchTower-Monitor/1.0'
            }
        });

        clearTimeout(timeoutId);

        // Calculate response time
        const responseTimeMs = Date.now() - startTime;

        // Determine if monitor is "up" (any 2xx or 3xx status is considered up)
        const isUp = response.status >= 200 && response.status < 400;

        result = {
            statusCode: response.status,
            responseTimeMs,
            isUp
        };

        console.log(`[CHECK] ${monitor.name} (${monitor.url}) → ${response.status} in ${responseTimeMs}ms`);

    } catch (error: any) {
        // Handle all failure cases
        const responseTimeMs = Date.now() - startTime;

        let errorMessage = 'Unknown error';

        if (error.name === 'AbortError') {
            errorMessage = 'Request timeout (>10s)';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'DNS lookup failed';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused';
        } else if (error.code === 'ECONNRESET') {
            errorMessage = 'Connection reset';
        } else if (error.message.includes('certificate')) {
            errorMessage = 'SSL certificate error';
        } else if (error.message) {
            errorMessage = error.message;
        }

        result = {
            statusCode: 0,
            responseTimeMs,
            isUp: false,
            error: errorMessage
        };

        console.log(`[CHECK] ${monitor.name} (${monitor.url}) → FAILED: ${errorMessage} (${responseTimeMs}ms)`);
    }

    try {
        // Save health check record
        await prisma.healthCheck.create({
            data: {
                monitorId: monitor.id,
                statusCode: result.statusCode || null,
                responseTimeMs: result.responseTimeMs,
                isUp: result.isUp
            }
        });

        // Update monitor status and last checked time
        const newStatus = result.isUp ? 'up' : 'down';

        await prisma.monitor.update({
            where: { id: monitor.id },
            data: {
                status: newStatus,
                lastCheckedAt: new Date()
            }
        });

    } catch (dbError) {
        console.error(`[ERROR] Failed to save health check for ${monitor.name}:`, dbError);
    }
}