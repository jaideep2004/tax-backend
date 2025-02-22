const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const {
	managerLogin,
	getManagerDash,
	getAssignedEmployees,
	updateManagerProfile,
} = require("../controllers/managerController");

router.post("/login", managerLogin);

router.get("/mandashboard", authMiddleware, getManagerDash);
router.get("/assigned-employees", authMiddleware, getAssignedEmployees);

router.put("/update-manager-profile", authMiddleware, updateManagerProfile);

module.exports = router;
