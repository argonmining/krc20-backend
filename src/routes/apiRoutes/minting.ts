import express from 'express';
import {PrismaClient} from '@prisma/client';
import {z} from "zod";
import logger from "../../utils/logger";
import {fetchAndStorePriceData} from "../../services/kasplex";

const router = express.Router()
const prisma = new PrismaClient();
const tickSchema = z.string().min(1);
const dateSchema = z.string().datetime();
const PRICE_UPDATE_INTERVAL = parseInt(process.env.PRICE_UPDATE_INTERVAL || '15') * 60 * 1000; // 15 minutes in milliseconds

router.get('/mint-Totals', async (req, res) => {
    try {
        const {startDate, endDate} = z.object({
            startDate: dateSchema.optional(),
            endDate: dateSchema.optional(),
        }).parse(req.query);

        const dateFilter: any = {};
        if (startDate) {
            dateFilter.gte = new Date(startDate).getTime().toString();
        }
        if (endDate) {
            dateFilter.lte = new Date(endDate).getTime().toString();
        }

        const tokens = await prisma.token.findMany({
            select: {
                tick: true,
                _count: {
                    select: {
                        transactions: {
                            where: {
                                op: 'mint',
                                ...(Object.keys(dateFilter).length > 0 && {mtsAdd: dateFilter}),
                            },
                        },
                    },
                },
            },
        });

        // Schedule price data updates every 15 minutes
        setInterval(fetchAndStorePriceData, PRICE_UPDATE_INTERVAL);

        // Initial fetch to avoid waiting 15 minutes
        fetchAndStorePriceData();

        const mintTotals = tokens.map(({tick, _count}) => ({
            tick,
            mintTotal: _count.transactions,
        }));

        res.json(mintTotals);
    } catch (error) {
        logger.error('Error fetching mint totals:', error);
        if (error instanceof z.ZodError) {
            res.status(400).json({error: 'Invalid input', details: error.errors});
        } else if (error instanceof Error) {
            res.status(500).json({error: 'Internal server error', message: error.message});
        } else {
            res.status(500).json({error: 'Internal server error'});
        }
    }
});

router.get('/mintsovertime', async (req, res) => {
    try {
        const {tick} = z.object({
            tick: tickSchema,
        }).parse(req.query);

        const transactions = await prisma.transaction.findMany({
            where: {
                tick,
                op: 'mint',
            },
            select: {
                mtsAdd: true,
            },
        });

        const mintCounts = transactions.reduce((acc: Record<string, number>, {mtsAdd}) => {
            const date = new Date(parseInt(mtsAdd)).toISOString().split('T')[0];
            if (!acc[date]) {
                acc[date] = 0;
            }
            acc[date]++;
            return acc;
        }, {});

        const result = Object.entries(mintCounts).map(([date, count]) => ({
            date,
            count,
        }));

        res.json(result);
    } catch (error) {
        logger.error('Error fetching mints over time:', error);
        if (error instanceof z.ZodError) {
            res.status(400).json({error: 'Invalid input', details: error.errors});
        } else if (error instanceof Error) {
            res.status(500).json({error: 'Internal server error', message: error.message});
        } else {
            res.status(500).json({error: 'Internal server error'});
        }
    }
});

module.exports = router