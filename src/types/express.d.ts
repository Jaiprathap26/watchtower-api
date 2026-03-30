import { Request } from 'express';

declare global {
    namespace Express {
        interface Request {
            userId?: string; // Will be set by auth middleware
        }
    }
}