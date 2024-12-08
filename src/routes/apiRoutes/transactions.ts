import express from 'express';
import {PrismaClient} from '@prisma/client';
import {z} from "zod";
import logger from "../../utils/logger";

const router = express.Router()
const prisma = new PrismaClient();
const tickSchema = z.string().min(1);
const dateSchema = z.string().datetime();

interface TransactionQuery {
    tick: string;
    startDate: string;
    endDate: string;
}

router.get('/api/transactions', async (req, res) => {
    try {
        const {tick, startDate, endDate} = z.object({
            tick: tickSchema,
            startDate: dateSchema,
            endDate: dateSchema,
        }).parse(req.query as unknown as TransactionQuery);

        const transactions = await prisma.transaction.findMany({
            where: {
                tick,
                mtsAdd: {
                    gte: startDate,
                    lte: endDate,
                },
            },
        });

        res.json(transactions);
    } catch (error) {
        logger.error('Error fetching transactions:', error);
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