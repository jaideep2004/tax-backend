require("dotenv").config();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
const Wallet = require("../models/walletModel");
const User = require("../models/userModel");
const Service = require("../models/serviceModel");
const Message = require("../models/messageModel");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const {
	handleCustomerEmployeeAssignment,
	assignUnassignedCustomers,
} = require("../utils/customerAssignment");
// Utility: Hash password using SHA-256
const hashPassword = (password, salt) => {
	const hash = crypto.createHmac("sha256", salt);
	hash.update(password);
	return hash.digest("hex");
};

// Email transport configuration
const transporter = nodemailer.createTransport({
	service: "gmail", // Use your email service provider
	auth: {
		user: process.env.EMAIL_USER, // Your email address
		pass: process.env.EMAIL_PASS, // Your email app-specific password
	},
});

// Function to send emails with HTML template
const sendEmail = async (to, subject, text, htmlContent = null) => {
	try {
		// Default HTML template if no custom HTML is provided
		const defaultHtmlContent = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
			<style>
				body {
					font-family: 'Poppins', sans-serif;
					line-height: 1.6;
					color: #333;
					max-width: 600px;
					margin: 0 auto;
					padding: 20px;
					background-color: white;
				}
				.email-container {
					background-color: #95b8a2;
					border-radius: 10px;
					padding: 30px;
					box-shadow: 0 4px 6px rgba(0,0,0,0.1);
				}
				.email-header {
					background-color: #1b321d;
					color: white;
					text-align: center;
					padding: 15px;
					border-top-left-radius: 10px;
					border-top-right-radius: 10px;
				}
				.email-body {
					background-color: white;
					padding: 20px;
					border-bottom-left-radius: 10px;
					border-bottom-right-radius: 10px;
				}
				.email-footer {
					text-align: center;
					margin-top: 20px;
					color: #1b321d;
					font-size: 0.8em;
				}
			</style>
		</head>
		<body>
			<div class="email-container">
				<div class="email-header">
					<h1>${subject}</h1>
				</div>
				<div class="email-body">
					<p>${text.replace(/\n/g, "<br>")}</p>
				</div>
				<div class="email-footer">
					<p>© ${new Date().getFullYear()} TaxHarbor. All rights reserved.</p>
				</div>
			</div>
		</body>
		</html>
		`;

		// Send email with either custom or default HTML template
		await transporter.sendMail({
			from: process.env.EMAIL_USER,
			to,
			subject,
			text, // Plain text version
			html: htmlContent || defaultHtmlContent, // Use custom HTML or default template
		});
		console.log(`Email sent to ${to}`);
	} catch (error) {
		console.error(`Failed to send email to ${to}:`, error);
	}
};

// Admin login

const adminLogin = async (req, res) => {
	const { email, password } = req.body;

	try {
		const user = await User.findOne({ email });

		if (!user) {
			return res.status(400).json({ message: "Invalid credentials" });
		}

		const { passwordHash, salt } = user;
		const hashedPassword = hashPassword(password, salt);

		if (hashedPassword !== passwordHash) {
			return res.status(400).json({ message: "Invalid credentials" });
		}

		// Include additional fields in the token payload
		const token = jwt.sign(
			{
				_id: user._id, // Use _id to align with middleware expectations
				role: user.role,
				name: user.name, // Include the name for additional context if needed
				email: user.email, // Include email if needed
			},
			process.env.JWT_SECRET,
			{ expiresIn: "12h" }
		);

		res.json({ token });
	} catch (err) {
		console.error("Error during admin login:", err);
		res.status(500).json({ message: "Error logging in" });
	}
};

// Get all users

const getAllUsers = async (req, res) => {
	try {
		// Fetch all users
		const users = await User.find();

		// Populate services and messages for each user
		const usersWithDetails = await Promise.all(
			users.map(async (user) => {
				// Fetch and populate services by matching customerId
				const services = await Service.find(
					{ customerId: user._id },
					"name description status"
				);

				// Fetch messages for the user
				const messages = await Message.find({ recipient: user._id });

				// Return user details along with services and messages
				return { ...user.toObject(), services, messages };
			})
		);

		res.json(usersWithDetails); // Send the result to the client
		console.log("users", usersWithDetails);
	} catch (error) {
		console.error("Error fetching users with services and messages:", error);
		res
			.status(500)
			.json({ message: "Error fetching users with services and messages" });
	}
};

const getAllServices = async (req, res) => {
	try {
		// Fetch all fields, including createdAt
		const services = await Service.find(
			{},
			"serviceId category name description actualPrice salePrice status hsncode createdAt"
		);
		res.json({ services });
	} catch (err) {
		res.status(500).json({ message: "Error fetching services" });
	}
};

const getAllCustomerOrders = async (req, res) => {
	try {
		console.log("Fetching all customer orders...");

		// Find all users with role 'customer' and populate service details
		const customers = await User.aggregate([
			{ $match: { role: "customer" } },
			{ $unwind: "$services" },
			{
				$lookup: {
					from: "services",
					localField: "services.serviceId",
					foreignField: "_id",
					as: "serviceDetails",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "services.employeeId",
					foreignField: "_id",
					as: "employeeDetails",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "L1EmpCode",
					foreignField: "_id",
					as: "l1EmployeeDetails",
				},
			},
			{
				$addFields: {
					serviceDetail: { $arrayElemAt: ["$serviceDetails", 0] },
					employeeDetail: { $arrayElemAt: ["$employeeDetails", 0] },
					l1EmployeeDetail: { $arrayElemAt: ["$l1EmployeeDetails", 0] },

					// Calculate days delayed
					daysDelayed: {
						$let: {
							vars: {
								timeDiff: {
									$subtract: [new Date(), "$services.dueDate"],
								},
							},
							in: {
								$cond: {
									if: { $gt: ["$$timeDiff", 0] },
									then: {
										$ceil: {
											$divide: ["$$timeDiff", 1000 * 60 * 60 * 24],
										},
									},
									else: 0,
								},
							},
						},
					},
				},
			},
			{
				$project: {
					"Order ID": "$services.orderId",
					"Order Date": "$services.purchasedAt",
					"Customer ID": "$_id",
					"Customer Name": "$name",
					"Customer Email": "$email",
					"Customer Mobile Number": "$mobile",
					"Employee Code": "$services.employeeId",
					"Employee Assigned": "$employeeDetail.name",
					"L1 Employee Code": "$L1EmpCode",
					"L1 Employee Name": "$L1Name",
					"Service Name": "$serviceDetail.name",
					"Service Price": "$serviceDetail.salePrice",
					Discounts: { $ifNull: ["$services.discount", 0] },
					"IGST Amount": { $ifNull: ["$services.igst", 0] },
					"CGST Amount": { $ifNull: ["$services.cgst", 0] },
					"SGST Amount": { $ifNull: ["$services.sgst", 0] },
					"Total Order Value": {
						$sum: [
							"$serviceDetail.salePrice",
							{ $ifNull: ["$services.igst", 0] },
							{ $ifNull: ["$services.cgst", 0] },
							{ $ifNull: ["$services.sgst", 0] },
						],
					},
					"Order Status": "$services.status",
					"Order Completion Date": "$services.completionDate",
					"Days Delayed": "$daysDelayed",
					"Reason for Delay": "$services.delayReason",
					"Feedback Status": {
						$cond: {
							if: { $gt: [{ $size: "$services.feedback" }, 0] },
							then: "Received",
							else: "Pending",
						},
					},
					Feedback: { $arrayElemAt: ["$services.feedback.feedback", 0] },
					Rating: { $arrayElemAt: ["$services.feedback.rating", 0] },
					"Payment Method": "$paymentHistory.paymentMethod",
					"Payment Status": "$paymentHistory.status",
					"Refund Status": "$services.refundStatus",
					"Razorpay Order ID": "$paymentHistory.paymentId",
					"Invoice Receipt": "$services.invoiceUrl",
				},
			},
		]);

		console.log(`Processed ${customers.length} orders`);

		res.status(200).json({
			success: true,
			count: customers.length,
			orders: customers,
		});
	} catch (error) {
		console.error("Error in getAllCustomerOrders:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching customer orders",
			error: error.message,
		});
	}
};

// New admin controller function
// const assignOrderToEmployee = async (req, res) => {
// 	try {
// 		const { orderId, employeeId } = req.body;

// 		if (!orderId || !employeeId) {
// 			return res.status(400).json({
// 				success: false,
// 				message: "Order ID and Employee ID are required",
// 			});
// 		}

// 		// Find the customer with the given order ID
// 		const customer = await User.findOne({
// 			"services.orderId": orderId,
// 			role: "customer",
// 		});

// 		if (!customer) {
// 			return res.status(404).json({
// 				success: false,
// 				message: "Order not found",
// 			});
// 		}

// 		// Find the employee
// 		const employee = await User.findOne({
// 			_id: employeeId,
// 			role: "employee",
// 		});

// 		if (!employee) {
// 			return res.status(404).json({
// 				success: false,
// 				message: "Employee not found",
// 			});
// 		}

// 		// Find the service index in customer's services array
// 		const serviceIndex = customer.services.findIndex(
// 			(service) => service.orderId === orderId
// 		);

// 		if (serviceIndex === -1) {
// 			return res.status(404).json({
// 				success: false,
// 				message: "Order not found in customer's services",
// 			});
// 		}

// 		// Get the service ID
// 		const serviceId = customer.services[serviceIndex].serviceId;

// 		// Check if employee can handle this service
// 		if (!employee.servicesHandled.includes(serviceId)) {
// 			return res.status(400).json({
// 				success: false,
// 				message: "Employee does not handle this service type",
// 			});
// 		}

// 		// Update the employee ID for the specific order
// 		customer.services[serviceIndex].employeeId = employeeId;

// 		// Add customer to employee's assignedCustomers if not already there
// 		if (!employee.assignedCustomers.includes(customer._id)) {
// 			employee.assignedCustomers.push(customer._id);
// 		}

// 		// Save both documents
// 		await customer.save();
// 		await employee.save();

// 		// Send email notifications
// 		await sendEmail(
// 			customer.email,
// 			"Employee Assigned to Your Order",
// 			`Hello ${customer.name},\n\nWe've assigned ${employee.name} to handle your order #${orderId}. They will contact you shortly.`
// 		);

// 		await sendEmail(
// 			employee.email,
// 			"New Order Assignment",
// 			`Hello ${employee.name},\n\nYou've been assigned to handle order #${orderId} for customer ${customer.name} (${customer.email}).`
// 		);

// 		res.status(200).json({
// 			success: true,
// 			message: "Order assigned to employee successfully",
// 		});
// 	} catch (error) {
// 		console.error("Error assigning order to employee:", error);
// 		res.status(500).json({
// 			success: false,
// 			message: "Error assigning order to employee",
// 			error: error.message,
// 		});
// 	}
// };

const assignOrderToEmployee = async (req, res) => {
	try {
		const { orderId, employeeId } = req.body;
		console.log("Received Payload:", { orderId, employeeId });
		if (!orderId || !employeeId) {
			return res.status(400).json({
				success: false,
				message: "Order ID and Employee ID are required",
			});
		}

		// Find the customer with the given order ID
		const customer = await User.findOne({
			"services.orderId": orderId,
			role: "customer",
		});

		if (!customer) {
			return res.status(404).json({
				success: false,
				message: "Order not found",
			});
		}

		// Find the employee
		const employee = await User.findOne({
			_id: employeeId,
			role: "employee",
		});

		if (!employee) {
			return res.status(404).json({
				success: false,
				message: "Employee not found",
			});
		}

		// Find the service index in customer's services array
		const serviceIndex = customer.services.findIndex(
			(service) => service.orderId === orderId
		);

		if (serviceIndex === -1) {
			return res.status(404).json({
				success: false,
				message: "Order not found in customer's services",
			});
		}

		// Get the service ID
		const serviceId = customer.services[serviceIndex].serviceId;

		// Update the employee ID for the specific order
		customer.services[serviceIndex].employeeId = employeeId;

		// Add customer to employee's assignedCustomers if not already there
		if (!employee.assignedCustomers.some((c) => c._id === customer._id)) {
			// Push the full customer object, mapping all relevant fields from the customer document
			employee.assignedCustomers.push({
				_id: customer._id,
				name: customer.name,
				email: customer.email,
				role: customer.role, // Required fields
				mobile: customer.mobile || null,
				username: customer.username || null,
				isActive: customer.isActive || false,
				isProfileComplete: customer.isProfileComplete || false,
				services: customer.services.map((service) => ({
					orderId: service.orderId,
					serviceId: service.serviceId,
					activated: service.activated,
					purchasedAt: service.purchasedAt,
					employeeId: service.employeeId,
					status: service.status,
					dueDate: service.dueDate,
					documents: service.documents.map((doc) => ({
						filename: doc.filename,
						originalName: doc.originalName,
						path: doc.path,
						mimetype: doc.mimetype,
						size: doc.size,
						uploadedAt: doc.uploadedAt,
					})),
					queries: service.queries.map((query) => ({
						query: query.query,
						status: query.status,
						replies: query.replies.map((reply) => ({
							employeeId: reply.employeeId,
							response: reply.response,
							createdAt: reply.createdAt,
						})),
						attachments: query.attachments.map((attachment) => ({
							filePath: attachment.filePath,
							originalName: attachment.originalName,
						})),
						createdAt: query.createdAt,
					})),
					feedback: service.feedback.map((fb) => ({
						feedback: fb.feedback,
						rating: fb.rating,
						createdAt: fb.createdAt,
					})),
				})),
				paymentHistory: customer.paymentHistory.map((payment) => ({
					paymentId: payment.paymentId,
					amount: payment.amount,
					date: payment.date,
					status: payment.status,
					paymentMethod: payment.paymentMethod,
				})),
				dob: customer.dob || null,
				gender: customer.gender || null,
				pan: customer.pan || null,
				gst: customer.gst || null,
				address: customer.address || null,
				city: customer.city || null,
				state: customer.state || null,
				country: customer.country || null,
				postalCode: customer.postalCode || null,
				natureEmployment: customer.natureEmployment || null,
				annualIncome: customer.annualIncome || null,
				education: customer.education || null,
				certifications: customer.certifications || null,
				institute: customer.institute || null,
				completionDate: customer.completionDate || null,
				activeFrom: customer.activeFrom || null,
				activeTill: customer.activeTill || null,
				customerCreateDate: customer.customerCreateDate || null,
			});
		}

		// Save both documents
		await customer.save();
		await employee.save();

		// Send email notifications
		await sendEmail(
			customer.email,
			"Employee Assigned to Your Order",
			`Hello ${customer.name},\n\nWe've assigned ${employee.name} to handle your order #${orderId}. They will contact you shortly.`
		);

		await sendEmail(
			employee.email,
			"New Order Assignment",
			`Hello ${employee.name},\n\nYou've been assigned to handle order #${orderId} for customer ${customer.name} (${customer.email}).`
		);

		res.status(200).json({
			success: true,
			message: "Order assigned to employee successfully",
		});
	} catch (error) {
		console.error("Error assigning order to employee:", error);
		res.status(500).json({
			success: false,
			message: "Error assigning order to employee",
			error: error.message,
		});
	}
};

const getDashboardData = async (req, res) => {
	try {
		// Get all services
		const services = await Service.find({}); 

		// Get all users with populated service details and complete information
		const users = await User.find({})
			.populate({
				path: "services.serviceId",
				select: "name description status price",
			})
			.populate({
				path: "assignedEmployees",
				select: "name email mobile",
			})
			.populate({
				path: "referredUsers",
				select: "name email mobile",
			});

		// Transform user data to include all necessary fields
		const transformedUsers = users.map((user) => ({
			...user.toObject(),
			services: user.services.map((service) => ({
				...service,
				name: service.serviceId ? service.serviceId.name : "Unknown Service",
				price: service.serviceId ? service.serviceId.price : 0,
			})),
			bankDetails: user.bankDetails || {},
			paymentHistory: user.paymentHistory || [],
			address: user.address || "",
			city: user.city || "",
			state: user.state || "",
			country: user.country || "",
			pan: user.pan || "",
			gst: user.gst || "",
			gender: user.gender || "",
			dob: user.dob || "",
			education: user.education || "",
			institute: user.institute || "",
			certifications: user.certifications || "",
			annualIncome: user.annualIncome || "",
		}));

		res.json({
			users: transformedUsers,
			services,
			success: true,
		});
	} catch (err) {
		console.error("Error fetching dashboard data:", err);
		res.status(500).json({
			message: "Error fetching dashboard data",
			error: err.message,
			success: false,
		});
	}
};

const createService = async (req, res) => {
	const {
		category,
		name,
		description,
		actualPrice,
		salePrice,
		hsncode,
		processingDays,
		requiredDocuments,
	} = req.body;

	try {
		const newService = new Service({
			category,
			name,
			description,
			actualPrice,
			salePrice,
			hsncode,
			processingDays,
			requiredDocuments,
		});
		await newService.save();
		res.status(201).json({ service: newService });
	} catch (err) {
		res.status(500).json({ message: "Error creating service" });
	}
};

const updateService = async (req, res) => {
	const { serviceId } = req.params;
	const {
		category,
		name,
		description,
		actualPrice,
		salePrice,
		hsncode,
		processingDays,
		requiredDocuments,
	} = req.body;

	try {
		// Find the service
		const service = await Service.findById(serviceId);
		if (!service) {
			return res.status(404).json({ message: "Service not found" });
		}

		// Calculate the difference in processing days
		const daysDifference = processingDays - (service.processingDays || 0);

		// Update the service template
		const updatedService = await Service.findByIdAndUpdate(
			serviceId,
			{
				category,
				name,
				description,
				actualPrice,
				salePrice,
				hsncode,
				processingDays,
				requiredDocuments,
			},
			{ new: true }
		);

		// If processing days have changed, update all active user services
		if (daysDifference !== 0) {
			const users = await User.find({ "services.serviceId": serviceId });

			for (const user of users) {
				const serviceIndex = user.services.findIndex(
					(s) => s.serviceId.toString() === serviceId
				);

				if (
					serviceIndex !== -1 &&
					user.services[serviceIndex].documents &&
					user.services[serviceIndex].documents.length > 0
				) {
					// Update the due date
					const currentDueDate = new Date(user.services[serviceIndex].dueDate);
					currentDueDate.setDate(currentDueDate.getDate() + daysDifference);

					user.services[serviceIndex].dueDate = currentDueDate;
					user.services[serviceIndex].processingDays = processingDays;

					await user.save();
				}
			}
		}

		res.json({
			message: "Service updated successfully",
			service: updatedService,
		});
	} catch (err) {
		console.error("Error updating service:", err);
		res.status(500).json({
			message: "Error updating service",
			error: err.message,
		});
	}
};

// Delete a service
const deleteService = async (req, res) => {
	const { serviceId } = req.params;

	try {
		const deletedService = await Service.findByIdAndDelete(serviceId);
		if (!deletedService) {
			return res.status(404).json({ message: "Service not found" });
		}

		res.json({
			message: "Service deleted successfully",
			service: deletedService,
		});
	} catch (err) {
		console.error("Error deleting service:", err);
		res.status(500).json({ message: "Error deleting service" });
	}
};

const updateServiceStatusByAdmin = async (req, res) => {
	const { userId } = req.params;
	const { serviceId, status } = req.body; // We now use serviceId instead of serviceName

	console.log("Received userId:", userId);
	console.log("Received serviceId:", serviceId); // Log the serviceId instead
	console.log("Received status:", status);

	try {
		const user = await User.findById(userId);
		if (!user) {
			console.log("User not found");
			return res.status(404).json({ message: "User not found" });
		}

		// Find the service by serviceId
		const serviceIndex = user.services.findIndex(
			(service) => service.serviceId === serviceId // Now using serviceId to find the service
		);

		if (serviceIndex === -1) {
			console.log("Service not found for this user");
			return res
				.status(404)
				.json({ message: "Service not found for this user" });
		}

		// Update the service status
		user.services[serviceIndex].status = status;
		await user.save();

		console.log("Service status updated successfully");
		res.status(200).json({
			message: "Service status updated successfully",
			status: user.services[serviceIndex].status,
		});
	} catch (error) {
		console.error("Error updating service status:", error);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Activate user
const activateUser = async (req, res) => {
	const { userId } = req.params;
	try {
		const user = await User.findByIdAndUpdate(
			userId,
			{ isActive: true },
			{ new: true }
		);
		res.json({ message: "User activated", user });
	} catch (err) {
		res.status(500).json({ message: "Error activating user" });
	}
};

// Deactivate user
const deactivateUser = async (req, res) => {
	const { userId } = req.params;
	try {
		const user = await User.findByIdAndUpdate(
			userId,
			{ isActive: false },
			{ new: true }
		);
		res.json({ message: "User deactivated", user });
	} catch (err) {
		res.status(500).json({ message: "Error deactivating user" });
	}
};

// Delete user
const deleteUser = async (req, res) => {
	const { userId } = req.params;

	try {
		const user = await User.findByIdAndDelete(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		res.json({ message: "User deleted successfully", user });
	} catch (err) {
		console.error("Error deleting user:", err);
		res.status(500).json({ message: "Error deleting user" });
	}
};

const createEmployee = async (req, res) => {
	const {
		name,
		email,
		role,
		services, // Array of service IDs
		username,
		password,
		Lminus1code,
		L1EmpCode,
	} = req.body;

	try {
		if (
			!name ||
			!email ||
			!role ||
			!services ||
			!Array.isArray(services) ||
			services.length === 0 ||
			!username ||
			!password ||
			!Lminus1code
		) {
			return res.status(400).json({ message: "All fields are required" });
		}

		if (role !== "employee") {
			return res.status(400).json({ message: "Role must be 'employee'" });
		}

		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res
				.status(400)
				.json({ message: "User already exists with this email" });
		}

		const salt = crypto.randomBytes(16).toString("hex");
		const hashedPassword = hashPassword(password, salt);

		const newEmployee = new User({
			name,
			email,
			role,
			servicesHandled: services, // Store the array of service IDs
			username,
			passwordHash: hashedPassword,
			salt,
			assignedCustomers: [],
			isActive: true,
			Lminus1code,
			L1EmpCode,
		});

		await newEmployee.save();

		// Assign any existing unassigned customers for these services
		let allAssignments = [];
		for (const serviceId of services) {
			const assignments = await assignUnassignedCustomers(
				serviceId,
				newEmployee
			);
			allAssignments = [...allAssignments, ...assignments];
		}

		await sendEmail(
			email,
			"Welcome to the Team",
			`Hello ${name},\n\nYour account has been created as an employee. Please log in with your credentials.\n\nUsername: ${username}\nPassword: ${password}`
		);

		res.status(201).json({
			employee: newEmployee,
			customerAssignments: allAssignments,
		});
	} catch (err) {
		console.error("Error creating employee:", err);
		res.status(500).json({ message: "Error creating employee" });
	}
};

//promote
const promoteToManager = async (req, res) => {
	try {
		const { employeeId } = req.body;

		if (!employeeId) {
			return res
				.status(400)
				.json({ success: false, message: "Employee ID is required" });
		}

		// Find the employee by ID
		const employee = await User.findById(employeeId);

		if (!employee) {
			return res
				.status(404)
				.json({ success: false, message: "Employee not found" });
		}

		// Validate that the user is currently an employee
		if (employee.role !== "employee") {
			return res.status(400).json({
				success: false,
				message: `Cannot promote: user is already a ${employee.role}, not an employee`,
			});
		}

		// Check if employee is active
		if (!employee.isActive) {
			return res.status(400).json({
				success: false,
				message:
					"Cannot promote inactive employee. Please activate the employee first.",
			});
		}

		// Update employee role to manager
		employee.role = "manager";
		await employee.save();

		return res.status(200).json({
			success: true,
			message: `${employee.name} has been successfully promoted to manager`,
			employee: {
				_id: employee._id,
				name: employee.name,
				email: employee.email,
				role: employee.role,
			},
		});
	} catch (error) {
		console.error("Error promoting employee to manager:", error);
		return res.status(500).json({
			success: false,
			message: "Server error while promoting employee",
			error: error.message,
		});
	}
};

const createManager = async (req, res) => {
	try {
		const { name, email, role, username, password } = req.body;
		const admin = req.user; // Gets admin info from authMiddleware

		// Basic validation
		if (!name || !email || !role || !username || !password) {
			return res.status(400).json({ message: "All fields are required" });
		}

		if (role !== "manager") {
			return res.status(400).json({ message: "Role must be 'manager'" });
		}

		// Check for existing user
		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res
				.status(400)
				.json({ message: "User already exists with this email" });
		}

		// Create password hash
		const salt = crypto.randomBytes(16).toString("hex");
		const hashedPassword = hashPassword(password, salt);

		// Create new manager with admin's details
		const newManager = new User({
			name,
			email,
			role,
			username,
			passwordHash: hashedPassword,
			salt,

			// Key changes: explicitly set L1 and L2 fields with admin's details
			L1EmpCode: admin._id.toString(), // Convert to string
			L1Name: admin.name,
			L2EmpCode: admin._id.toString(), // Convert to string
			L2Name: admin.name,

			isActive: true,
			isProfileComplete: true,
		});

		await newManager.save();

		// Send welcome email
		await sendEmail(
			email,
			"Welcome to the Team",
			`Hello ${name},\n\nYour account has been created as a manager. Please log in with your credentials.\n\nUsername: ${username}\nPassword: ${password}`
		);

		res.status(201).json({ manager: newManager });
	} catch (err) {
		console.error("Error creating manager:", err);
		res.status(500).json({ message: "Error creating manager" });
	}
};

// Modified assignEmployeeToManager function
const assignEmployeeToManager = async (req, res) => {
	const { managerId, employeeId } = req.body;

	try {
		const manager = await User.findById(managerId);
		if (!manager || manager.role !== "manager") {
			return res.status(400).json({ message: "Invalid manager" });
		}

		const employee = await User.findById(employeeId);
		if (!employee || employee.role !== "employee") {
			return res.status(400).json({ message: "Invalid employee" });
		}

		// Update employee with manager's information
		employee.L1EmpCode = manager._id.toString(); // Convert to string
		employee.L1Name = manager.name; // Store manager's name as L1Name
		employee.assignedManagerId = managerId;
		await employee.save();

		// Update manager's assigned employees
		if (!manager.assignedEmployees.includes(employeeId)) {
			manager.assignedEmployees.push(employeeId);
			await manager.save();
		}

		// Send notification emails
		await sendEmail(
			manager.email,
			"New Employee Assigned",
			`Hello ${manager.name},\n\nA new employee has been assigned to you.\n\nEmployee Name: ${employee.name}\nEmployee Email: ${employee.email}`
		);

		await sendEmail(
			employee.email,
			"Manager Assigned",
			`Hello ${employee.name},\n\nYou have been assigned a manager.\n\nManager Name: ${manager.name}\nManager Email: ${manager.email}`
		);

		res.json({
			message: "Employee assigned to manager successfully",
			manager,
			employee,
		});
	} catch (err) {
		console.error("Error assigning employee to manager:", err);
		res.status(500).json({ message: "Error assigning employee to manager" });
	}
};

// Create a new user (admin or employee)
const createUser = async (req, res) => {
	const { name, email, role, serviceId, username, password } = req.body;

	console.log("Received request to create user with data:", req.body);

	try {
		// Validate required fields
		if (!name || !email || !role || !username || !password) {
			console.log("Validation failed: Missing required fields.");
			return res.status(400).json({ message: "All fields are required" });
		}

		// Validate role
		if (!["employee", "admin", "customer"].includes(role)) {
			console.log(`Validation failed: Invalid role "${role}"`);
			return res.status(400).json({ message: "Invalid role" });
		}

		// Ensure serviceId is valid for employees
		if (role === "employee") {
			console.log("Role is employee; validating serviceId...");
			if (!serviceId) {
				console.log("Validation failed: Missing serviceId for employee role.");
				return res
					.status(400)
					.json({ message: "Service ID is required for employees" });
			}

			// Check if the provided serviceId exists
			const service = await Service.findById(serviceId);
			if (!service) {
				console.log(`Validation failed: Invalid serviceId "${serviceId}"`);
				return res.status(400).json({ message: "Invalid Service ID" });
			}
		}

		// Check if the email is already in use
		console.log(`Checking if email "${email}" already exists...`);
		const existingUser = await User.findOne({ email });
		if (existingUser) {
			console.log(`Validation failed: Email "${email}" already exists.`);
			return res
				.status(400)
				.json({ message: "User already exists with this email" });
		}

		// Hash the password
		console.log("Hashing the password...");
		const salt = crypto.randomBytes(16).toString("hex");
		const hashedPassword = hashPassword(password, salt);

		// Create the user (admin or employee)
		console.log("Creating new user...");
		const newUser = new User({
			name,
			email,
			role,
			serviceId,

			username,
			passwordHash: hashedPassword,
			salt,
		});

		// Save the user to the database
		await newUser.save();
		console.log("New user created successfully:", newUser);

		res.status(201).json({ user: newUser });
	} catch (err) {
		console.error("Error creating user:", err);
		res.status(500).json({ message: "Error creating user" });
	}
};
// Update a service

const getFilterOptions = async (req, res) => {
	try {
		// Fetch all customers (excluding admin)
		const customers = await User.find({ role: "customer" })
			.select("_id name email")
			.lean();

		// Fetch all services
		const services = await Service.find().select("serviceId name").lean();

		// Fetch all order IDs from services array
		const orders = await User.aggregate([
			{ $unwind: "$services" },
			{
				$group: {
					_id: null,
					orderIds: { $addToSet: "$services.orderId" },
				},
			},
		]);

		// Filter out any null or undefined orderIds
		const validOrderIds = orders[0]?.orderIds.filter((id) => id) || [];

		res.status(200).json({
			customers,
			services,
			orders: validOrderIds,
		});
	} catch (err) {
		console.error("Error fetching filter options:", err);
		res.status(500).json({
			message: "Error fetching filter options",
			error: err.message,
		});
	}
};

const updateDownloadAccess = async (req, res) => {
	const { employeeId, allowDownload } = req.body; // `allowDownload` is a boolean

	try {
		const employee = await User.findOne({ _id: employeeId, role: "employee" });
		if (!employee) {
			return res.status(404).json({ message: "Employee not found" });
		}

		employee.downloadAccess = allowDownload; // Update the field
		await employee.save();

		res.status(200).json({
			message: `Download access has been ${
				allowDownload ? "granted" : "revoked"
			} for the employee.`,
		});
	} catch (err) {
		console.error("Error updating download access:", err);
		res.status(500).json({ message: "Error updating download access" });
	}
};

const handleWithdrawalRequest = async (req, res) => {
	try {
		// Get all pending withdrawal requests with user details
		const withdrawalRequests = await Wallet.find({
			"withdrawalRequests.status": "pending",
		}).populate({
			path: "userId",
			model: "User", // Explicitly specify the model
			select: "name email bankDetails",
		});

		// Format the requests for frontend, with null checks
		const formattedRequests = withdrawalRequests.flatMap((wallet) => {
			if (!wallet.userId) {
				return []; // Skip if no user found
			}

			return wallet.withdrawalRequests
				.filter((request) => request.status === "pending")
				.map((request) => ({
					_id: request._id, // Changed from id to _id to match MongoDB
					userId: wallet.userId._id, // Include userId for the approval process
					user: {
						name: wallet.userId.name || "Unknown",
						email: wallet.userId.email || "No email",
						bankDetails: wallet.userId.bankDetails || {},
					},
					amount: request.amount,
					status: request.status,
					createdAt: request.createdAt,
				}));
		});

		res.json(formattedRequests);
	} catch (error) {
		console.error("Error fetching withdrawal requests:", error);
		res.status(500).json({ message: "Error fetching withdrawal requests" });
	}
};

const approveWithdrawal = async (req, res) => {
	try {
		const { requestId, userId, amount, receipt } = req.body;

		const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;

		// Add transaction ID to receipt
		const receiptWithTxnId = {
			...receipt,
			transactionId,
		};
		// Update wallet withdrawal request status
		const wallet = await Wallet.findOneAndUpdate(
			{
				userId,
				"withdrawalRequests._id": requestId,
			},
			{
				$set: {
					"withdrawalRequests.$.status": "approved",
					"withdrawalRequests.$.processedAt": new Date(),
					"withdrawalRequests.$.transactionDetails": receiptWithTxnId,
				},
			},
			{ new: true }
		);

		if (!wallet) {
			return res.status(404).json({ message: "Withdrawal request not found" });
		}

		// Find user for email notification
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Send email to customer
		await sendEmail(
			user.email,
			"Withdrawal Request Processed",
			`Dear ${user.name},\n\n` +
				`Your withdrawal request for ₹${amount} has been processed.\n\n` +
				`Transaction Details:\n` +
				`Transaction ID: ${transactionId}\n` +
				`Transfer Date: ${receipt.transferDate}\n` +
				`Remarks: ${receipt.remarks}\n\n` +
				`The amount has been transferred to your registered bank account.\n\n` +
				`Thank you for using our services.\n\n` +
				`Best regards,\nTaxHarbor Team`
		);

		// Send email to admin
		await sendEmail(
			process.env.EMAIL_USER,
			"Withdrawal Request Processed - Confirmation",
			`A withdrawal request has been processed:\n\n` +
				`User: ${user.name} (${user.email})\n` +
				`Amount: ₹${amount}\n` +
				`Transaction ID: ${transactionId}\n` +
				`Transfer Date: ${receipt.transferDate}\n` +
				`Bank Details:\n` +
				`Account Number: ${user.bankDetails.accountNumber}\n` +
				`Bank Name: ${user.bankDetails.bankName}\n` +
				`IFSC Code: ${user.bankDetails.ifscCode}`
		);

		// Add transaction record to wallet
		wallet.transactions.push({
			type: "debit",
			amount: amount,
			description: "Withdrawal processed",
			transactionId: transactionId,
			status: "approved",
		});
		await wallet.save();

		res.json({ message: "Withdrawal request processed successfully" });
	} catch (error) {
		console.error("Error processing withdrawal:", error);
		res.status(500).json({ message: "Error processing withdrawal request" });
	}
};

const assignServiceToFlexiCustomer = async (req, res) => {
	const { userId, serviceId } = req.body;

	try {
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Check if user has this service interest
		if (user.serviceInterest?.toString() !== serviceId) {
			return res
				.status(400)
				.json({ message: "This service was not requested by the customer" });
		}

		// Generate order ID
		const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

		// Get service details for processing days
		const service = await Service.findById(serviceId);
		if (!service) {
			return res.status(404).json({ message: "Service not found" });
		}

		// Calculate due date based on processing days
		const dueDate = new Date();
		dueDate.setDate(dueDate.getDate() + (service.processingDays || 7)); // Default to 7 days if not specified

		// Create new service entry
		const newService = {
			orderId,
			serviceId,
			activated: true,
			purchasedAt: new Date(),
			status: "In Process",
			dueDate,
			documents: [],
			queries: [],
			feedback: [],
		};

		// Add service to user's services array
		user.services.push(newService);

		// Clear serviceInterest as it's now been assigned
		user.serviceInterest = null;

		await user.save();

		// Send email notification
		await sendEmail(
			user.email,
			"Service Assigned Successfully",
			`Dear ${user.name},\n\n` +
				`Your requested service has been assigned.\n\n` +
				`Order ID: ${orderId}\n` +
				`Service: ${service.name}\n` +
				`Expected completion date: ${dueDate.toLocaleDateString()}\n\n` +
				`You can now track your service status in your dashboard.\n\n` +
				`Best regards,\nTeam`
		);

		res.json({
			message: "Service assigned successfully",
			user,
			orderId,
			service: newService,
		});
	} catch (error) {
		console.error("Error assigning service:", error);
		res
			.status(500)
			.json({ message: "Error assigning service", error: error.message });
	}
};

const updateCustomerInfo = async (req, res) => {
	const { userId } = req.params;
	const updateData = req.body;

	try {
		// Find user and ensure they are a customer
		const user = await User.findOne({ _id: userId, role: "customer" });
		if (!user) {
			return res.status(404).json({ message: "Customer not found" });
		}

		// Fields that can be updated
		const allowedFields = [
			"name",
			"email",
			"mobile",
			"dob",
			"gender",
			"pan",
			"gst",
			"address",
			"city",
			"state",
			"country",
			"postalCode",
			"natureEmployment",
			"annualIncome",
			"education",
			"university",
			"passingMonthYear",
			"certifications",
			"institute",
			"completionDate",
			"bankDetails",
			"reasonForInactive",
		];

		// Filter out any fields that aren't in allowedFields
		const filteredData = Object.keys(updateData).reduce((acc, key) => {
			if (allowedFields.includes(key)) {
				acc[key] = updateData[key];
			}
			return acc;
		}, {});

		// Update user with filtered data
		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{ $set: filteredData },
			{ new: true, runValidators: true }
		);

		// Send email notification to customer
		await sendEmail(
			updatedUser.email,
			"Profile Information Updated",
			`Dear ${updatedUser.name},\n\nYour profile information has been updated by an administrator. Please review the changes in your dashboard.\n\nIf you notice any discrepancies, please contact support immediately.\n\nBest regards,\nTaxHarbor Team`
		);

		res.json({
			message: "Customer information updated successfully",
			user: updatedUser,
		});
	} catch (error) {
		console.error("Error updating customer information:", error);
		res.status(500).json({
			message: "Error updating customer information",
			error: error.message,
		});
	}
};

module.exports = {
	adminLogin,
	getAllUsers,
	getAllServices,
	getDashboardData,
	createService,
	activateUser,
	deactivateUser,
	deleteUser,
	createEmployee,

	createUser,
	updateService,
	deleteService,
	createManager,
	assignEmployeeToManager,
	updateServiceStatusByAdmin,
	getFilterOptions,
	updateDownloadAccess,

	getAllCustomerOrders,

	handleWithdrawalRequest,
	approveWithdrawal,

	assignServiceToFlexiCustomer,

	updateCustomerInfo,

	promoteToManager,

	assignOrderToEmployee,
};
