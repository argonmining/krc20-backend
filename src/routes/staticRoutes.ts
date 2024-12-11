import express, {Request, Response} from 'express';
import path from "path";
import * as fs from "fs";
import logger from "../utils/logger";

const router = express.Router()
const filepath = process.env.FILESYSTEMDIR || '/var/www';

const loadFile = (req: Request, res: Response, contentPath: string) => {
    const {filename} = req.params
    const pathToFile = path.join(filepath, contentPath, filename)

    if (fs.existsSync(pathToFile)) {
        logger.info(pathToFile + " exists")
        return res.sendFile(pathToFile)
    }
    logger.info(pathToFile + " not exists")
    return res.status(404).json({error: 'Content not found'})
}

router.use(express.static(path.join(filepath, '/krc20-logos')))
router.use(express.static(path.join(filepath, '/announcements')))

router.use('/logos/:filename', async (req: Request, res: Response) => loadFile(req, res, '/krc20-logos'))
router.use('/announcements/:filename', async (req: Request, res: Response) => loadFile(req, res, '/announcements'))

module.exports = router