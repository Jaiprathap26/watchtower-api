import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import monitorsRouter from './routes/monitors';
import statusRouter from './routes/status'; // ADD THIS
import { authMiddleware } from './middleware/auth';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { AppError } from './lib/errors';
import { startScheduler } from './services/scheduler';

dotenv.config();

const app = express();

// ============================================
// MIDDLEWARE (ORDER MATTERS!)
// ============================================
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Request logger - FIRST
app.use(requestLogger);

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// Auth routes
app.use('/api/auth', authRouter);
app.use('/api/status', statusRouter);
// Monitor routes (protected)
app.use('/api/monitors', authMiddleware, monitorsRouter);

// 404 handler - catch all undefined routes
app.use((req: Request, res: Response) => {
    throw new AppError('Route not found', 404, 'ROUTE_NOT_FOUND');
});

// Error handler - LAST
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================
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
  console.log('   GET    /api/monitors/:id/checks');
  console.log('   GET    /api/monitors/:id/stats');
  console.log('   PUT    /api/monitors/:id');
  console.log('   DELETE /api/monitors/:id');
  console.log('\n🌐 PUBLIC ENDPOINTS:');
  console.log('   GET    /api/status/:userId        - Public status page');
  console.log(`\n⏰ Started: ${new Date().toLocaleString()}`);
  console.log('═══════════════════════════════════════════\n');

    startScheduler();
});

process.on('SIGTERM', () => {
    console.log('\n[SERVER] SIGTERM signal received: closing server');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n[SERVER] SIGINT signal received: closing server');
    process.exit(0);
});