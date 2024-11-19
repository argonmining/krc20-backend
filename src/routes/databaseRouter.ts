const express = require('express')
const {
    updateDatabase,
    updateDatabaseForTicker,
} = require('../controllers/databaseController')
const router = express.Router()

router.post('/update', updateDatabase)
router.post('/update/ticker', updateDatabaseForTicker)

export = router
