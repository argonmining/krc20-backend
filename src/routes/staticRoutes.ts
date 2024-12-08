import express from 'express';
import path from "path";

const router = express.Router()
const filepath = process.env.FILESYSTEMDIR || '/var/www/';

router.use('/logos', express.static(path.join(filepath, 'krc20-logos')))

module.exports = router