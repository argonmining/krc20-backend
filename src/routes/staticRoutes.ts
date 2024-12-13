import express, {Request, Response} from 'express';
import * as fs from "fs";
import logger from "../utils/logger";

const router = express.Router()
const filesystemDir = process.env.FILESYSTEMDIR || '/var/www';
const filepath = filesystemDir + '/static';

router.get('/logos/:filename', async (req: Request, res: Response) => loadFile(req, res, '/krc20-logos'))
router.get('/announcements/:filename/:extension', (req: Request, res: Response, next) => {
    logger.warn('announce')
    next()
}, async (req: Request, res: Response) => loadFile(req, res, '/announcements'))


const loadFile = (req: Request, res: Response, contentPath: string) => {
    const {filename, extension} = req.params
    const pathToFile = `${filepath}${contentPath}/${filename}.${extension}`
    logger.warn(pathToFile)
    logger.warn(fs.existsSync(pathToFile))

    if (fs.existsSync(pathToFile)) {
        logger.info(pathToFile + " exists")

        res.sendFile(pathToFile);
        return
    } else {
        logger.info(pathToFile + " not exists")
        res.status(404).json({error: 'Content not found'})
    }
}

module.exports = router