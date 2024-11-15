import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import logger from './logger'

const catchAsync = (handler: any, loggerMessage?: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await handler(req, res, next)
        } catch (error: any) {
            if (loggerMessage) {
                logger.error(loggerMessage, error)
            } else {
                logger.error('An error occurred:', error)
            }

            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid input',
                    details: error.errors,
                })
            } else if (error instanceof Error) {
                res.status(500).json({
                    error: 'Internal server error',
                    message: error.message,
                })
            } else {
                res.status(500).json({ error: 'Internal server error' })
            }
            next(error)
        }
    }
}

export default catchAsync
