import express from 'express';
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
const uploadDir = process.env.FILESYSTEMDIR + '/announcements' || '/var/www/announcements'; // Provide a default value

const storage = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        cb(null, uploadDir);
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        const ticker = req.params.ticker; // Get the ticker from the URL
        const extension = path.extname(file.originalname); // Preserve the original file extension
        cb(null, `${ticker}${extension}`);
    },
});

const upload = multer({storage});

// Endpoint to upload a new logo and update the database
router.post('/create', upload.single('image'), async (req: Request, res: Response) => {
    try {

        const announcement = await prisma.announcements.create({
            data: {
                title: req.title,
                text: req.text,
                timestamp: new Date(),
            },
        });
        if (req.file){
            // Construct the logo URL
            const announcementUrl = `/announcements/${req.file?.filename}`;
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
router.post('/create')

module.exports = router