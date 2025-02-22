import express, {Request, Response} from 'express';
import * as fs from "fs";

const router = express.Router()
const filesystemDir = process.env.FILESYSTEMDIR || '/var/www';
const filepath = filesystemDir + '/static';

router.get('/logos/:filename', async (req: Request, res: Response) => loadFile(req, res, '/krc20-logos'))
router.get('/announcements/:filename/:extension', async (req: Request, res: Response) => loadFile(req, res, '/announcements'))


const loadFile = (req: Request, res: Response, contentPath: string) => {
    const {filename, extension} = req.params
    const pathToFile = `${filepath}${contentPath}/${filename}.${extension}`

    if (fs.existsSync(pathToFile)) {
        res.sendFile(pathToFile);
    } else {
        res.status(404).json({error: 'Content not found'})
    }
}

module.exports = router