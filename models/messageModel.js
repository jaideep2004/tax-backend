// const mongoose = require("mongoose");

// const fileSchema = {
// 	fileUrl: { type: String },
// 	fileName: { type: String },
// 	fileType: { type: String },
//   };

// const messageSchema = new mongoose.Schema(
// 	{
// 		content: { type: String, required: true },
// 		sender: { type: String, ref: "User", required: true }, // String type for sender
// 		recipient: { type: String, ref: "User", required: true }, // String type for recipient
// 		files: [fileSchema],
// 		service: { type: String, ref: "Service", required: true }, // Service reference (adjust if needed)
// 		isReplied: { type: Boolean, default: false },
// 		isRead: { type: Boolean, default: false },
// 		createdAt: { type: Date, default: Date.now },
// 		replyContent: [
// 			{
// 				repliedBy: { type: String, ref: "User" }, // String type for repliedBy
// 				content: { type: String },
// 				files: [
// 					{
// 						fileUrl: { type: String },
// 						fileName: { type: String },
// 						fileType: { type: String },
// 					},
// 				],
// 				createdAt: { type: Date, default: Date.now },
// 			},
// 		],
// 	},
// 	{ timestamps: true } // Automatically add createdAt and updatedAt
// );

// const Message = mongoose.model("Message", messageSchema);
// module.exports = Message;

// messageModel.js
const mongoose = require("mongoose");

const fileSchema = {
    fileUrl: { type: String },
    fileName: { type: String },
    fileType: { type: String },
};

const messageSchema = new mongoose.Schema(
    {
        content: { type: String, required: true },
        sender: { type: String, ref: "User", required: true },
        recipient: { type: String, ref: "User", required: true },
        files: [fileSchema],
        service: { type: String, ref: "Service", required: true },
        orderId: { type: String }, // Add orderId field
        isReplied: { type: Boolean, default: false },
        isRead: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
        replyContent: [
            {
                repliedBy: { type: String, ref: "User" },
                content: { type: String },
                files: [fileSchema],
                isRead: { type: Boolean, default: false },
                createdAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);
module.exports = Message;