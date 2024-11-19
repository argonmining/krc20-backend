const express = require('express')
const router = express.Router()
const {
    getAllTokens,
    getTokenPriceData,
    getSingleToken,
} = require('../controllers/tokenController')

router.get('/', getAllTokens)
router.get('/price-data', getTokenPriceData)
router.get('/:tick', getSingleToken)

export = router
