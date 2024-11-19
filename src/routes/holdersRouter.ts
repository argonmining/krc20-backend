const express = require('express')
const {
    getAllHolders,
    getTopHolders,
} = require('../controllers/holdersController')

const router = express.Router()

router.get('/', getAllHolders)
router.get('/top', getTopHolders)

export = router
