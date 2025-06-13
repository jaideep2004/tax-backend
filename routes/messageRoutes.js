const express = require("express");
const {
	sendMessage,
	getMessages,
	markMessageAsRead,
	replyToMessage,
} = require("../controllers/messageController");
const authMiddleware = require("../middlewares/authMiddleware");

const uploadMiddleware = require("../middlewares/upload");
const router = express.Router(); 

// Send a message
router.post("/send", authMiddleware, uploadMiddleware, sendMessage);

// Get all messages 
router.get("/", authMiddleware, getMessages);

// Mark messages as read
router.post("/mark-as-read", authMiddleware, markMessageAsRead);

// Reply to a message
router.patch(
	"/:messageId/reply",
	authMiddleware,
	uploadMiddleware,
	replyToMessage
);

module.exports = router;
