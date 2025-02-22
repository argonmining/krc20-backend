import express from 'express';

const router = express.Router()

const tokenRouter = require('./apiRoutes/token')
const databaseRouter = require('./apiRoutes/database')
const mintingRouter = require('./apiRoutes/minting')
const holdersRouter = require('./apiRoutes/holders')
const transactionsRouter = require('./apiRoutes/transactions')
const announcementsRouter = require('./apiRoutes/announcements')
const staticRouter = require('./staticRoutes');
const whitelistRouter = require('./apiRoutes/whitelist');

router.use('/token', tokenRouter)
router.use('/minting', mintingRouter)
router.use('/holders', holdersRouter)
router.use('/transactions', transactionsRouter)
router.use('/announcements', announcementsRouter)
router.use('/static', staticRouter);
router.use('/whitelist', whitelistRouter);

// todo add auth for databaseactions
router.use('/database', databaseRouter)

module.exports = router