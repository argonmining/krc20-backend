import express, {Request, Response} from 'express';
import * as fs from "fs";
import logger from "../utils/logger";
import path from "path";

const router = express.Router()
// const filepath = process.env.FILESYSTEMDIR || '\\var\\www';
const filepath = '/var/www';


router.get('/logos/:filename', async (req: Request, res: Response) => loadFile(req, res, '/krc20-logos'))
router.get('/announcements/:filename', (req, res, next) => {
    console.log({
        'req:': req,
        'res': res
    })
    next()
}, async (req: Request, res: Response) => loadFile(req, res, '/announcements'))

router.use('/logos', (req, res, next) => {
    console.log({
        'req:': req,
        'res': res
    })
    next()
}, express.static(path.join(filepath, '/krc20-logos')))
router.use('/announcements', (req, res, next) => {
    console.log({
        'req:': req,
        'res': res
    })
    next()
}, express.static(path.join(filepath, '/announcements')))

const loadFile = (req: Request, res: Response, contentPath: string) => {
    const {filename} = req.params
    const pathToFile = `${filepath}${contentPath}/${filename}`
    logger.error(pathToFile)

    if (fs.existsSync(pathToFile)) {
        logger.info(pathToFile + " exists")
        return res.sendFile(pathToFile)
    }
    logger.info(pathToFile + " not exists")
    return res.status(404).json({error: 'Content not found'})
}
module.exports = router