//customer routes
const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const uploadMiddleware = require("../middlewares/upload");
const uploadMiddleware2 = require("../middlewares/upload2");
const {
	getWalletDetails,
	requestWithdrawal,
	getTransactions,
	getReferralStats,
} = require("../controllers/walletController");

const {
	registerCustomer,
	loginUser,
	getServiceById,
	initiatePayment,
	getUserServices,
	getCustomerDashboard,
	handlePaymentSuccess,
	updateCustomerProfile,
	uploadDocuments,
	sendQuery,
	getCustomerQueriesWithReplies,
	submitFeedback,
	updateBankDetails,
	registerFlexiCustomer,
	processFlexiFunnelRedirect,
} = require("../controllers/customerController");

// const customerAuthMiddleware = require('../middlewares/customerAuthMiddleware');
const { createLead } = require('../controllers/leadController');

const router = express.Router();

router.get("/cdashboard", authMiddleware, getCustomerDashboard);
// Service details
router.get("/user-services/:serviceId", getServiceById);

// Customer registration
router.post("/user-register", registerCustomer);
router.post("/flexi-register", registerFlexiCustomer);
// Customer login
router.post("/user-login", loginUser);

// Initiate payment
router.post("/user-payment", initiatePayment);
router.get("/user-services", getUserServices);
router.post("/payment-success", handlePaymentSuccess);
router.put("/update-profile", authMiddleware, updateCustomerProfile);
router.post(
	"/upload-documents",
	authMiddleware,
	uploadMiddleware2,
	uploadDocuments
);
router.post("/sendQuery", uploadMiddleware2, sendQuery);
router.get("/queries", authMiddleware, getCustomerQueriesWithReplies);
// Route to fetch customer queries by user ID
router.post("/feedback", authMiddleware, submitFeedback);



//wallet
router.get("/wallet", authMiddleware, getWalletDetails);
router.post("/wallet/withdraw", authMiddleware, requestWithdrawal);
router.get("/wallet/transactions", authMiddleware, getTransactions);
router.get("/wallet/referral/stats", authMiddleware, getReferralStats);

router.post("/update-bank-details", authMiddleware, updateBankDetails);
// In customerRoutes.js, add a test route
router.get("/wallet/test", authMiddleware, (req, res) => {
	res.json({ message: "Wallet routes are working", user: req.user });
});

// Lead creation route (no auth required)
router.post('/lead', createLead);

module.exports = router;
