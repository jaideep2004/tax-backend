const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
	transactionId: {
		type: String,
		required: true,
	},
	amount: {
		type: Number,
		required: true,
	},
	type: {
		type: String,
		enum: ["credit", "debit"],
		required: true,
	},
	status: {
		type: String,
		enum: ["pending", "approved", "failed", "completed"],
		default: "pending",
	},
	description: {
		type: String,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
});

const withdrawalRequestSchema = new mongoose.Schema({
	requestId: {
		type: String,
		required: true,
	},
	amount: {
		type: Number,
		required: true,
	},
	status: {
		type: String,
		enum: ["pending", "approved", "rejected", "completed"],
		default: "pending",
	},
	reason: String,
	createdAt: {
		type: Date,
		default: Date.now,
	},
	processedAt: Date,
	transactionDetails: {
		transactionId: String,
		transferDate: String,
		remarks: String,
	},
});

const walletSchema = new mongoose.Schema({
	userId: {
		type: String,
		ref: "User",
		required: true,
		unique: true,
	},
	balance: {
		type: Number,
		default: 0,
	},
	referralCode: {
		type: String,
		required: true,
		unique: true,
	},
	referredBy: {
		type: String,
		ref: "User",
	},
	referralEarnings: {
		type: Number,
		default: 0,
	},
	transactions: [transactionSchema],
	withdrawalRequests: [withdrawalRequestSchema],
	createdAt: {
		type: Date,
		default: Date.now,
	},
	updatedAt: {
		type: Date,
		default: Date.now,
	},
});

// Update the updatedAt timestamp before saving
walletSchema.pre("save", function (next) {
	this.updatedAt = new Date();
	next();
});

const Wallet = mongoose.model("Wallet", walletSchema);
module.exports = Wallet;
