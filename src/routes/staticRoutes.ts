import express from 'express';
import path from "path";

const router = express.Router()
const filepath = process.env.FILESYSTEMDIR || '/var/www/krc20-logos';

router.use('/logos', express.static(filepath))

module.exports = router