import { Request, Response } from 'express'
import { prisma, tickSchema } from '../app'
import catchAsync from '../utils/catchAsync'
import { z } from 'zod'

exports.getAllTokens = catchAsync(async (req: Request, res: Response) => {
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
    })

    res.json(tokens)
}, 'Error fetching tokens: ')

exports.getTokenPriceData = catchAsync(async (req: Request, res: Response) => {
    const { tick, start, end } = z
        .object({
            tick: z.string().min(1),
            start: z.string().optional(),
            end: z.string().optional(),
        })
        .parse(req.query)

    const dateFilter: any = {}
    if (start) {
        dateFilter.gte = new Date(start)
    }
    if (end) {
        dateFilter.lte = new Date(end)
    }

    const priceData = await prisma.priceData.findMany({
        where: {
            tick,
            timestamp: Object.keys(dateFilter).length ? dateFilter : undefined,
        },
        orderBy: {
            timestamp: 'asc',
        },
    })

    res.json(priceData)
}, 'Error fetching price data:')

exports.getSingleToken = catchAsync(async (req: Request, res: Response) => {
    const { tick } = z.object({ tick: tickSchema }).parse(req.params)
    const token = await prisma.token.findUnique({ where: { tick } })
    if (!token) {
        res.status(404).json({ error: 'Token not found' })
    } else {
        res.json(token)
    }
}, 'Error fetching token:')
