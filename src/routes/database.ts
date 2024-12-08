import express from 'express';
import {z} from "zod";
import logger from "../utils/logger";
import {updateDatabase, updateDatabaseForTicker} from "../services/kasplex";

const router = express.Router()
let isUpdating = false;
const tickSchema = z.string().min(1);

// Initial log for time until first update
const UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
const initialNextUpdate = new Date(Math.ceil(new Date().getTime() / UPDATE_INTERVAL) * UPDATE_INTERVAL);
const initialTimeUntilNextUpdate = initialNextUpdate.getTime() - new Date().getTime();
const initialMinutesUntilNextUpdate = Math.round(initialTimeUntilNextUpdate / 60000);
logger.info(`Time until first database update: ${initialMinutesUntilNextUpdate} minutes`);

router.post('/updateDatabase', async (req, res) => {
    if (isUpdating) {
        return res.status(400).json({error: 'Database update is already running'});
    }

    // Respond immediately to the API call
    res.json({message: 'Database update started successfully'});

    // Proceed with the update in the background
    setImmediate(async () => {
        try {
            isUpdating = true;
            await updateDatabase();
            logger.info('Database update completed successfully');
        } catch (error) {
            logger.error('Error updating database:', error);
        } finally {
            isUpdating = false;
        }
    });
});

router.post('/updateDatabaseForTicker', async (req, res) => {
    try {
        const {tick} = z.object({tick: tickSchema}).parse(req.body);
        if (isUpdating) {
            return res.status(400).json({error: 'Another update is already running'});
        }

        isUpdating = true;
        res.json({message: `Database update for ticker ${tick} started successfully`});
        await updateDatabaseForTicker(tick);
    } catch (error) {
        logger.error(`Error updating database for ticker:`, error);
        res.status(500).json({error: 'Internal server error'});
    } finally {
        isUpdating = false;
    }
});

async function runDatabaseUpdate() {
    if (isUpdating) {
        logger.warn('Database update is already running');
        return;
    }

    try {
        isUpdating = true;
        await updateDatabase();
        logger.info('Database update completed successfully');
    } catch (error) {
        logger.error('Error updating database:', error);
    } finally {
        isUpdating = false;
    }
}

// Instead, let's schedule the first update
const scheduleNextUpdate = () => {
    const now = new Date();
    const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
    const delay = nextHour.getTime() - now.getTime();

    setTimeout(() => {
        if (process.env.HISTORICAL_UPDATE === 'false' && !isUpdating && process.env.UPDATING_SINGLE_TICKER === 'false') {
            runDatabaseUpdate();
        }
        scheduleNextUpdate(); // Schedule the next update
    }, delay);

    logger.info(`Next database update scheduled for ${nextHour.toISOString()}`);
};

// Start the scheduling
scheduleNextUpdate();

module.exports = router