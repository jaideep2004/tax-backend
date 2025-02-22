const Wallet = require("../models/walletModel");
const User = require("../models/userModel");
const Razorpay = require("razorpay");
const { v4: uuidv4 } = require("uuid");

const REFERRAL_BONUS = {
	REFERRER: 100,
	REFEREE: 10,
};

// Get wallet details and transactions
async function getWalletDetails(req, res) {
	try {
		// First check if wallet exists
		let wallet = await Wallet.findOne({ userId: req.user._id });

		// If no wallet exists, get user info and create one
		if (!wallet) {
			const user = await User.findById(req.user._id);
			if (!user) {
				return res.status(404).json({ message: "User not found" });
			}

			wallet = new Wallet({
				userId: user._id,
				referralCode: user.referralCode, // Use the referral code from user
				balance: 0,
				transactions: [],
				withdrawalRequests: [],
			});
			await wallet.save();
		}

		res.json({ wallet });
	} catch (error) {
		console.error("Error in getWalletDetails:", error);
		res
			.status(500)
			.json({ message: "Error fetching wallet details", error: error.message });
	}
}

// Get transactions
async function getTransactions(req, res) {
	try {
		const wallet = await Wallet.findOne({ userId: req.user._id });
		if (!wallet) {
			return res.status(404).json({ message: "Wallet not found" });
		}

		res.json({ transactions: wallet.transactions });
	} catch (error) {
		res
			.status(500)
			.json({ message: "Error fetching transactions", error: error.message });
	}
}

async function requestWithdrawal(req, res) {
	const { amount, useReferralPoints } = req.body;

	if (!amount || amount <= 0) {
		return res.status(400).json({ message: "Invalid withdrawal amount" });
	}

	const wallet = await Wallet.findOne({ userId: req.user._id });
	if (!wallet) {
		return res.status(404).json({ message: "Wallet not found" });
	}

	let availableBalance = wallet.balance;
	if (useReferralPoints) {
		availableBalance += wallet.referralEarnings;
	}

	if (availableBalance < amount) {
		return res.status(400).json({ message: "Insufficient funds" });
	}

	if (useReferralPoints) {
		const remainingAmount = amount - wallet.balance;
		wallet.balance = Math.max(0, wallet.balance - amount);
		wallet.referralEarnings = Math.max(
			0,
			wallet.referralEarnings - remainingAmount
		);
	} else {
		wallet.balance -= amount;
	}

	wallet.withdrawalRequests.push({
		requestId: uuidv4(),
		amount,
		status: "pending",
		createdAt: new Date(),
	});

	await wallet.save();

	res.json({ message: "Withdrawal request submitted successfully" });
}

// Get referral stats
async function getReferralStats(req, res) {
	try {
		const user = await User.findById(req.user._id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// FIXED: Use referredUsers array instead of querying by referredBy
		const referredUserIds = user.referredUsers || [];
		const referredUsers = await User.find({
			_id: { $in: referredUserIds },
		}).select("name email createdAt _id");

		const wallet = await Wallet.findOne({ userId: req.user._id });
		if (!wallet) {
			return res.status(404).json({ message: "Wallet not found" });
		}

		const stats = {
			balance: wallet.balance,
			totalEarnings: wallet.referralEarnings,
			referralCode: user.referralCode,
			totalReferrals: referredUserIds.length,
			referredUsers: referredUsers.map((user) => ({
				id: user._id,
				name: user.name,
				email: user.email,
				joinedAt: user.createdAt,
			})),
		};

		res.json({ stats });
	} catch (error) {
		console.error("Error in getReferralStats:", error);
		res
			.status(500)
			.json({ message: "Error fetching referral stats", error: error.message });
	}
}

// Initialize wallet for new user
async function initializeWallet(userId, referralCode = null) {
	try {
		const user = await User.findById(userId);
		if (!user) {
			throw new Error("User not found");
		}

		let wallet = await Wallet.findOne({ userId });

		if (!wallet) {
			wallet = new Wallet({
				userId,
				referralCode: user.referralCode, // Use user's referral code
				referredBy: user.referredBy,
			});
			await wallet.save();
		}

		return wallet;
	} catch (error) {
		console.error("Error in initializeWallet:", error);
		throw error;
	}
}

async function handleReferral(referrerCode, refereeId) {
	try {
		// Find the referrer by referral code
		const referrer = await User.findOne({ referralCode: referrerCode });
		if (!referrer) {
			throw new Error("Invalid referral code");
		}

		// Credit referral bonus to the referrer
		await creditReferralBonus(referrer._id, refereeId, REFERRAL_BONUS.REFERRER);

		// Credit referral bonus to the referee (new user)
		await creditReferralBonus(refereeId, referrer._id, REFERRAL_BONUS.REFEREE);

		// Update the referredUsers array of the referrer
		await User.findByIdAndUpdate(referrer._id, {
			$push: { referredUsers: refereeId }, // Push the new referred user's ID
		});
		console.log(`Referred user added to ${referrer.name}'s referredUsers`);
	} catch (error) {
		console.error("Error in handleReferral:", error);
		throw error;
	}
}

async function creditReferralBonus(userId, referredUserId, amount) {
	const wallet = await Wallet.findOne({ userId });
	if (!wallet) throw new Error("Wallet not found");

	wallet.balance += amount;
	wallet.referralEarnings += amount;
	wallet.transactions.push({
		transactionId: uuidv4(),
		amount,
		type: "credit",
		status: "approved",
		description: `Referral bonus for referring user ${referredUserId}`,
	});

	await wallet.save();
}

module.exports = {
	getWalletDetails,
	getTransactions,
	requestWithdrawal,
	getReferralStats,
	initializeWallet,
	handleReferral,
};
