import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import monitorsRouter from './routes/monitors';
import { authMiddleware } from './middleware/auth';
import { startScheduler } from './services/scheduler';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());  // Security headers
app.use(cors());    // Allow cross-origin requests
app.use(express.json());  // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies


// ============================================
// ROUTES
// ============================================

// Health check route
app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'WatchTower API'
    });
});

// Auth routes
app.use('/api/auth', authRouter);

// Monitor routes (protected)
app.use('/api/monitors', authMiddleware, monitorsRouter);

// 404 handler for undefined routes
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: {
            message: 'Route not found',
            code: 'ROUTE_NOT_FOUND',
            path: req.originalUrl
        }
    });
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║  🚀 WatchTower API Server Running         ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log(`\n📍 Server: http://localhost:${PORT}`);
    console.log('\n🔐 AUTH ENDPOINTS:');
    console.log('   POST   /api/auth/register');
    console.log('   POST   /api/auth/login');
    console.log('   GET    /api/auth/me');
    console.log('\n📊 MONITOR ENDPOINTS:');
    console.log('   POST   /api/monitors');
    console.log('   GET    /api/monitors');
    console.log('   GET    /api/monitors/:id');
    console.log('   GET    /api/monitors/:id/stats    - Get statistics');
    console.log('   PUT    /api/monitors/:id');
    console.log('   DELETE /api/monitors/:id');
    console.log(`\n⏰ Started: ${new Date().toLocaleString()}`);
    console.log('═══════════════════════════════════════════\n');

    // Start the health check scheduler
    startScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n[SERVER] SIGTERM signal received: closing server');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n[SERVER] SIGINT signal received: closing server');
    process.exit(0);
});