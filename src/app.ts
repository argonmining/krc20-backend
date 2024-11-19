import express from 'express'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import axios from 'axios'
import {
    updateDatabase,
    updateDatabaseForTicker,
    fetchAndStorePriceData,
} from './services/kasplex'
import logger from './utils/logger'
import { z } from 'zod'
import cors from 'cors'
import catchAsync from './utils/catchAsync'
import { Request, Response, NextFunction } from 'express'
import { ppid } from 'process'
import mintRouter from './routes/mintRouter'
import holdersRouter from './routes/holdersRouter'
import databaseRouter from './routes/databaseRouter'
import tokenRouter from './routes/tokenRouter'

dotenv.config()

const app = express()
export const prisma = new PrismaClient()
const port = process.env.PORT || 3000
export const PRICE_UPDATE_INTERVAL =
    parseInt(process.env.PRICE_UPDATE_INTERVAL || '15') * 60 * 1000 // 15 minutes in milliseconds

// Use CORS middleware with options

app.use(express.json())

export const dateSchema = z.string().datetime()
export const tickSchema = z.string().min(1)

interface TransactionQuery {
    tick: string
    startDate: string
    endDate: string
}

let isUpdating = false

async function runDatabaseUpdate() {
    if (isUpdating) {
        logger.warn('Database update is already running')
        return
    }

    try {
        isUpdating = true
        await updateDatabase()
        logger.info('Database update completed successfully')
    } catch (error) {
        logger.error('Error updating database:', error)
    } finally {
        isUpdating = false
    }
}

const UPDATE_INTERVAL = 60 * 60 * 1000 // 1 hour in milliseconds

// Instead, let's schedule the first update
const scheduleNextUpdate = () => {
    const now = new Date()
    const nextHour = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours() + 1,
        0,
        0,
        0,
    )
    const delay = nextHour.getTime() - now.getTime()

    setTimeout(() => {
        if (
            process.env.HISTORICAL_UPDATE === 'false' &&
            !isUpdating &&
            process.env.UPDATING_SINGLE_TICKER === 'false'
        ) {
            runDatabaseUpdate()
        }
        scheduleNextUpdate() // Schedule the next update
    }, delay)

    logger.info(`Next database update scheduled for ${nextHour.toISOString()}`)
}

// Start the scheduling
scheduleNextUpdate()

// Initial log for time until first update
const initialNextUpdate = new Date(
    Math.ceil(new Date().getTime() / UPDATE_INTERVAL) * UPDATE_INTERVAL,
)
const initialTimeUntilNextUpdate =
    initialNextUpdate.getTime() - new Date().getTime()
const initialMinutesUntilNextUpdate = Math.round(
    initialTimeUntilNextUpdate / 60000,
)
logger.info(
    `Time until first database update: ${initialMinutesUntilNextUpdate} minutes`,
)

app.use('/api/mints/', mintRouter)
app.use('/api/holders/', holdersRouter)
app.use('/api/database/', databaseRouter)
app.use('/api/tokens/', tokenRouter)

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' })
})

app.get(
    '/api/transactions',
    catchAsync(async (req: Request, res: Response) => {
        const { tick, startDate, endDate } = z
            .object({
                tick: tickSchema,
                startDate: dateSchema,
                endDate: dateSchema,
            })
            .parse(req.query as unknown as TransactionQuery)

        const transactions = await prisma.transaction.findMany({
            where: {
                tick,
                mtsAdd: {
                    gte: startDate,
                    lte: endDate,
                },
            },
        })

        res.json(transactions)
    }, 'Error fetching transactions:'),
)

app.listen(port, async () => {
    console.log(`Server is running on port ${port}`)
})

app.get(
    '/api/token/:tick',
    catchAsync(async (req: Request, res: Response) => {
        const { tick } = z.object({ tick: tickSchema }).parse(req.params)
        const token = await prisma.token.findUnique({ where: { tick } })
        if (!token) {
            res.status(404).json({ error: 'Token not found' })
        } else {
            res.json(token)
        }
    }, 'Error fetching token:'),
)

// app.post(
//     '/api/updateDatabaseForTicker',
//     catchAsync(async (req: Request, res: Response) => {
//         const { tick } = z.object({ tick: tickSchema }).parse(req.body)

//         if (isUpdating) {
//             return res
//                 .status(400)
//                 .json({ error: 'Another update is already running' })
//         }

//         isUpdating = true
//         res.json({
//             message: `Database update for ticker ${tick} started successfully`,
//         })

//         await updateDatabaseForTicker(tick)
//         logger.info(`Database update for ticker ${tick} completed successfully`)
//     }, 'Error updating database for ticker'),
//     () => {
//         isUpdating = false
//     },
// )
