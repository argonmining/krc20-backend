import { Request, Response } from 'express'
import { prisma } from '../app'
import catchAsync from '../utils/catchAsync'

exports.getAllHolders = catchAsync(async (req: Request, res: Response) => {
    const holders = await prisma.token.findMany({
        select: {
            tick: true,
            holderTotal: true,
        },
    })

    res.json(holders)
}, 'Error fetching holders:')

exports.getTopHolders = catchAsync(async (req: Request, res: Response) => {
    const holders = await prisma.holder.findMany({
        include: {
            balances: {
                select: {
                    tokenTick: true,
                    balance: true,
                },
            },
        },
    })

    const formattedHolders = holders.map(holder => ({
        address: holder.address,
        balances: holder.balances.map(balance => ({
            tick: balance.tokenTick,
            balance: balance.balance,
        })),
    }))

    res.json(formattedHolders)
}, 'Error fetching top holders:')
