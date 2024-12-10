import express, {Request, Response} from 'express';
import {PrismaClient} from '@prisma/client';
import multer from "multer";
import logger from "../../utils/logger";

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
// Set up multer for file uploads
const uploadDir = (process.env.FILESYSTEMDIR ?? '/var/www') + '/announcements'; // Provide a default value

const storage = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        cb(null, uploadDir);
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        cb(null, file.originalname);
    },
});

const upload = multer({storage});

// Endpoint to upload a new logo and update the database
router.post('/create', upload.single('image'), async (req: Request, res: Response) => {
    try {
        if (req.body?.title === undefined){
            res.status(500).json({message: 'No Title',});
        }

        const announcement = await prisma.announcements.create({
            data: {
                title: req.body.title,
                text: req.body.text,
                timestamp: new Date(),
            },
        });
        if (req.file){
            // Construct the logo URL
            const announcementUrl = `/announcements/${req.file?.originalname}`;
            await prisma.announcements.update({
                where: {id: announcement.id},
                data: {imageUrl: announcementUrl}
            });

        }

        res.status(200).json({message: 'Announcement created successfully',});
    } catch (error) {
        logger.error('Error uploading file or updating database:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

module.exports = router