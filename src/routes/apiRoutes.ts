import express from 'express';

const router = express.Router()

const tokenRouter = require('./apiRoutes/token')
const databaseRouter = require('./apiRoutes/database')
const mintingRouter = require('./apiRoutes/minting')
const holdersRouter = require('./apiRoutes/holders')
const transactionsRouter = require('./apiRoutes/transactions')

router.use('/token', tokenRouter)
router.use('/minting', mintingRouter)
router.use('/holders', holdersRouter)
router.use('/transactions', transactionsRouter)
// todo add auth for databaseactions
router.use('/database', databaseRouter)

module.exports = router