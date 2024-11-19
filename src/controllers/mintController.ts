import { z } from 'zod'
import catchAsync from '../utils/catchAsync'
import { dateSchema, PRICE_UPDATE_INTERVAL, prisma, tickSchema } from '../app'
import { Request, Response } from 'express'
import { fetchAndStorePriceData } from '../services/kasplex'

exports.getMintTotals = catchAsync(async (req: Request, res: Response) => {
    const { startDate, endDate } = z
        .object({
            startDate: dateSchema.optional(),
            endDate: dateSchema.optional(),
        })
        .parse(req.query)

    const dateFilter: any = {}
    if (startDate) {
        dateFilter.gte = new Date(startDate).getTime().toString()
    }
    if (endDate) {
        dateFilter.lte = new Date(endDate).getTime().toString()
    }

    const tokens = await prisma.token.findMany({
        select: {
            tick: true,
            _count: {
                select: {
                    transactions: {
                        where: {
                            op: 'mint',
                            ...(Object.keys(dateFilter).length > 0 && {
                                mtsAdd: dateFilter,
                            }),
                        },
                    },
                },
            },
        },
    })

    // Schedule price data updates every 15 minutes
    setInterval(fetchAndStorePriceData, PRICE_UPDATE_INTERVAL)

    // Initial fetch to avoid waiting 15 minutes
    fetchAndStorePriceData()

    const mintTotals = tokens.map(({ tick, _count }) => ({
        tick,
        mintTotal: _count.transactions,
    }))

    res.json(mintTotals)
}, 'Error fetching mint totals:')

exports.getMintsOverTime = catchAsync(async (req: Request, res: Response) => {
    const { tick } = z
        .object({
            tick: tickSchema,
        })
        .parse(req.query)

    const transactions = await prisma.transaction.findMany({
        where: {
            tick,
            op: 'mint',
        },
        select: {
            mtsAdd: true,
        },
    })

    const mintCounts = transactions.reduce(
        (acc: Record<string, number>, { mtsAdd }) => {
            const date = new Date(parseInt(mtsAdd)).toISOString().split('T')[0]
            if (!acc[date]) {
                acc[date] = 0
            }
            acc[date]++
            return acc
        },
        {},
    )

    const result = Object.entries(mintCounts).map(([date, count]) => ({
        date,
        count,
    }))

    res.json(result)
}, 'Error fetching mints over time:')
