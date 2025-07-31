require("dotenv").config();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Service = require("../models/serviceModel");
const Razorpay = require("razorpay");
const fs = require("fs");
const path = require("path");
const {
	handleCustomerEmployeeAssignment,
} = require("../utils/customerAssignment");
const { handleReferral } = require("./walletController");
const Wallet = require("../models/walletModel");
const { CustomObjectId } = require("../utils/idGenerator");
const Lead = require("../models/leadModel");
const sendZeptoMail = require("../utils/sendZeptoMail");

const hashPassword = (password, salt) => {
	const hash = crypto.createHmac("sha256", salt);
	hash.update(password);
	return hash.digest("hex");
};

const getCustomerDashboard = async (req, res) => {
	try {
		// Use either userId or _id from the request user object for backward compatibility
		const userId = req.user.userId || req.user._id;
		
		console.log("Fetching dashboard for user:", userId);

		// Fetch user with properly populated service details
		const user = await User.findById(userId)
			.populate({
				path: "services.serviceId",
				select: "name description packages dueDate price salePrice gstRate",
			})
			.populate({
				path: "services.employeeId",
				select: "name email", 
			})
			.select("-passwordHash -salt");

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}
		
		console.log("User services count:", user.services.length);

		// Format services with explicit handling of all fields
		const formattedServices = user.services.map((service) => {
			// Get the price first - this ensures we have a valid base for calculations
			const price =
				service.price ||
				service.serviceId?.salePrice ||
				service.serviceId?.price ||
				0;
			
			// Check if tax values already exist in the service
			let igst = service.igst || 0;
			let cgst = service.cgst || 0;
			let sgst = service.sgst || 0;
			
			// If total GST is zero and we have a gstRate, calculate it
			if (igst + cgst + sgst === 0 && service.serviceId?.gstRate) {
				const gstRate = service.serviceId.gstRate || 18; // Default 18% if not specified
				const totalGstAmount = (price * gstRate) / 100;
				
				// Determine if this is an inter-state transaction
				const companyState = "Delhi"; // This should come from your config
				const userState = user.state || "Unknown";
				const isInterstate = service.isInterstate || userState !== companyState;
				
				if (isInterstate) {
					igst = totalGstAmount;
					cgst = 0;
					sgst = 0;
				} else {
					igst = 0;
					cgst = totalGstAmount / 2;
					sgst = totalGstAmount / 2;
				}
			}
			
			// Extract employee information
			const employeeName = service.employeeId ? service.employeeId.name : null;
			const employeeEmail = service.employeeId
				? service.employeeId.email
				: null;
			
			// Find requiredDocuments from the correct package
			let requiredDocuments = [];
			if (service.packageId && service.serviceId && service.serviceId.packages) {
				const pkg = service.serviceId.packages.find(
					(p) => p._id && p._id.toString() === service.packageId.toString()
				);
				if (pkg && pkg.requiredDocuments) {
					requiredDocuments = pkg.requiredDocuments;
				}
			}
			
			return {
				orderId: service.orderId || "N/A",
				serviceId: service.serviceId?._id,
				serviceName: service.serviceId?.name || "Unknown Service",
				serviceDescription: service.serviceId?.description || "No Description",
				status: service.status || "In Process",
				activationStatus: service.activated ? "Active" : "Inactive",
				purchasedAt: service.purchasedAt,
				dueDate: service.serviceId?.dueDate || service.dueDate,
				
				// Employee information
				employeeId: service.employeeId?._id || null,
				employeeName: employeeName,
				employeeEmail: employeeEmail,
				managedBy: employeeName 
					? `${employeeName}${employeeEmail ? ` (${employeeEmail})` : ""}`
					: "Unassigned",
				
				// Document information
				requiredDocuments: requiredDocuments,
				documents: service.documents || [],
				
				// Package & Payment information
				packageName: service.packageName || null,
				price: price,
				paymentAmount: service.paymentAmount || price || 0,
				paymentMethod: service.paymentMethod || "N/A",
				paymentReference: service.paymentReference || null,
				
				// Tax information
				igst: igst,
				cgst: cgst,
				sgst: sgst,
				discount: service.discount || 0,
				
				// Status information
				completionDate: service.completionDate || null,
				
				// Feedback information
				feedback: service.feedback || [],
			};
		});
		
		console.log("Formatted services count:", formattedServices.length);

		res.status(200).json({
			message: "Customer dashboard data fetched successfully",
			user: {
				...user._doc,
				services: formattedServices,
			},
		});
	} catch (err) {
		console.error("Error fetching customer dashboard:", err);
		res.status(500).json({ message: "Error loading customer dashboard" });
	}
};

const getUserServices = async (req, res) => {
	try {
		// Only return active services
		const services = await Service.find({ isActive: { $ne: false } });
		res.json({ services });
	} catch (err) {
		res.status(500).json({ message: "Error fetching services" });
	}
};

// Generate a unique referral code
function generateReferralCode() {
	return crypto.randomBytes(3).toString("hex").toUpperCase(); // Generate a 6-character alphanumeric code
}

const registerCustomer = async (req, res) => {
	try {
		const {
			name,
			lastname,
			username,
			email,
			mobile,
			password,
			referralCode,
			serviceId,
		} = req.body;

		// Generate a referral code for the new user
		const newReferralCode = generateReferralCode();

		if (!name || !email || !username || !password) {
			return res.status(400).json({ message: "All fields are required" });
		}

		// Check if a user with the same email already exists
		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res
				.status(400)
				.json({ message: "User with this email already exists. Please login to your account instead." });
		}

		// Check if a lead with the same email already exists
		const existingLead = await Lead.findOne({ email });
		if (existingLead) {
			return res
				.status(400)
				.json({ message: "A lead with this email already exists. Our team will contact you about your inquiry soon." });
		}

		const salt = crypto.randomBytes(16).toString("hex");
		const hashedPassword = hashPassword(password, salt);

		// Create a new user
		const newUser = new User({
			name,
			lastname,
			email,
			mobile,
			username,
			passwordHash: hashedPassword,
			salt,
			role: "customer",
			isProfileComplete: false,
			serviceStatus: "active",
			referralCode: newReferralCode,
			isActive: true,
		});

		// If serviceId is provided, add it to the user's services
		if (serviceId) {
			// Get service details to check dueDate
			const service = await Service.findById(serviceId);
			if (service) {
				// Generate a custom order ID
				const orderId = generateOrderId(newUser._id);

				newUser.services.push({
					serviceId,
					orderId,
					activated: true,
					purchasedAt: new Date(),
					dueDate: service.dueDate,
					requiredDocuments: service.requiredDocuments,
					documents: [],
				});
			}
		}

		await newUser.save();

		// Create wallet for the new user
		const newWallet = new Wallet({
			userId: newUser._id,
			referralCode: newUser.referralCode,
			referredBy: referralCode || null,
			balance: 0,
			referralEarnings: 0,
			transactions: [],
			withdrawalRequests: [],
		});
		await newWallet.save();

		// Handle referral if referral code is provided
		if (referralCode) {
			await handleReferral(referralCode, newUser._id);
		}

		// Assign employee if serviceId is provided
		let assignmentResult = { success: false };
		if (serviceId && newUser.services.length > 0) {
			// Import the customerAssignment utility if needed

			// Attempt to assign an employee to the customer for this service
			assignmentResult = await handleCustomerEmployeeAssignment(
				newUser,
				serviceId
			);
		}

		// Send welcome email
		await sendZeptoMail({
			to: email,
			subject: "Welcome to Our Service",
			html: `
				<h2>Welcome to Our Service!</h2>
				<p>Hello ${name},</p>
				<p>Thank you for registering with us! Your referral code is: <strong>${newReferralCode}</strong></p>
				${
					assignmentResult.success
					? `<p>An employee has been assigned to assist you with your service: <strong>${assignmentResult.employee.name}</strong></p>`
					: ''
				}
				<p>We're excited to have you on board!</p>
				<p>Best regards,<br>The Team</p>
			`
		});

		res.status(200).json({
			message: "Registration successful!",
			userId: newUser._id,
			referralCode: newReferralCode,
			wallet: {
				balance: newWallet.balance,
				referralCode: newWallet.referralCode,
			},
			employeeAssigned: assignmentResult.success,
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "Error registering user" });
	}
};

const registerFlexiCustomer = async (req, res) => {
	try {
		const { name, email, mobile, password, leadSource } = req.body;

		// Check if a user with the same email already exists
		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res
				.status(400)
				.json({ message: "User with this email already exists. Please login to your account instead." });
		}

		// Check if a lead with the same email already exists
		const existingLead = await Lead.findOne({ email });
		if (existingLead) {
			return res
				.status(400)
				.json({ message: "A lead with this email already exists. Our team will contact you about your inquiry soon." });
		}

		// Generate unique ID for the user
		const userId = `CUST${Date.now()}${Math.floor(Math.random() * 1000)}`;

		// Generate a referral code for the new user
		const newReferralCode = generateReferralCode();

		// Generate salt and hash password
		const salt = crypto.randomBytes(16).toString("hex");
		const hashedPassword = hashPassword(password, salt);

		// Create new user
		const newUser = new User({
			_id: userId,
			name,
			email,
			mobile,
			passwordHash: hashedPassword,
			salt,
			role: "customer",
			leadSource: leadSource || "flexifunnel", // Corrected typo from "flexfunneli"
			isActive: true,
			username: email, // Use email as username
			referralCode: newReferralCode, // Add referral code
		});

		await newUser.save();

		// Initialize wallet for the Flexi Funnel customer
		const newWallet = new Wallet({
			userId: newUser._id,
			referralCode: newUser.referralCode,
			balance: 0,
			referralEarnings: 0,
			transactions: [],
			withdrawalRequests: [],
		});
		await newWallet.save();

		// Send welcome email
		try {
			await sendZeptoMail({
				to: email,
				subject: "Welcome to Our Service",
				html: `
					<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
						<h2 style="color: #2c3e50;">Welcome to Our Service!</h2>
						<p>Dear ${name},</p>
						<p>Thank you for registering. Your account has been created successfully.</p>
						<p>Your referral code is: <strong>${newReferralCode}</strong></p>
						<p>Our team will review and assign your service within 24 hours.</p>
						<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
							<p>Best regards,<br>Team</p>
						</div>
					</div>
				`
			});
		} catch (emailError) {
			console.error("Error sending welcome email:", emailError);
		}

		res.status(201).json({
			message: "Registration successful",
			email: newUser.email,
			userId: newUser._id,
			referralCode: newReferralCode,
			wallet: {
				balance: newWallet.balance,
				referralCode: newWallet.referralCode,
			},
		});
	} catch (error) {
		console.error("Registration error:", error);
		res.status(500).json({
			message: "Registration failed",
			error: error.message,
		});
	}
};

// Ensure generateReferralCode is available (or import it)
function generateReferralCode() {
	return crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-character code
}

const updateCustomerProfile = async (req, res) => {
	try {
		// Use either userId or _id from the request user object for backward compatibility
		const userId = req.user.userId || req.user._id;
		
		const updateData = req.body;

		// Validate update data
		if (Object.keys(updateData).length === 0) {
			return res.status(400).json({ message: "No update data provided" });
		}

		// Find user and update
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Update only the provided fields
		Object.keys(updateData).forEach((key) => {
			// Skip sensitive fields that should not be updated through this endpoint
			if (!["passwordHash", "salt", "role", "_id"].includes(key)) {
				user[key] = updateData[key];
			}
		});

		// Mark profile as complete if this is the first update
		if (!user.isProfileComplete) {
			user.isProfileComplete = true;
		}

		await user.save();

		// Return updated user without sensitive information
		const { passwordHash, salt, ...userWithoutSensitiveInfo } = user.toObject();
		
		res.status(200).json({
			message: "Profile updated successfully",
			user: userWithoutSensitiveInfo,
		});
	} catch (err) {
		console.error("Error updating profile:", err);
		res
			.status(500)
			.json({ message: "Error updating profile", error: err.message });
	}
};

// Function to generate a custom order ID based on userId and timestamp

const generateOrderId = (userId) => {
	const timestamp = Date.now();
	const shortTimestamp = timestamp.toString().slice(-4);
	const randomDigits = Math.floor(Math.random() * 1000)
		.toString()
		.padStart(3, "0");
	return `ORDER${userId}-${shortTimestamp}${randomDigits}`;
};

const handlePaymentSuccess = async (req, res) => {
	try {
		const {
			razorpay_payment_id,
			amount,
			userId,
			serviceId,
			packageId,
			order_id,
		} = req.body;

		// Initialize Razorpay instance
		const razorpayInstance = new Razorpay({
			key_id: process.env.RAZORPAY_KEY_ID,
			key_secret: process.env.RAZORPAY_KEY_SECRET,
		});

		// Fetch payment details
		const paymentDetails = await razorpayInstance.payments.fetch(
			razorpay_payment_id
		);
		if (!paymentDetails) {
			return res.status(404).json({ message: "Payment details not found" });
		}

		// Fetch user details
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Fetch service details
		const service = await Service.findById(serviceId);
		if (!service) {
			return res.status(404).json({ message: "Service not found" });
		}

		// Find the selected package if packageId is provided
		let selectedPackage = null;
		if (packageId && service.packages && service.packages.length > 0) {
			selectedPackage = service.packages.find(
				(pkg) => pkg._id.toString() === packageId
			);
			
			if (!selectedPackage) {
				return res.status(404).json({ message: "Package not found" });
			}
		}

		// Calculate base price based on package or service
		const basePrice = selectedPackage 
			? selectedPackage.salePrice || selectedPackage.actualPrice
			: service.packages && service.packages.length > 0
			? service.packages[0].salePrice || service.packages[0].actualPrice
				: service.salePrice || service.actualPrice;

		// Get GST rate from service (default to 18% if not specified)
		const gstRate = service.gstRate || 18;
		
		// Check if the provided amount already includes GST or if it's the base amount
		// For safety, we'll recalculate everything
		const amountInRupees = amount / 100;
		
		// For demo purposes, set this to true if payment is including taxes, false if it's excluding
		const paymentIncludesGST = true;
		
		// Calculate GST amounts
		let igst = 0,
			cgst = 0,
			sgst = 0;
		let taxableAmount = basePrice;
		
		// Determine if this is an inter-state transaction
		// For demonstration, check if user's state is different from company state
		const companyState = "Delhi"; // This should come from your config
		const userState = user.state || "Unknown";
		const isInterstate = userState !== companyState;
		
		if (paymentIncludesGST) {
			// If the payment amount includes GST, back-calculate the base amount
			const gstFactor = 1 + gstRate / 100;
			taxableAmount = basePrice / gstFactor;
			const totalGST = basePrice - taxableAmount;
			
			if (isInterstate) {
				igst = totalGST;
				cgst = 0;
				sgst = 0;
			} else {
				igst = 0;
				cgst = totalGST / 2;
				sgst = totalGST / 2;
			}
		} else {
			// If the payment amount is the base amount (excluding GST)
			taxableAmount = basePrice;
			if (isInterstate) {
				igst = basePrice * (gstRate / 100);
				cgst = 0;
				sgst = 0;
			} else {
				igst = 0;
				cgst = basePrice * (gstRate / 200); // Half of GST rate
				sgst = basePrice * (gstRate / 200); // Half of GST rate
			}
		}
		
		// Log the tax calculations for debugging
		console.log(`Tax Calculation for payment ${razorpay_payment_id}:`, {
			basePrice,
			gstRate,
			isInterstate,
			userState,
			companyState,
			taxableAmount,
			igst,
			cgst,
			sgst,
			totalWithTax: taxableAmount + igst + cgst + sgst,
		});

		// Use processing days from the selected package or default to service's first package
		const processingDays = selectedPackage 
			? selectedPackage.processingDays 
			: service.packages && service.packages.length > 0
				? service.packages[0].processingDays 
				: 7; // Default to 7 days if no package specified

		// Calculate due date based on processing days
		const purchaseDate = new Date();
		const dueDate = new Date(purchaseDate);
		dueDate.setDate(dueDate.getDate() + processingDays);

		// Generate a custom order ID
		const orderId = order_id || generateOrderId(userId);

		// Add payment details to payment history
		user.paymentHistory.push({
			paymentId: razorpay_payment_id,
			amount: amountInRupees,
			date: new Date(),
			status: "success",
			paymentMethod: paymentDetails.method,
		});

		// Add new service with custom orderId and selected package
		user.services.push({
			serviceId,
			orderId: orderId,
			packageId:
				packageId ||
				(service.packages && service.packages.length > 0
					? service.packages[0]._id
					: null),
			packageName: selectedPackage 
				? selectedPackage.name 
				: service.packages && service.packages.length > 0
					? service.packages[0].name 
					: null,
			price: taxableAmount, // Store the price excluding GST
			paymentAmount: amountInRupees, // Store the total amount paid
			paymentMethod: paymentDetails.method,
			paymentReference: razorpay_payment_id,
			
			// Tax information
			igst: igst,
			cgst: cgst,
			sgst: sgst,
			gstRate: gstRate,
			gstIncluded: paymentIncludesGST,
			isInterstate: isInterstate,
			
			activated: true,
			purchasedAt: purchaseDate,
			dueDate: dueDate,
			requiredDocuments: service.requiredDocuments,
			documents: [],
		});

		// Save user details
		await user.save();

		// Handle employee assignment
		const assignmentResult = await handleCustomerEmployeeAssignment(
			user,
			serviceId
		);

		// Send notification email
		const emailContent = selectedPackage 
			? `Your payment of Rs.${amountInRupees} for ${service.name} (${selectedPackage.name} package) has been processed successfully.`
			: `Your payment of Rs.${amountInRupees} for ${service.name} has been processed successfully.`;
			
		// Add tax details to email
		const taxDetails = `
Base amount: ₹${taxableAmount.toFixed(2)}
${
	isInterstate
    ? `IGST (${gstRate}%): ₹${igst.toFixed(2)}` 
		: `CGST (${gstRate / 2}%): ₹${cgst.toFixed(2)}
SGST (${gstRate / 2}%): ₹${sgst.toFixed(2)}`
}
Total amount: ₹${amountInRupees.toFixed(2)}`;
		
		// Format tax details as HTML
		const taxDetailsHtml = `
			<div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px;">
				<h3 style="margin-top: 0; color: #2c3e50;">Payment Details</h3>
				<p><strong>Base amount:</strong> ₹${taxableAmount.toFixed(2)}</p>
				${
					isInterstate
					? `<p><strong>IGST (${gstRate}%):</strong> ₹${igst.toFixed(2)}</p>`
					: `
						<p><strong>CGST (${gstRate / 2}%):</strong> ₹${cgst.toFixed(2)}</p>
						<p><strong>SGST (${gstRate / 2}%):</strong> ₹${sgst.toFixed(2)}</p>
					`
				}
				<p style="font-weight: bold; font-size: 1.1em; margin-top: 10px;">
					Total amount: ₹${amountInRupees.toFixed(2)}
				</p>
			</div>
		`;

		try {
			// Send email with ZeptoMail
			await sendZeptoMail({
				to: user.email,
				subject: "Service Purchase Successful",
				html: `
					<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
						<h2 style="color: #2c3e50;">Thank You for Your Purchase!</h2>
						<p>${emailContent}</p>
						${
							!assignmentResult.success
							? "<p>An employee will be assigned to assist you shortly.</p>"
							: `<p><strong>${assignmentResult.employee.name}</strong> has been assigned to assist you with your service.</p>`
						}
						${taxDetailsHtml}
						<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
							<p>If you have any questions, please don't hesitate to contact our support team.</p>
							<p>Best regards,<br>The Team</p>
						</div>
					</div>
				`
			});
		} catch (emailError) {
			console.error("Error sending purchase confirmation email:", emailError);
		}

		res.status(200).json({
			message: "Payment and service added successfully",
			employeeAssigned: assignmentResult.success,
			packageDetails: selectedPackage 
				? { 
					id: selectedPackage._id,
					name: selectedPackage.name,
						processingDays: selectedPackage.processingDays,
				} 
				: null,
			taxDetails: {
				taxableAmount,
				igst,
				cgst,
				sgst,
				total: amountInRupees,
			},
		});
	} catch (error) {
		console.error("Error handling payment success:", error);
		res.status(500).json({ message: "Error processing payment" });
	}
};

const uploadDocuments = async (req, res) => {
	try {
		const { serviceId } = req.body;
		const userId = req.user._id;

		// Validate files...
		if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
			return res.status(400).json({ message: "No files uploaded" });
		}

		// Find user and service
		const user = await User.findById(userId);
		const service = await Service.findById(serviceId);

		if (!user || !service) {
			return res.status(404).json({ message: "User or service not found" });
		}

		// Find the specific service in user's services array
		const serviceIndex = user.services.findIndex(
			(s) => s.serviceId.toString() === serviceId
		);

		if (serviceIndex === -1) {
			return res
				.status(404)
				.json({ message: "Service not found in user's services" });
		}

		// Calculate due date based on upload date and processing days
		const uploadDate = new Date();
		// Get processing days, default to 7 if not found
		let processingDays = 7;
		
		// Try to get processing days from the service
		if (service.processingDays) {
			processingDays = service.processingDays;
		} 
		// If not in service, try to get from user's services array
		else if (user.services[serviceIndex].processingDays) {
			processingDays = user.services[serviceIndex].processingDays;
		}
		
		// Create a valid due date by adding processing days to the current date
		const dueDate = new Date();
		dueDate.setDate(dueDate.getDate() + processingDays);

		// Create user-specific directory
		const userUploadDir = path.join("uploads", userId);
		if (!fs.existsSync(userUploadDir)) {
			fs.mkdirSync(userUploadDir, { recursive: true });
		}

		// Process document uploads...
		const documentRecords = await Promise.all(
			req.files.map(async (file) => {
				const newPath = path.join(userUploadDir, file.filename);
				fs.renameSync(file.path, newPath);
				return {
					filename: file.filename,
					originalName: file.originalname,
					path: `/${newPath.replace(/\\/g, '/')}`, // Format path for URL use
					mimetype: file.mimetype,
					size: file.size,
					uploadedAt: uploadDate,
				};
			})
		);

		// Update service with documents and new due date
		user.services[serviceIndex].documents.push(...documentRecords);
		user.services[serviceIndex].dueDate = dueDate;
		user.markModified("services");

		await user.save();

		res.status(200).json({
			message: "Documents uploaded successfully",
			documents: documentRecords,
			dueDate: dueDate,
			service: user.services[serviceIndex],
		});
	} catch (error) {
		console.error("Upload error:", error);
		res.status(500).json({
			message: "Error uploading documents",
			error: error.message,
		});
	}
};

const deleteUser = async (req, res) => {
	try {
		const { userId } = req.params;

		// Find the user by ID and delete it
		const user = await User.findByIdAndDelete(userId);

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		res.status(200).json({ message: "User deleted successfully" });
	} catch (error) {
		console.error("Error deleting user:", error);
		res.status(500).json({ message: "Error deleting user" });
	}
};

const loginUser = async (req, res) => {
	const { email, password } = req.body;

	try {
		if (!email || !password) {
			return res
				.status(400)
				.json({ message: "Email and password are required" });
		}

		// Find the user by email or username
		const user = await User.findOne({ 
			$or: [
				{ email: email },
				{ username: email }, // Allow login with username in the email field
			],
		});
		
		if (!user) {
			return res.status(400).json({ message: "Invalid email or password" });
		}

		// Hash the entered password and compare with stored hash
		const hashedPassword = hashPassword(password, user.salt);
		if (hashedPassword !== user.passwordHash) {
			return res.status(400).json({ message: "Invalid email or password" });
		}

		// Include additional fields in the token payload (similar to admin)
		const token = jwt.sign(
			{
				_id: user._id, // Changed from userId to _id to match the middleware expectations
				role: user.role, // Role of the user (could be 'customer', 'admin', etc.)
				name: user.name, // Include the name for additional context if needed
				email: user.email, // Email for additional context if needed
			},
			process.env.JWT_SECRET,
			{ expiresIn: "12h" }
		);

		// Return the token and user details
		res.status(200).json({ 
			token, 
			user: {
				_id: user._id,
				name: user.name,
				email: user.email,
				role: user.role,
				isActive: user.isActive,
			},
		});
	} catch (err) {
		console.error("Error logging in user:", err);
		res.status(500).json({ message: "Login failed", error: err.message });
	}
};

// Razorpay Payment Integration
const initiatePayment = async (req, res) => {
	const { amount, currency, serviceId, packageId, notes } = req.body;

	try {
		// Initialize Razorpay instance with credentials from environment variables
		const razorpayInstance = new Razorpay({
			key_id: process.env.RAZORPAY_KEY_ID,
			key_secret: process.env.RAZORPAY_KEY_SECRET,
		});

		// Check if the keys are loaded properly
		if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
			return res
				.status(500)
				.json({ message: "Razorpay keys are not properly set" });
		}

		// If serviceId is provided, fetch service details
		let serviceDetails = null;
		let gstInfo = {};
		
		if (serviceId) {
			const service = await Service.findById(serviceId);
			if (service) {
				serviceDetails = {
					name: service.name,
					gstRate: service.gstRate || 18,
				};
				
				// Find package if packageId is provided
				let selectedPackage = null;
				if (packageId && service.packages && service.packages.length > 0) {
					selectedPackage = service.packages.find(
						(pkg) => pkg._id.toString() === packageId
					);
					if (selectedPackage) {
						serviceDetails.packageName = selectedPackage.name;
					}
				}
				
				// Calculate base amount and GST
				const baseAmount = amount;
				const gstAmount = (baseAmount * serviceDetails.gstRate) / 100;
				const totalAmount = Math.round(baseAmount + gstAmount);
				
				gstInfo = {
					baseAmount,
					gstRate: serviceDetails.gstRate,
					gstAmount,
					totalAmount,
				};
				
				console.log("Payment calculation:", gstInfo);
			}
		}

		// Create order with the calculated amount or the provided amount
		let orderAmount = gstInfo.totalAmount ? gstInfo.totalAmount : amount;
		
		// Ensure amount is a valid number and convert to integer paise
		orderAmount = Math.round(parseFloat(orderAmount) * 100);
		
		if (isNaN(orderAmount) || orderAmount <= 0) {
			return res.status(400).json({ message: "Invalid amount provided" });
		}
		
		// Create order
		const order = await razorpayInstance.orders.create({
			amount: orderAmount, // Now in paise as integer
			currency: currency || "INR",
			payment_capture: 1,
			notes: {
				...notes,
				serviceId: serviceId || "",
				packageId: packageId || "",
				baseAmount: gstInfo.baseAmount || amount,
				gstRate: gstInfo.gstRate || 18,
				gstAmount: gstInfo.gstAmount || 0,
			},
		});
		
		// Return order with tax details
		res.json({ 
			order,
			serviceDetails,
			gstInfo,
		});
	} catch (error) {
		console.error("Error initiating payment:", error);
		res
			.status(500)
			.json({ message: "Error initiating payment", error: error.message });
	}
};

const getServiceById = async (req, res) => {
	try {
		const { serviceId } = req.params;
		const service = await Service.findById(serviceId);
		
		if (!service) {
			return res.status(404).json({ message: "Service not found" });
		}
		
		// Check if service is active
		if (service.isActive === false) {
			return res.status(404).json({ message: "Service not available" });
		}
		
		res.json({ service });
	} catch (err) {
		console.error("Error fetching service:", err);
		res.status(500).json({ message: "Error fetching service" });
	}
};

const sendQuery = async (req, res) => {
	const { userId, serviceId, query } = req.body;

	try {
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const serviceIndex = user.services.findIndex(
			(service) => service.serviceId.toString() === serviceId
		);

		if (serviceIndex === -1) {
			return res.status(404).json({ message: "Service not found" });
		}

		// Fix file paths to use relative paths instead of absolute paths
		const attachments = req.files
			? req.files.map((file) => {
					// Extract just the path relative to the backend
					let relativePath = file.path;
					// If it's an absolute path, extract just the filename and parent folder
					if (relativePath.includes('C:') || relativePath.includes('/Users/') || relativePath.includes('\\')) {
						const pathParts = relativePath.split(/[\/\\]/);
						const fileName = pathParts.pop(); // Get filename
						// Store as a relative path
						relativePath = `/uploads/${fileName}`;
					}
					
					return {
						filePath: relativePath,
					originalName: file.originalname,
						mimetype: file.mimetype
					};
			  })
			: [];

		const newQuery = {
			query,
			status: "pending",
			createdAt: new Date(),
			replies: [],
			attachments,
		};

		user.services[serviceIndex].queries.push(newQuery);
		await user.save();

		res.status(201).json({
			message: "Query submitted successfully",
			query: newQuery,
		});
	} catch (error) {
		console.error("Error submitting query:", error);
		res.status(500).json({ message: "Error submitting query" });
	}
};

const getCustomerQueriesWithReplies = async (req, res) => {
	try {
		// Use either userId or _id from the request user object for backward compatibility
		const userId = req.user.userId || req.user._id;

		if (!userId) {
			return res.status(400).json({ message: "Invalid user ID" });
		}

		// Fetch the user with populated services, their queries, and replies
		const user = await User.findById(userId).populate({
			path: "services.serviceId",
			select: "name",
		});

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Extract queries and include replies from services
		const queriesWithReplies = user.services.flatMap((service) =>
			(service.queries || []).map((query) => ({
				serviceId: service.serviceId?._id || "Unknown",
				serviceName: service.serviceId?.name || "Unknown Service",
				query: query.query,
				status: query.status || "unknown",
				replies: (query.replies || []).map((reply) => ({
					message: reply.response || "No response provided",
					timestamp: reply.createdAt || new Date(),
					responder: reply.employeeId || "Unknown Employee",
				})),
				createdAt: query.createdAt || null,
			}))
		);

		res.status(200).json({
			message: "Queries with replies fetched successfully",
			queries: queriesWithReplies,
		});
	} catch (error) {
		console.error("Error fetching queries with replies:", error);
		res.status(500).json({ message: "Error fetching queries with replies" });
	}
};

const submitFeedback = async (req, res) => {
	try {
		// Use either userId or _id from the request user object for backward compatibility
		const userId = req.user.userId || req.user._id;
		const { serviceId, feedback, rating } = req.body;

		if (!serviceId || !feedback || !rating) {
			return res.status(400).json({ message: "Missing required fields" });
		}

		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Find the service in the user's services array
		const serviceIndex = user.services.findIndex(
			(service) => service.serviceId.toString() === serviceId
		);

		if (serviceIndex === -1) {
			return res.status(404).json({ message: "Service not found" });
		}

		// Create feedback entry with explicit field assignments instead of using spread operator
		const feedbackEntry = {
			feedback: typeof feedback === 'string' ? feedback : (feedback.generalFeedback || ''),
			rating: parseInt(rating),
			createdAt: new Date()
		};

		// Explicitly add each field if it exists in the feedback object
		if (typeof feedback === 'object') {
			if (feedback.satisfaction) feedbackEntry.satisfaction = feedback.satisfaction;
			if (feedback.recommendation) feedbackEntry.recommendation = feedback.recommendation;
			if (feedback.professionalismRating) feedbackEntry.professionalismRating = parseInt(feedback.professionalismRating);
			if (feedback.clarityUnderstanding) feedbackEntry.clarityUnderstanding = feedback.clarityUnderstanding;
			if (feedback.likeMost) feedbackEntry.likeMost = feedback.likeMost;
			if (feedback.improvements) feedbackEntry.improvements = feedback.improvements;
			if (feedback.teamMemberAppreciation) feedbackEntry.teamMemberAppreciation = feedback.teamMemberAppreciation;
			if (feedback.shareTestimonial) feedbackEntry.shareTestimonial = feedback.shareTestimonial;
		}

		// Log the feedback entry for debugging
		console.log("Saving feedback entry:", JSON.stringify(feedbackEntry, null, 2));

		user.services[serviceIndex].feedback.push(feedbackEntry);
		await user.save();

		res.status(201).json({
			message: "Feedback submitted successfully",
			feedback: feedbackEntry,
		});
	} catch (error) {
		console.error("Error submitting feedback:", error);
		res.status(500).json({ message: "Error submitting feedback" });
	}
};

const updateBankDetails = async (req, res) => {
	try {
		const { userId, bankDetails } = req.body;

		// Find and update the user
		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{
				$set: {
					bankDetails: {
						accountNumber: bankDetails.accountNumber,
						accountHolderName: bankDetails.accountHolderName,
						bankName: bankDetails.bankName,
						ifscCode: bankDetails.ifscCode,
						accountType: bankDetails.accountType,
						lastUpdated: new Date(),
					},
				},
			},
			{ new: true }
		);

		if (!updatedUser) {
			return res.status(404).json({ message: "User not found" });
		}

		res.json({ message: "Bank details updated successfully" });
	} catch (error) {
		console.error("Error updating bank details:", error);
		res
			.status(500)
			.json({ message: "Error updating bank details", error: error.message });
	}
};

const processFlexiFunnelRedirect = async (req, res) => {
	try {
		// Retrieve the most recent unprocesed FlexiFunnel customer
		const flexiCustomer = await User.findOne({
			isFlexiCustomer: true,
			serviceStatus: "pending",
			leadSource: "FlexiFunnel",
		}).sort({ createdAt: 1 }); // Get the oldest unprocessed customer

		if (!flexiCustomer) {
			return res.status(404).json({
				message: "No pending FlexiFunnel customers found",
			});
		}

		// Find a matching service based on the customer's service interest
		const service = await Service.findOne({
			$or: [
				{
					name: {
						$regex: flexiCustomer.additionalDetails.serviceInterest,
						$options: "i",
					},
				},
				{
					category: {
						$regex: flexiCustomer.additionalDetails.serviceInterest,
						$options: "i",
					},
				},
			],
		});

		if (!service) {
			return res.status(400).json({
				message: "No matching service found for customer's interest",
			});
		}

		// Generate a temporary login token
		const token = jwt.sign(
			{
				userId: flexiCustomer._id,
				email: flexiCustomer.email,
			},
			process.env.JWT_SECRET,
			{ expiresIn: "1h" }
		);

		// Send notification email to admin
		try {
			await sendZeptoMail({
				to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
				subject: "FlexiFunnel Customer Ready for Assignment",
				html: `
					<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
						<h2 style="color: #2c3e50;">New FlexiFunnel Customer</h2>
						<p>A new FlexiFunnel customer is ready for service assignment:</p>
						
						<div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
							<p><strong>Customer Details:</strong></p>
							<ul style="list-style: none; padding: 0; margin: 10px 0;">
								<li><strong>Name:</strong> ${flexiCustomer.name}</li>
								<li><strong>Email:</strong> ${flexiCustomer.email}</li>
								<li><strong>Service Interest:</strong> ${flexiCustomer.additionalDetails?.serviceInterest || 'Not specified'}</li>
								<li><strong>Matched Service:</strong> ${service.name}</li>
							</ul>
						</div>

						<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
							<p>Please log in to the admin dashboard to assign an employee to this customer.</p>
							<p>Best regards,<br>Finshelter Team</p>
						</div>
					</div>
				`
			});
		} catch (emailError) {
			console.error("Error sending FlexiFunnel notification email:", emailError);
			// Continue with the process even if email fails
		}

		res.status(200).json({
			userId: flexiCustomer._id,
			serviceId: service._id,
			email: flexiCustomer.email,
			token: token,
		});
	} catch (error) {
		console.error("FlexiFunnel redirect processing error:", error);
		res.status(500).json({
			message: "Error processing FlexiFunnel redirect",
			error: error.message,
		});
	}
};

// Google Registration
const googleRegister = async (req, res) => {
	try {
		const { name, email, googleId, avatarUrl } = req.body;

		// Validate required fields
		if (!name || !email || !googleId) {
			return res
				.status(400)
				.json({ message: "Name, email, and Google ID are required" });
		}

		// Check if user already exists with this Google ID
		let user = await User.findOne({ googleId });

		// If not found by googleId, check by email
		if (!user) {
			user = await User.findOne({ email });
		}

		// If user exists, update Google ID and return user data
		if (user) {
			// Update the existing user's Google ID if they didn't have one
			if (!user.googleId) {
				user.googleId = googleId;
				user.avatarUrl = avatarUrl || user.avatarUrl;
				await user.save();
			} 

			// Generate token for the existing user
			const token = jwt.sign(
				{ userId: user._id, role: user.role },
				process.env.JWT_SECRET,
				{ expiresIn: "30d" }
			);

			return res.status(200).json({
				userId: user._id,
				name: user.name,
				email: user.email,
				role: user.role,
				token,
			});
		}

		// If user doesn't exist, create a new one
		// Generate a random password for Google users
		const randomPassword = Math.random().toString(36).slice(-8);
		const salt = crypto.randomBytes(16).toString("hex");
		const passwordHash = hashPassword(randomPassword, salt);
		
		// Generate a custom ID for the new user - required by schema
		const customId = await CustomObjectId.generate("CUS");
		
		// Create new customer
		const newUser = new User({
			_id: customId, // Set the custom ID explicitly
			name,
			email,
			passwordHash,
			salt,
			googleId,
			avatarUrl: avatarUrl || "",
			role: "customer",
			isActive: true,
			isVerified: true, // Google users are considered verified
			leadSource: "google-auth",
		});

		const createdUser = await newUser.save();

		// Generate token
		const token = jwt.sign(
			{ userId: createdUser._id, role: createdUser.role },
			process.env.JWT_SECRET,
			{ expiresIn: "30d" }
		);

		// Send welcome email to the user
		try {
			await sendZeptoMail({
				to: createdUser.email,
				subject: "Welcome to Finshelter!",
				html: `
					<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
						<h2 style="color: #2c3e50;">Welcome to Finshelter!</h2>
						<p>Hello ${createdUser.name},</p>
						<p>Thank you for registering with us using Google Sign-In.</p>
						<p>You can now access all our services and manage your account.</p>
						<p>If you have any questions, feel free to contact our support team.</p>
						<p>Best Regards,</p>
						<p>The Finshelter Team</p>
					</div>
				`,
			});
		} catch (emailError) {
			console.error("Error sending welcome email:", emailError);
			// Continue registration process even if email fails
		}

		return res.status(201).json({
			userId: createdUser._id,
			name: createdUser.name,
			email: createdUser.email,
			role: createdUser.role,
			token,
		});
	} catch (error) {
		console.error("Google registration error:", error);
		return res.status(500).json({ 
			message: "Server error during Google registration",
			error: error.message,
		});
	}
};

// Password Reset Controller Functions

/**
 * Generate a password reset token and send it to the user's email
 */
const forgotPassword = async (req, res) => {
	try {
		const { email } = req.body;

		if (!email) {
			return res.status(400).json({
				success: false,
				message: "Email is required",
			});
		}

		// Find the user by email
		const user = await User.findOne({ email: email });
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User with this email does not exist",
			});
		}

		// Generate a random reset token
		const resetToken = crypto.randomBytes(32).toString("hex");

		// Set token expiration (1 hour from now)
		const resetTokenExpiry = Date.now() + 3600000; // 1 hour in milliseconds

		// Update user with reset token and expiry
		user.resetPasswordToken = resetToken;
		user.resetPasswordExpires = resetTokenExpiry;
		await user.save();

		// Create reset URL (hardcoded frontend URL)
		const resetUrl = `https://thefinshelter.com/reset-password/${resetToken}`;

		// Email content
		const subject = "Password Reset Request";
		const text = `You are receiving this email because you (or someone else) requested a password reset for your account.\n\n
            Please click the link below to reset your password:\n\n
            ${resetUrl}\n\n
            This link is valid for 1 hour only.\n\n
            If you did not request this, please ignore this email and your password will remain unchanged.`;

		// HTML Email template
		const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Request</title>
            <style>
                body {
                    font-family: 'Poppins', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                }
                .container {
                    background-color: #f7f7f7;
                    padding: 20px;
                    border-radius: 5px;
                }
                .header {
                    background-color: #1b321d;
                    color: white;
                    padding: 15px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }
                .content {
                    background-color: white;
                    padding: 20px;
                    border-radius: 0 0 5px 5px;
                }
                .button {
                    display: inline-block;
                    background-color: #1b321d;
                    color: white;
                    text-decoration: none;
                    padding: 10px 20px;
                    margin: 20px 0;
                    border-radius: 5px;
                    font-weight: bold;
                }
                .footer {
                    text-align: center;
                    font-size: 0.8em;
                    margin-top: 20px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset Request</h1>
                </div>
                <div class="content">
                    <p>Hello ${user.name},</p>
                    <p>You are receiving this email because you (or someone else) requested a password reset for your account.</p>
                    <p>Please click the button below to reset your password:</p>
                    <a href="${resetUrl}" class="button">Reset Password</a>
                    <p>This link is valid for 1 hour only.</p>
                    <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Finshelter. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;

		// Send password reset email
		try {
			await sendZeptoMail({
				to: user.email,
				subject: subject,
				html: htmlContent || text.replace(/\n/g, '<br>') // Convert plain text to HTML if no HTML content provided
			});
		} catch (emailError) {
			console.error("Error sending email:", emailError);
		}

		res.status(200).json({
			success: true,
			message: "Password reset link sent to your email",
		});
	} catch (error) {
		console.error("Error in forgot password:", error);
		res.status(500).json({
			success: false,
			message: "An error occurred while processing your request",
			error: error.message,
		});
	}
};

/**
 * Verify if a reset token is valid and not expired
 */
const verifyResetToken = async (req, res) => {
	try {
		const { token } = req.params;

		// Find user with this token and check if it's expired
		const user = await User.findOne({
			resetPasswordToken: token,
			resetPasswordExpires: { $gt: Date.now() },
		});

		if (!user) {
			return res.status(400).json({
				success: false,
				message: "Password reset token is invalid or has expired",
			});
		}

		// Token is valid
		res.status(200).json({
			success: true,
			message: "Token is valid",
			userId: user._id,
		});
	} catch (error) {
		console.error("Error verifying reset token:", error);
		res.status(500).json({
			success: false,
			message: "An error occurred while verifying the token",
			error: error.message,
		});
	}
};

/**
 * Reset user's password using the token
 */
const resetPassword = async (req, res) => {
	try {
		const { token, password } = req.body;

		if (!token || !password) {
			return res.status(400).json({
				success: false,
				message: "Token and password are required",
			});
		}

		// Find user with this token and check if it's expired
		const user = await User.findOne({
			resetPasswordToken: token,
			resetPasswordExpires: { $gt: Date.now() },
		});

		if (!user) {
			return res.status(400).json({
				success: false,
				message: "Password reset token is invalid or has expired",
			});
		}

		// Generate new salt and hash the new password
		const salt = crypto.randomBytes(16).toString("hex");
		const hash = hashPassword(password, salt);

		// Update user's password
		user.passwordHash = hash;
		user.salt = salt;

		// Clear reset token fields
		user.resetPasswordToken = undefined;
		user.resetPasswordExpires = undefined;

		await user.save();

		// Send confirmation email
		const subject = "Your Password Has Been Changed";
		const html = `
			<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
				<div style="background: #e3f2fd; padding: 20px; border-radius: 5px 5px 0 0; border-left: 4px solid #2196f3;">
					<h2 style="color: #1565c0; margin: 0;">Password Changed Successfully</h2>
				</div>
				<div style="padding: 20px; background: #f8f9fa;">
					<p>Hello ${user.name},</p>
					<p>This is a confirmation that the password for your account with email <strong>${user.email}</strong> has just been changed.</p>
					<p>If you did not make this change, please contact our support team immediately.</p>
					<p style="margin-top: 30px; color: #888;">Best regards,<br>Finshelter Team</p>
				</div>
			</div>
		`;

		try {
			await sendZeptoMail({
				to: user.email,
				subject,
				html
			});
		} catch (emailError) {
			console.error("Error sending email:", emailError);
		}

		res.status(200).json({
			success: true,
			message: "Password has been reset successfully",
		});
	} catch (error) {
		console.error("Error resetting password:", error);
		res.status(500).json({
			success: false,
			message: "An error occurred while resetting your password",
			error: error.message,
		});
	}
};

// Check if an email is available (not used in User or Lead collections)
const checkEmailAvailability = async (req, res) => {
	try {
		const { email } = req.query;

		if (!email) {
			return res.status(400).json({
				success: false,
				message: "Email parameter is required"
			});
		}

		// Check both User and Lead collections
		const existingUser = await User.findOne({ email });
		const existingLead = await Lead.findOne({ email });

		if (existingUser) {
			return res.status(200).json({
				success: false,
				available: false,
				message: "This email is already associated with an account. Please login instead."
			});
		}

		if (existingLead) {
			return res.status(200).json({
				success: false,
				available: false,
				message: "A lead with this email already exists. Our team will contact you soon."
			});
		}

		return res.status(200).json({
			success: true,
			available: true,
			message: "Email is available."
		});

	} catch (error) {
		console.error("Error checking email availability:", error);
		return res.status(500).json({
			success: false,
			message: "Server error while checking email availability."
		});
	}
};

module.exports = {
	getCustomerDashboard,
	getUserServices,
	registerCustomer,
	registerFlexiCustomer,
	updateCustomerProfile,
	handlePaymentSuccess,
	uploadDocuments,
	deleteUser,
	loginUser,
	initiatePayment,
	getServiceById,
	sendQuery,
	getCustomerQueriesWithReplies,
	submitFeedback,
	updateBankDetails,
	processFlexiFunnelRedirect,
	googleRegister,
	forgotPassword,
	resetPassword,
	verifyResetToken,
	checkEmailAvailability,
};
