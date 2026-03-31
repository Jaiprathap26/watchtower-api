import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { authMiddleware } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const registerSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters')
});

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required')
});

// ============================================
// RATE LIMITING
// ============================================

const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // 5 requests per window
    message: {
        error: {
            message: 'Too many authentication attempts, please try again later',
            code: 'RATE_LIMIT_EXCEEDED'
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// ============================================
// ROUTE: POST /api/auth/register
// ============================================

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        // 1. Validate request body
        const validatedData = registerSchema.parse(req.body);

        // 2. Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: validatedData.email }
        });

        if (existingUser) {
            res.status(409).json({
                error: {
                    message: 'Email already registered',
                    code: 'EMAIL_EXISTS'
                }
            });
            return;
        }

        // 3. Hash password
        const passwordHash = await bcrypt.hash(validatedData.password, 10);

        // 4. Create user in database
        const user = await prisma.user.create({
            data: {
                email: validatedData.email,
                passwordHash,
                name: validatedData.name || null
            },
            select: {
                id: true,
                email: true,
                name: true,
                createdAt: true
            }
        });

        // 5. Generate JWT token
        const token = signToken(user.id);

        // 6. Return success response
        res.status(201).json({
            message: 'User registered successfully',
            user,
            token
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
        console.error('Registration error:', error);
        res.status(500).json({
            error: {
                message: 'Internal server error',
                code: 'INTERNAL_ERROR'
            }
        });
    }
});

// ============================================
// ROUTE: POST /api/auth/login
// ============================================

router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        // 1. Validate request body
        const validatedData = loginSchema.parse(req.body);

        // 2. Find user by email
        const user = await prisma.user.findUnique({
            where: { email: validatedData.email }
        });

        // 3. Check if user exists
        if (!user) {
            res.status(401).json({
                error: {
                    message: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS'
                }
            });
            return;
        }

        // 4. Verify password
        const isPasswordValid = await bcrypt.compare(validatedData.password, user.passwordHash);

        if (!isPasswordValid) {
            res.status(401).json({
                error: {
                    message: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS'
                }
            });
            return;
        }

        // 5. Generate JWT token
        const token = signToken(user.id);

        // 6. Return success response (exclude passwordHash)
        res.status(200).json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                createdAt: user.createdAt
            },
            token
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
        console.error('Login error:', error);
        res.status(500).json({
            error: {
                message: 'Internal server error',
                code: 'INTERNAL_ERROR'
            }
        });
    }
});

// ============================================
// ROUTE: GET /api/auth/me
// ============================================

// GET /api/auth/me - Get current user info
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
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

    res.status(200).json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

export default router;