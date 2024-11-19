const express = require('express')
const router = express.Router()
const {
    getMintTotals,
    getMintsOverTime,
} = require('../controllers/mintController')

router.get('/totals', getMintTotals)
router.get('/overtime', getMintsOverTime)

export = router
