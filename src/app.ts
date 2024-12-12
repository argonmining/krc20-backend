import express, {Request, Response} from 'express';
import dotenv from 'dotenv';
import {PrismaClient} from '@prisma/client';
import logger from './utils/logger';
import multer from 'multer';
import path from 'path';
import cors from 'cors'

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

// Import routers
const apiRouter = require('./routes/apiRoutes');

// Define CORS options
const corsOptions = {
    origin: '*', // Allow all origins
    methods: '*', // Allow all methods
    allowedHeaders: '*', // Allow all headers
};

// Use CORS middleware with options
app.use(cors(corsOptions));
app.use(express.json());
app.use(function (req, res, next) {
    logger.warn('middleware:', req);
    next();
});

// Use the routers
app.use('/api', apiRouter);

app.get('/health', (req, res) => {
    res.status(200).json({status: 'OK'});
});

app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);
});

interface MulterRequest extends Request {
    file?: Express.Multer.File;
}

app.get('/api/logos/:ticker', async (req, res) => {
    try {
        const {ticker} = req.params;
        const token = await prisma.token.findUnique({
            where: {tick: ticker.toUpperCase()},
            select: {logo: true},
        });

        if (!token || !token.logo) {
            return res.status(404).json({error: 'Logo not found for the specified token'});
        }

        // Extract the filename from the logo URL
        const logoFilename = path.basename(token.logo);

        // Construct the full path to the logo file
        const logoFilePath = path.join(uploadDir, logoFilename);

        // Send the file as a response
        res.sendFile(logoFilePath);
    } catch (error) {
        logger.error('Error fetching token logo:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

// Set up multer for file uploads
const uploadDir = process.env.FILESYSTEMDIR + '/static/krc20-logos' || '/var/www/static/krc20-logos'; // Provide a default value

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
app.post('/api/:ticker/upload-logo', upload.single('logo'), async (req: Request, res: Response) => {
    try {
        const ticker = req.params.ticker.toUpperCase(); // Convert ticker to uppercase
        if (!req.file) {
            return res.status(400).json({error: 'No file uploaded'});
        }

        // Check if the token exists
        const tokenExists = await prisma.token.findUnique({
            where: {tick: ticker},
        });

        if (!tokenExists) {
            return res.status(404).json({error: `Token with ticker ${ticker} not found`});
        }

        // Construct the logo URL
        const logoUrl = `/logos/${req.file.filename}`;

        // Update the database with the new logo URL
        await prisma.token.update({
            where: {tick: ticker},
            data: {logo: logoUrl}
        });

        res.status(200).json({message: 'File uploaded and database updated successfully', filename: req.file.filename});
    } catch (error) {
        logger.error('Error uploading file or updating database:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});