const User = require("../models/userModel");
const Message = require("../models/messageModel");

// Send to a message

const replyToMessage = async (req, res) => {
	const { messageId } = req.params;
	const { replyContent } = req.body;
	const repliedBy = req.user?._id;

	if (!replyContent) {
		return res.status(400).json({ message: "Reply content is missing" });
	}

	try {
		const message = await Message.findById(messageId);
		if (!message) {
			return res.status(404).json({ message: "Message not found" });
		}

		// Construct the base URL properly
		const baseUrl = `${req.protocol}://${req.get("host")}`;

		const files =
			req.files?.map((file) => ({
				// fileUrl: `${baseUrl}/uploads/${req.user.userId}/${file.filename}`,
				fileUrl: `/uploads/${req.user.userId}/${file.filename}`,
				fileName: file.originalname,
				fileType: file.mimetype,
			})) || [];

		const replyData = {
			repliedBy,
			content: replyContent,
			files,
			createdAt: new Date(),
		};

		message.replyContent.push(replyData);
		message.isReplied = true;
		message.isRead = true;

		await message.save();
		res
			.status(200)
			.json({ message: "Reply sent successfully", updatedMessage: message });
	} catch (err) {
		console.error("Error replying to message:", err);
		res
			.status(500)
			.json({ message: "Error replying to message", error: err.message });
	}
};

// messageController.js
const sendMessage = async (req, res) => {
	console.log("Request body:", req.body);
	console.log("Files received:", req.files);
	console.log("User data:", req.user);

	const { recipientId, content, service, orderId } = req.body;
	const sender = req.user?._id || req.body.sender;

	if (!sender || sender === "undefined") {
		return res.status(400).json({ message: "Sender is invalid or missing" });
	}

	if (!recipientId || !content || !service) {
		return res.status(400).json({
			message: "Missing required fields: recipientId, content, or service",
		});
	}

	try {
		const messageData = {
			sender,
			recipient: recipientId,
			content,
			service,
			orderId, // Include orderId in message data
			files:
				req.files?.map((file) => ({
					fileUrl: `/uploads/${req.user._id}/${file.filename}`,
					fileName: file.originalname,
					fileType: file.mimetype,
				})) || [],
		};

		const newMessage = new Message(messageData);
		console.log("Creating message with data:", messageData);

		await newMessage.save();
		res.status(201).json({
			message: "Message sent successfully",
			newMessage,
		});
	} catch (err) {
		console.error("Error sending message:", err);
		res.status(500).json({
			message: "Error sending message",
			error: err.message,
		});
	}
};

const getMessages = async (req, res) => {
	const { _id, role } = req.user;
	const { serviceId, orderId, customerId } = req.query;

	try {
		let query = {};

		// Base query for non-admin users
		if (role !== "admin") {
			query = { $or: [{ sender: _id }, { recipient: _id }] };
		}

		// Apply service filter
		if (serviceId) {
			query.service = serviceId;
		}

		// Apply order filter
		if (orderId) {
			query.orderId = orderId;
		}

		// Apply customer filter
		if (customerId) {
			// If query already has $or from role filter
			if (query.$or) {
				query = {
					$and: [
						{ $or: query.$or },
						{ $or: [{ sender: customerId }, { recipient: customerId }] },
					],
				};
			} else {
				query.$or = [{ sender: customerId }, { recipient: customerId }];
			}
		}

		// console.log("Final query:", JSON.stringify(query, null, 2));

		const messages = await Message.find(query).sort({ createdAt: -1 }).lean();

		const populatedMessages = await Promise.all(
			messages.map(async (msg) => {
				const [senderUser, recipientUser] = await Promise.all([
					User.findById(msg.sender).select("_id name").lean(),
					User.findById(msg.recipient).select("_id name").lean(),
				]);

				return {
					...msg,
					sender: {
						_id: msg.sender,
						name: senderUser?.name || "Unknown",
					},
					recipient: {
						_id: msg.recipient,
						name: recipientUser?.name || "Unknown",
					},
				};
			})
		);

		res.status(200).json({ messages: populatedMessages });
	} catch (err) {
		console.error("Error fetching messages:", err);
		res.status(500).json({
			message: "Error fetching messages",
			error: err.message,
		});
	}
};
const markMessageAsRead = async (req, res) => {
	const { messageId } = req.params;

	try {
		const message = await Message.findById(messageId);
		if (!message) {
			return res.status(404).json({ message: "Message not found" });
		}

		if (message.isRead) {
			return res.status(200).json({
				message: "Message is already marked as read",
				updatedMessage: message,
			});
		}

		message.isRead = true;
		await message.save();

		res.json({ message: "Message marked as read", updatedMessage: message });
	} catch (err) {
		console.error("Error marking message as read:", err);
		res
			.status(500)
			.json({ message: "Error marking message as read", error: err.message });
	}
};

module.exports = {
	sendMessage,
	getMessages,
	markMessageAsRead,
	replyToMessage,
};
