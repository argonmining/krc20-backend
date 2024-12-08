import express from 'express';
import {PrismaClient} from '@prisma/client';
import {z} from "zod";
import logger from "../../utils/logger";
import path from "path";

const router = express.Router()
const prisma = new PrismaClient();
const tickSchema = z.string().min(1);

router.get('/TokenPriceData', async (req, res) => {
    try {
        const {tick, start, end} = z.object({
            tick: z.string().min(1),
            start: z.string().optional(),
            end: z.string().optional(),
        }).parse(req.query);

        const dateFilter: any = {};
        if (start) {
            dateFilter.gte = new Date(start);
        }
        if (end) {
            dateFilter.lte = new Date(end);
        }

        const priceData = await prisma.priceData.findMany({
            where: {
                tick,
                timestamp: Object.keys(dateFilter).length ? dateFilter : undefined,
            },
            orderBy: {
                timestamp: 'asc',
            }
        });

        res.json({result: priceData});
    } catch (error) {
        logger.error('Error fetching price data:', error);
        if (error instanceof z.ZodError) {
            res.status(400).json({error: 'Invalid input', details: error.errors});
        } else if (error instanceof Error) {
            res.status(500).json({error: 'Internal server error', message: error.message});
        } else {
            res.status(500).json({error: 'Internal server error'});
        }
    }
});

router.get('/tokens', async (req, res) => {
    try {
        const tokens = await prisma.token.findMany({
            select: {
                tick: true,
                max: true,
                lim: true,
                pre: true,
                to: true,
                dec: true,
                minted: true,
                opScoreAdd: true,
                opScoreMod: true,
                state: true,
                hashRev: true,
                mtsAdd: true,
                holderTotal: true,
                transferTotal: true,
                mintTotal: true,
                lastUpdated: true,
                logo: true,
                PriceData: {
                    select: {
                        valueKAS: true,
                        valueUSD: true,
                        change24h: true,
                    },
                    orderBy: {
                        timestamp: 'desc',
                    },
                    take: 1, // Get the latest price data
                },
            },
        });

        res.json({result: tokens});
    } catch (error) {
        logger.error('Error fetching tokens:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});


router.get('/tickers', async (req, res) => {
    try {
        const ticks = await prisma.token.findMany({
            select: {
                tick: true,
            },
        });

        const tickArray = ticks.map(token => token.tick);
        res.json({result: tickArray});
    } catch (error) {
        logger.error('Error fetching ticks:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

router.get('/tokenlist', async (req, res) => {
    console.log('tokenlist')
    try {
        const {limit = 100, cursor, sortBy = 'holderTotal', sortOrder = 'desc'} = req.query;

        // Convert limit to a number
        const take = parseInt(limit as string, 10);

        // Define allowed fields for sorting
        const allowedSortFields = [
            'tick', 'max', 'lim', 'pre', 'minted', 'mtsAdd', 'holderTotal', 'mintTotal'
        ];

        // Validate sortBy field
        if (!allowedSortFields.includes(sortBy as string)) {
            return res.status(400).json({error: 'Invalid sortBy field'});
        }

        // Validate sortOrder
        const order = sortOrder === 'asc' ? 'asc' : 'desc';

        // Fetch tokens with pagination and sorting
        const tokens = await prisma.token.findMany({
            take,
            skip: cursor ? 1 : 0, // Skip the cursor if provided
            cursor: cursor ? {tick: cursor as string} : undefined,
            orderBy: {
                [sortBy as string]: order, // Default sort is by mtsAdd in descending order
            },
            select: {
                tick: true,
                max: true,
                lim: true,
                pre: true,
                dec: true,
                minted: true,
                state: true,
                mtsAdd: true,
                holderTotal: true,
                mintTotal: true,
                logo: true,
            },
        });

        // Modify the response to set a default value for the dec field
        const modifiedTokens = tokens.map(token => ({
            ...token,
            dec: 8, // Set the default value for dec
            logo: token.logo ? `/logos/${path.basename(token.logo)}` : null,
        }));

        // Determine the next cursor
        const nextCursor = tokens.length === take ? tokens[tokens.length - 1].tick : null;

        res.json({
            result: modifiedTokens,
            nextCursor,
        });
    } catch (error) {
        logger.error('Error fetching token list:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});
router.get('/:tick', async (req, res) => {
    try {
        const {tick} = z.object({tick: tickSchema}).parse(req.params);

        // Fetch the token details
        const token = await prisma.token.findUnique({
            where: {tick},
            select: {
                tick: true,
                max: true,
                lim: true,
                pre: true,
                to: true,
                dec: true,
                minted: true,
                opScoreAdd: true,
                opScoreMod: true,
                state: true,
                hashRev: true,
                mtsAdd: true,
                holderTotal: true,
                transferTotal: true,
                mintTotal: true,
                lastUpdated: true,
                logo: true,
            },
        });

        if (!token) {
            return res.status(404).json({error: 'Token not found'});
        }

        // Fetch the balances related to the token
        const balances = await prisma.balance.findMany({
            where: {tokenTick: tick},
            select: {
                balance: true,
                holder: {
                    select: {
                        address: true,
                    },
                },
            },
        });

        // Construct the "holder" array
        const holderArray = balances.map(balance => ({
            address: balance.holder.address,
            amount: balance.balance,
        }));

        // Add the "holder" array to the token response
        const tokenWithHolders = {
            ...token,
            holder: holderArray,
        };

        res.json({result: tokenWithHolders});
    } catch (error) {
        logger.error('Error fetching token:', error);
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