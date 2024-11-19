import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import { updateDatabase, updateDatabaseForTicker } from '../services/kasplex'
import logger from '../utils/logger'
import { z } from 'zod'
import { tickSchema } from '../app'

let isUpdating = false

exports.updateDatabase = catchAsync(async (req: Request, res: Response) => {
    if (isUpdating) {
        return res
            .status(400)
            .json({ error: 'Database update is already running' })
    }

    // Respond immediately to the API call
    res.json({ message: 'Database update started successfully' })

    // Proceed with the update in the background
    setImmediate(async () => {
        try {
            isUpdating = true
            await updateDatabase()
            logger.info('Database update completed successfully')
        } catch (error) {
            logger.error('Error updating database:', error)
        } finally {
            isUpdating = false
        }
    })
}, 'Error occurred while updating the database')

exports.updateDatabaseForTicker = catchAsync(
    async (req: Request, res: Response) => {
        const { tick } = z.object({ tick: tickSchema }).parse(req.body)

        if (isUpdating) {
            return res
                .status(400)
                .json({ error: 'Another update is already running' })
        }

        isUpdating = true
        res.json({
            message: `Database update for ticker ${tick} started successfully`,
        })

        await updateDatabaseForTicker(tick)
        logger.info(`Database update for ticker ${tick} completed successfully`)
    },
    'Error updating database for ticker',
)
