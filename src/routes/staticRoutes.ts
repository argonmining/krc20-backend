import express, {Request, Response} from 'express';
import * as fs from "fs";
import logger from "../utils/logger";
import path from "path";

const router = express.Router()
const filesystemDir = process.env.FILESYSTEMDIR || '/var/www';
const filepath = filesystemDir + '/static';

router.get('/logos/:filename', async (req: Request, res: Response) => loadFile(req, res, '/krc20-logos'))
router.get('/announcements/:filename', (req: Request, res: Response, next) => {
    logger.warn('announce')
    next()
}, async (req: Request, res: Response) => loadFile(req, res, '/announcements'))


const loadFile = (req: Request, res: Response, contentPath: string) => {
    const {filename} = req.params
    const pathToFile = `${filepath}${contentPath}/${filename}`
    logger.warn(pathToFile)
    logger.warn(fs.existsSync(pathToFile))

    if (fs.existsSync(pathToFile)) {
        logger.info(pathToFile + " exists")

        const options = {
            root: `${filepath}${contentPath}`
        };

        res.sendFile(filename, options, function (err) {
            if (err) {
                console.error('Error sending file:', err);
            } else {
                console.log('Sent:', filename);
            }
        });
        return
    } else {
        logger.info(pathToFile + " not exists")
        res.status(404).json({error: 'Content not found'})
    }
}

module.exports = router