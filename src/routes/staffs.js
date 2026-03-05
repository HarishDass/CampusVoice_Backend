const express = require('express');
const router = express.Router();

const { searchStaffs } = require('../controllers/staffController');

router.get('/search', searchStaffs);

module.exports = router;
