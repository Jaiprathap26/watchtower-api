import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import monitorsRouter from './routes/monitors';
import { authMiddleware } from './middleware/auth';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());  // Security headers
app.use(cors());    // Allow cross-origin requests
app.use(express.json());  // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use('/api/monitors', authMiddleware, monitorsRouter);

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
    console.log('╔════════════════════════════════════════╗');
    console.log('║   🚀 WatchTower API Server Running    ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`📍 Local:            http://localhost:${PORT}`);
    console.log(`🏥 Health Check:     http://localhost:${PORT}/api/health`);
    console.log('');
    console.log('🔐 AUTH ROUTES:');
    console.log(`   Register:         POST   ${PORT}/api/auth/register`);
    console.log(`   Login:            POST   ${PORT}/api/auth/login`);
    console.log(`   Profile:          GET    ${PORT}/api/auth/me`);
    console.log('');
    console.log('📊 MONITOR ROUTES:');
    console.log(`   Create Monitor:   POST   ${PORT}/api/monitors`);
    console.log(`   List Monitors:    GET    ${PORT}/api/monitors`);
    console.log(`   Get Monitor:      GET    ${PORT}/api/monitors/:id`);
    console.log(`   Update Monitor:   PUT    ${PORT}/api/monitors/:id`);
    console.log(`   Delete Monitor:   DELETE ${PORT}/api/monitors/:id`);
    console.log('');
    console.log(`🌍 Environment:      ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at:       ${new Date().toLocaleString()}`);
    console.log('════════════════════════════════════════');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    process.exit(0);
});