import express from 'express';
import {PrismaClient} from '@prisma/client';
import logger from "../utils/logger";

const router = express.Router()
const prisma = new PrismaClient();


router.get('/holders', async (req, res) => {
    try {
        const holders = await prisma.token.findMany({
            select: {
                tick: true,
                holderTotal: true,
            },
        });
        res.json(holders);
    } catch (error) {
        logger.error('Error fetching holders:', error);
        if (error instanceof Error) {
            res.status(500).json({error: 'Internal server error', message: error.message});
        } else {
            res.status(500).json({error: 'Internal server error'});
        }
    }
});


router.get('/topHolders', async (req, res) => {
    try {
        const holders = await prisma.holder.findMany({
            include: {
                balances: {
                    select: {
                        tokenTick: true,
                        balance: true,
                    },
                },
            },
        });

        const formattedHolders = holders.map(holder => ({
            address: holder.address,
            balances: holder.balances.map(balance => ({
                tick: balance.tokenTick,
                balance: balance.balance,
            })),
        }));

        res.json(formattedHolders);
    } catch (error) {
        logger.error('Error fetching top holders:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

module.exports = router