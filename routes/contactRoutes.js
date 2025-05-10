const express = require('express');
const { sendContactEmail } = require('../controllers/contactController');

const router = express.Router();

// Contact form submission route
router.post('/', sendContactEmail);

module.exports = router; 