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
 * Handles incident creation and resolution
 * @param monitor - The monitor being checked
 * @param isUp - Whether the monitor is currently up
 */
async function handleIncident(monitor: Monitor, isUp: boolean): Promise<void> {
  try {
    console.log(`[DEBUG] handleIncident called for ${monitor.name}, isUp=${isUp}`);
    
    const openIncident = await prisma.incident.findFirst({
      where: {
        monitorId: monitor.id,
        resolvedAt: null
      }
    });

    console.log(`[DEBUG] Open incident found: ${openIncident ? 'YES' : 'NO'}`);

    if (!isUp) {
      // Monitor is DOWN
      if (!openIncident) {
        await prisma.incident.create({
          data: {
            monitorId: monitor.id,
            startedAt: new Date()
          }
        });
        console.log(`[INCIDENT] 🔴 New incident opened for ${monitor.name}`);
      } else {
        console.log(`[INCIDENT] 🔴 ${monitor.name} still down`);
      }

      // Update status to 'down'
      console.log(`[DEBUG] Updating ${monitor.name} status to 'down'`);
      const result = await prisma.monitor.update({
        where: { id: monitor.id },
        data: { status: 'down' }
      });
      console.log(`[DEBUG] Status updated successfully to: ${result.status}`);

    } else {
      // Monitor is UP
      if (openIncident) {
        const resolvedAt = new Date();
        const durationSeconds = Math.round(
          (resolvedAt.getTime() - openIncident.startedAt.getTime()) / 1000
        );

        await prisma.incident.update({
          where: { id: openIncident.id },
          data: {
            resolvedAt,
            durationSeconds
          }
        });

        console.log(
          `[INCIDENT] 🟢 Incident resolved for ${monitor.name} ` +
          `(downtime: ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s)`
        );
      }

      // Update status to 'up'
      console.log(`[DEBUG] Updating ${monitor.name} status to 'up'`);
      const result = await prisma.monitor.update({
        where: { id: monitor.id },
        data: { status: 'up' }
      });
      console.log(`[DEBUG] Status updated successfully to: ${result.status}`);
    }
  } catch (error) {
    console.error(`[ERROR] handleIncident failed for ${monitor.name}:`, error);
  }
}

/**
 * Checks a single monitor by fetching its URL
 * Records the result and handles incidents
 */
export async function checkMonitor(monitor: Monitor): Promise<void> {
    const startTime = Date.now();
    let result: CheckResult;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(monitor.url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'WatchTower-Monitor/1.0'
            }
        });

        clearTimeout(timeoutId);

        const responseTimeMs = Date.now() - startTime;
        const isUp = response.status >= 200 && response.status < 400;

        result = {
            statusCode: response.status,
            responseTimeMs,
            isUp
        };

        console.log(`[CHECK] ${monitor.name} → ${response.status} in ${responseTimeMs}ms`);

    } catch (error: any) {
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

        console.log(`[CHECK] ${monitor.name} → FAILED: ${errorMessage}`);
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

        // Update monitor's last checked time
        await prisma.monitor.update({
            where: { id: monitor.id },
            data: {
                lastCheckedAt: new Date()
            }
        });

        // Handle incident creation/resolution
        await handleIncident(monitor, result.isUp);

    } catch (dbError) {
        console.error(`[ERROR] Failed to save health check for ${monitor.name}:`, dbError);
    }
}