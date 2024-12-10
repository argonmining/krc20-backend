import express from 'express';
import {PrismaClient} from '@prisma/client';

const router = express.Router()
const prisma = new PrismaClient();

router.get('/all', async (req, res) => {
    const announcements = await prisma.announcements.findMany({
        orderBy: {
            timestamp: 'asc',
        },
    })
    res.json({result: announcements})
})

module.exports = router