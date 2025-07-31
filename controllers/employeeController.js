const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Service = require("../models/serviceModel");
const Message = require("../models/messageModel");
const Lead = require("../models/leadModel");
const path = require("path");
const fs = require("fs");
const { sendEmail } = require("../utils/emailUtils");
const sendZeptoMail = require("../utils/sendZeptoMail");

// Utility: Hash password using SHA-256
const hashPassword = (password, salt) => {
	const hash = crypto.createHmac("sha256", salt);
	hash.update(password);
	return hash.digest("hex");
};

// Employee login
const employeeLogin = async (req, res) => {
	const { email, password } = req.body;

	try {
		const user = await User.findOne({ email });

		if (!user || user.role !== "employee") {
			return res
				.status(400)
				.json({ message: "Invalid credentials or not an employee" });
		}

		const { passwordHash, salt } = user;
		const hashedPassword = hashPassword(password, salt);

		if (hashedPassword !== passwordHash) {
			return res.status(400).json({ message: "Invalid credentials" });
		}

		// Include additional fields in the token payload
		const token = jwt.sign(
			{
				_id: user._id,
				role: user.role,
				name: user.name,
				email: user.email,
			},
			process.env.JWT_SECRET,
			{ expiresIn: "12h" }
		);

		res.json({ token });
	} catch (err) {
		console.error("Error during employee login:", err);
		res.status(500).json({ message: "Error logging in" });
	}
};

// const getEmployeeDash = async (req, res) => {
// 	try {
// 		const employeeId = req.user._id; // Assuming this comes from auth middleware

// 		// Fetch complete employee information with populated references
// 		const employeeInfo = await User.findById(employeeId)
// 			.populate({
// 				path: "assignedCustomers",
// 				select: "-passwordHash -salt", // Exclude sensitive information
// 			})
// 			.populate({
// 				path: "serviceId",
// 				select: "name description price", // Add relevant service fields
// 			})
// 			.populate({
// 				path: "L1EmpCode",
// 				select: "name email", // Add relevant manager fields
// 			})
// 			.populate("services")
// 			.populate("paymentHistory")
// 			.lean();

// 		// Fetch metrics (customize based on your requirements)
// 		const metrics = {
// 			totalCustomers: employeeInfo.assignedCustomers.length,
// 			activeCustomers: employeeInfo.assignedCustomers.filter((c) => c.isActive)
// 				.length,
// 			completedServices: employeeInfo.services.filter(
// 				(s) => s.status === "completed"
// 			).length,
// 			// Add other relevant metrics
// 		};

// 		// Fetch status information
// 		const status = {
// 			isActive: employeeInfo.isActive,
// 			isProfileComplete: employeeInfo.isProfileComplete,
// 			lastLogin: employeeInfo.lastLogin,
// 			// Add other status fields
// 		};

// 		res.status(200).json({
// 			success: true,
// 			data: {
// 				employeeInfo,
// 				metrics,
// 				status,
// 			},
// 		});
// 	} catch (error) {
// 		console.error("Employee Dashboard Error:", error);
// 		res.status(500).json({
// 			success: false,
// 			message: "Error fetching employee dashboard",
// 			error: error.message,
// 		});
// 	}
// };

const getEmployeeDash = async (req, res) => {
	try {
		const employeeId = req.user._id;

		// Fetch complete employee information with populated references
		const employeeInfo = await User.findById(employeeId)
			.populate({
				path: "assignedCustomers",
				select: "-passwordHash -salt",
				populate: {
					path: "services",
					match: { employeeId: employeeId }, // Only get services assigned to this employee
				},
			})
			.populate({
				path: "serviceId",
				select: "name description price",
			})
			.populate({
				path: "L1EmpCode",
				select: "name email",
			})
			.populate("services")
			.populate("paymentHistory")
			.lean();

		// Calculate completed services from assigned customers
		let completedServices = 0;
		const customerServices = employeeInfo.assignedCustomers.reduce(
			(acc, customer) => {
				if (customer.services && Array.isArray(customer.services)) {
					const customerCompleted = customer.services.filter(
						(s) =>
							s.status === "completed" &&
							s.employeeId.toString() === employeeId.toString()
					).length;
					completedServices += customerCompleted;
					return [
						...acc,
						...customer.services.filter(
							(s) => s.employeeId.toString() === employeeId.toString()
						),
					];
				}
				return acc;
			},
			[]
		);

		// Combine employee's own services with customer services
		const allServices = [...(employeeInfo.services || []), ...customerServices];

		// Fetch metrics
		const metrics = {
			totalCustomers: employeeInfo.assignedCustomers.length,
			activeCustomers: employeeInfo.assignedCustomers.filter((c) => c.isActive)
				.length,
			completedServices:
				completedServices +
				(employeeInfo.services || []).filter((s) => s.status === "completed")
					.length,
		};

		// Fetch status information
		const status = {
			isActive: employeeInfo.isActive,
			isProfileComplete: employeeInfo.isProfileComplete,
			lastLogin: employeeInfo.lastLogin,
		};

		res.status(200).json({
			success: true,
			data: {
				employeeInfo: {
					...employeeInfo,
					allServices, // Include all relevant services in the response
				},
				metrics,
				status,
			},
		});
	} catch (error) {
		console.error("Employee Dashboard Error:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching employee dashboard",
			error: error.message,
		});
	}
};

// Update service status
const updateServiceStatus = async (req, res) => {
	try {
		const { customerId, serviceId, status } = req.body;
		const employeeId = req.user._id;

		// Validate inputs
		if (!customerId || !serviceId || !status) {
			return res.status(400).json({
				success: false,
				message: "Customer ID, Service ID, and status are required",
			});
		}

		// Find the customer
		const customer = await User.findById(customerId);
		if (!customer) {
			return res.status(404).json({
				success: false,
				message: "Customer not found",
			});
		}

		// Find the service
		const serviceIndex = customer.services.findIndex(
			(service) => service._id.toString() === serviceId.toString()
		);

		if (serviceIndex === -1) {
			return res.status(404).json({
				success: false,
				message: "Service not found",
			});
		}

		// Update the service status
		customer.services[serviceIndex].status = status;

		// Add additional data based on status
		if (status === "completed") {
			customer.services[serviceIndex].completedAt = new Date();
		}

		await customer.save();

		return res.status(200).json({
			success: true,
			message: "Service status updated successfully",
			status: status,
		});
	} catch (error) {
		console.error("Error updating service status:", error);
		return res.status(500).json({
			success: false,
			message: "Error updating service status",
			error: error.message,
		});
	}
};

const getAssignedCustomers = async (req, res) => {
	const employeeId = req.user._id; // Extract employee ID from JWT

	try {
		// Find the employee's assigned customers and get their manager
		const employee = await User.findById(employeeId)
			.select("assignedCustomers L1EmpCode")
			.populate({
				path: "L1EmpCode",
				select: "name",
			});

		if (!employee) {
			return res.status(404).json({ message: "Employee not found" });
		}

		const assignedCustomerIds = employee.assignedCustomers;

		if (!assignedCustomerIds || assignedCustomerIds.length === 0) {
			return res
				.status(200)
				.json({
					message: "No customers assigned to this employee",
					success: true,
					customers: [],
				});
		}

		// Get manager name
		const managerName = employee.L1EmpCode ? employee.L1EmpCode.name : null;

		// Fetch customers with their services assigned to this employee
		const customers = await User.find({
			_id: { $in: assignedCustomerIds },
			role: "customer",
		})
			.select("name email _id state services")
			.populate({
				path: "services.serviceId",
				select: "name description category",
			});

		// Filter services for the current employee and include all required fields
		const filteredCustomers = customers
			.map((customer) => {
				// Only include services assigned to this employee
				const relevantServices = customer.services.filter(
					(service) => service.employeeId?.toString() === employeeId.toString()
				);

				if (relevantServices.length > 0) {
					return {
						_id: customer._id,
						name: customer.name,
						email: customer.email,
						state: customer.state,
						L1Name: managerName, // Pass the manager's name to each customer
						services: relevantServices.map((service) => ({
							_id: service._id,
							orderId: service.orderId,
							serviceId: service.serviceId?._id,
							serviceName: service.serviceId?.name || "Unknown Service",
							serviceDescription: service.serviceId?.description || "",
							serviceCategory: service.serviceId?.category || "",
							packageName: service.packageName,
							activated: service.activated,
							purchasedAt: service.purchasedAt,
							status: service.status,
							dueDate: service.dueDate,
							completionDate: service.completionDate || null,
							price: service.price || 0,
							paymentAmount: service.paymentAmount || 0,
							paymentMethod: service.paymentMethod || "N/A",
							paymentReference: service.paymentReference || null,
							igst: service.igst || 0,
							cgst: service.cgst || 0,
							sgst: service.sgst || 0,
							discount: service.discount || 0,
							feedback: service.feedback || [],
							documents: service.documents || [],
							hasDocuments: service.documents?.length > 0,
							queries: service.queries?.length || 0,
							hasQueries: service.queries?.length > 0,
							delayReason: service.delayReason || "",
						})),
					};
				}
				return null;
			})
			.filter((customer) => customer !== null); // Remove null entries

		return res
			.status(200)
			.json({ success: true, customers: filteredCustomers });
	} catch (error) {
		console.error("Error fetching assigned customers:", error);
		res.status(500).json({
			message: "Error fetching assigned customers.",
			error: error.message,
		});
	}
};

// const updateServiceStatus = async (req, res) => {
// 	const { serviceId } = req.params; // serviceId of the service to update
// 	const { status } = req.body;
// 	const { customerId } = req.body; // Add customerId from the body

// 	try {
// 		// Validate the status input
// 		if (!["completed", "in-process", "rejected"].includes(status)) {
// 			return res.status(400).json({ message: "Invalid status" });
// 		}

// 		// Find and update the service within the user's services array for a specific customer
// 		const customer = await User.findOneAndUpdate(
// 			{ _id: customerId, "services.serviceId": serviceId }, // Match by customerId and serviceId
// 			{ $set: { "services.$.status": status } }, // Update the status of the specific service in the array
// 			{ new: true }
// 		);

// 		if (!customer) {
// 			return res.status(404).json({ message: "Customer or service not found" });
// 		}

// 		// Return the updated service status
// 		const updatedService = customer.services.find(
// 			(service) => service.serviceId === serviceId
// 		);
// 		res.json({
// 			message: `Service status updated to ${status}`,
// 			service: updatedService,
// 		});
// 	} catch (err) {
// 		console.error("Error updating service status:", err);
// 		res.status(500).json({ message: "Error updating service status" });
// 	}
// };

const getQueriesForEmployee = async (req, res) => {
	try {
		const employeeId = req.user._id; // Employee ID from JWT token

		// Fetch the employee's assigned customers
		const employee = await User.findById(employeeId).select(
			"assignedCustomers"
		);
		if (!employee || !employee.assignedCustomers?.length) {
			return res.status(404).json({
				message: "No assigned customers found for this employee.",
			});
		}

		// Fetch customers and their services
		const assignedCustomers = await User.find({
			_id: { $in: employee.assignedCustomers },
			role: "customer",
		}).select("services name email"); // Added name and email for context

		if (!assignedCustomers.length) {
			return res.status(404).json({
				message: "No services found for assigned customers.",
			});
		}

		// Extract queries only for services managed by the employee
		const queries = [];
		assignedCustomers.forEach((customer) => {
			if (!customer.services) return; // Skip if no services

			customer.services.forEach((service) => {
				// Check if the service has queries and is assigned to this employee
				if (
					service.queries?.length &&
					(service.employeeId === employeeId.toString() ||
						(service.employeeId &&
							service.employeeId.toString() === employeeId.toString()))
				) {
					queries.push(
						...service.queries.map((query) => ({
							...query.toObject(), // Convert to plain object
							customerId: customer._id,
							customerName: customer.name,
							customerEmail: customer.email,
							serviceId: service.serviceId,
							serviceName: service.serviceName,
							orderId: service.orderId,
						}))
					);
				}
			});
		});

		if (queries.length === 0) {
			return res.status(404).json({
				message: "No queries found for assigned services.",
			});
		}

		// Sort queries by creation date (newest first)
		queries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

		return res.status(200).json({
			success: true,
			count: queries.length,
			queries,
		});
	} catch (error) {
		console.error("Error fetching queries for employee:", error);
		res.status(500).json({
			success: false,
			message: "Server error.",
			error: error.message,
		});
	}
};

const replyToQuery = async (req, res) => {
	const { queryId, response, employeeId } = req.body;

	console.log("Received request to reply to query:", {
		queryId,
		response,
		employeeId,
	});

	try {
		const customer = await User.findOne({ "services.queries._id": queryId });
		console.log("Customer found:", customer);

		if (!customer) {
			console.error("Customer not found for query ID:", queryId);
			return res.status(404).json({ message: "Customer not found" });
		}

		const updatedCustomer = await User.updateOne(
			{ "services.queries._id": queryId },
			{
				$push: {
					"services.$.queries.$[query].replies": {
						employeeId,
						response,
						createdAt: new Date(),
					},
				},
				$set: {
					"services.$.queries.$[query].status": "responded",
					"services.$.queries.$[query].isReplied": true,
					"services.$.queries.$[query].isRead": true,
					"services.$.queries.$[query].lastRepliedAt": new Date()
				},
			},
			{
				arrayFilters: [{ "query._id": queryId }],
			}
		);

		console.log("Update operation result:", updatedCustomer);

		if (updatedCustomer.modifiedCount > 0) {
			console.log("Reply added successfully for query ID:", queryId);
			return res.json({ 
				success: true,
				message: "Reply added successfully",
				queryStatus: {
					status: "responded",
					isReplied: true,
					isRead: true
				}
			});
		} else {
			console.error("Failed to add the reply for query ID:", queryId);
			return res.status(500).json({ message: "Failed to add reply" });
		}
	} catch (err) {
		console.error("Error replying to query:", err);
		return res.status(500).json({ message: "Server error." });
	}
};

const updateEmployeeProfile = async (req, res) => {
	const { userId } = req.user;
	const updateFields = req.body;

	try {
		const user = await User.findById(userId);
		if (!user || user.role !== "employee") {
			return res
				.status(404)
				.json({ message: "Employee not found or invalid role" });
		}

		// Define all allowed fields for employee profile update
		const allowedFields = [
			// Basic Profile

			"fullName",
			"email",
			"phoneNumber",
			"dob",
			"gender",
			"dateOfJoining",
			"designation",
			"servicesHandled",
			"L1EmpCode",
			"L1Name",
			"L2EmpCode",
			"L2Name",
			"employeeStatus",
			"reasonForLeaving",
			"currentOrgRelieveDate",

			// Tax Info
			"pan",
			"gst",
			"tan",

			// Communication Info
			"fulladdress",
			"city",
			"state",
			"country",
			"postalCode",

			// Professional Info
			"positionCode",
			"positionDescription",
			"payrollArea",
			"departmentCode",
			"departmentName",

			// Employment Info
			"previousOrganization",
			"previousOrgFromDate",
			"previousOrgToDate",
			"totalExperience",

			// Education Info
			"educationQualification",
			"university",
			"passingMonthYear",
			"certifications",
		];

		// Update allowed fields
		allowedFields.forEach((field) => {
			if (updateFields[field] !== undefined) {
				user[field] = updateFields[field];
			}
		});

		// Check if the profile is complete
		const requiredFields = [
			"fullName",
			"email",
			"phoneNumber",
			"dateOfJoining",
			"designation",
			"L1EmpCode",
			"L1Name",
			"pan",
		];

		user.isProfileComplete = requiredFields.every((field) => user[field]);

		// Validate dates if provided
		const dateFields = [
			"dob",
			"dateOfJoining",
			"currentOrgRelieveDate",
			"previousOrgFromDate",
			"previousOrgToDate",
			"passingMonthYear",
		];

		dateFields.forEach((field) => {
			if (updateFields[field]) {
				try {
					user[field] = new Date(updateFields[field]);
				} catch (error) {
					console.error(`Invalid date format for ${field}`);
				}
			}
		});

		// Handle arrays
		if (
			updateFields.servicesHandled &&
			Array.isArray(updateFields.servicesHandled)
		) {
			user.servicesHandled = updateFields.servicesHandled;
		}

		await user.save();

		// Send success response with updated user data
		res.status(200).json({
			message: "Employee profile updated successfully",
			user: user.toObject({
				transform: (doc, ret) => {
					delete ret.passwordHash;
					delete ret.salt;
					return ret;
				},
			}),
		});
	} catch (error) {
		console.error("Error updating employee profile:", error);
		res.status(500).json({
			message: "Error updating employee profile",
			error: error.message,
		});
	}
};

// Get leads assigned to an employee
const getAssignedLeads = async (req, res) => {
	try {
		const employeeId = req.user._id;

		// Find all leads assigned to this employee
		const leads = await Lead.find({ assignedToEmployee: employeeId })
			.populate({
				path: "serviceId",
				select: "name description category packages",
			})
			.sort({ createdAt: -1 });

		res.status(200).json({
			success: true,
			leads,
		});
	} catch (error) {
		console.error("Error fetching assigned leads:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching assigned leads",
			error: error.message,
		});
	}
};

// Approve a lead (change status to accepted)
const approveLead = async (req, res) => {
	try {
		const employeeId = req.user._id;
		const { leadId } = req.params;

		// Find the lead and verify it's assigned to this employee
		const lead = await Lead.findOne({
			_id: leadId,
			assignedToEmployee: employeeId,
		});

		if (!lead) {
			return res.status(404).json({
				success: false,
				message: "Lead not found or not assigned to you",
			});
		}

		// Verify lead status is 'assigned'
		if (lead.status !== "assigned") {
			return res.status(400).json({
				success: false,
				message: `Cannot approve lead with status '${lead.status}'. Lead must be in 'assigned' status.`,
			});
		}

		// Update lead status to 'accepted' and set acceptedAt timestamp
		lead.status = "accepted";
		lead.acceptedAt = new Date();
		await lead.save();

		res.status(200).json({
			success: true,
			message: "Lead approved successfully",
			lead,
		});
	} catch (error) {
		console.error("Error approving lead:", error);
		res.status(500).json({
			success: false,
			message: "Error approving lead",
			error: error.message,
		});
	}
};

// Reject a lead (employee can reject an assigned lead)
const rejectLead = async (req, res) => {
	try {
		const employeeId = req.user._id;
		const { leadId } = req.params;
		const { reason } = req.body;

		// Validate reason is provided
		if (!reason) {
			return res.status(400).json({
				success: false,
				message: "Please provide a reason for rejecting the lead",
			});
		}

		// Find the lead and verify it's assigned to this employee
		const lead = await Lead.findOne({
			_id: leadId,
			assignedToEmployee: employeeId,
		});

		if (!lead) {
			return res.status(404).json({
				success: false,
				message: "Lead not found or not assigned to you",
			});
		}

		// Verify lead status is 'assigned'
		if (lead.status !== "assigned") {
			return res.status(400).json({
				success: false,
				message: `Cannot reject lead with status '${lead.status}'. Lead must be in 'assigned' status.`,
			});
		}

		// Update lead status to 'rejected' and set rejectedAt timestamp
		lead.status = "rejected";
		lead.rejectedAt = new Date();
		lead.rejectReason = reason;
		await lead.save();

		// Notify admin about rejection
		const admin = await User.findOne({ role: "admin" });
		if (admin && admin.email) {
			try {
				await sendZeptoMail({
					to: admin.email,
					subject: "Lead Rejected by Employee",
					html: `
						<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
							<div style="background: #ffebee; padding: 20px; border-radius: 5px 5px 0 0; border-left: 4px solid #e53935;">
								<h2 style="color: #e53935; margin: 0;">Lead Rejected</h2>
							</div>
							<div style="padding: 20px; background: #f8f9fa;">
								<p>A lead has been rejected by an employee. Please review the details below:</p>
								<h3 style="color: #2c3e50;">Lead Details</h3>
								<table style="width: 100%; border-collapse: collapse;">
									<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">ID:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${lead._id}</td></tr>
									<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Name:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${lead.name}</td></tr>
									<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Email:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${lead.email}</td></tr>
									<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Service:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${lead.serviceId && typeof lead.serviceId === 'object' ? lead.serviceId.name : (lead.serviceId || 'N/A')}</td></tr>
								</table>
								<div style="margin: 20px 0; background: #fff3e0; padding: 15px; border-radius: 5px; border-left: 4px solid #ffa726;">
									<p style="margin: 0;"><strong>Reason for rejection:</strong> ${reason}</p>
								</div>
								<p>Please review this lead in the admin dashboard.</p>
								<p style="margin-top: 30px; color: #888;">Best regards,<br>Finshelter Team</p>
							</div>
						</div>
					`
				});
			} catch (emailError) {
				console.error("Error sending lead rejection notification:", emailError);
				// Continue with the flow even if email fails
			}
		}

		res.status(200).json({
			success: true,
			message: "Lead rejected successfully",
			lead,
		});
	} catch (error) {
		console.error("Error rejecting lead:", error);
		res.status(500).json({
			success: false,
			message: "Error rejecting lead",
			error: error.message,
		});
	}
};

// Upload payment evidence and add notes to a lead
const uploadLeadDocuments = async (req, res) => {
	try {
		const employeeId = req.user._id;
		const { leadId } = req.params;
		const { note, paymentAmount, paymentMethod, paymentReference } = req.body;

		// Find the lead and verify it's assigned to this employee
		const lead = await Lead.findOne({
			_id: leadId,
			assignedToEmployee: employeeId,
		});

		if (!lead) {
			return res.status(404).json({
				success: false,
				message: "Lead not found or not assigned to you",
			});
		}

		// Verify lead status is 'accepted' (as documents are usually uploaded after accepting)
		if (lead.status !== "accepted") {
			return res.status(400).json({
				success: false,
				message: `Documents can only be uploaded for accepted leads (current status: ${lead.status})`,
			});
		}

		// Process uploaded files
		if (!req.files || req.files.length === 0) {
			return res.status(400).json({
				success: false,
				message: "No files uploaded",
			});
		}

		// Create upload directory if it doesn't exist
		const uploadDir = path.join("uploads", "leads", leadId);
		if (!fs.existsSync(uploadDir)) {
			fs.mkdirSync(uploadDir, { recursive: true });
		}

		// Process document uploads
		const documentRecords = await Promise.all(
			req.files.map(async (file) => {
				const newPath = path.join(uploadDir, file.filename);
				fs.renameSync(file.path, newPath);
				return {
					filename: file.filename,
					originalName: file.originalname,
					path: newPath,
					mimetype: file.mimetype,
					size: file.size,
					uploadedAt: new Date(),
					description: "Payment evidence",
				};
			})
		);

		// Add documents to lead
		lead.documents = lead.documents || [];
		lead.documents.push(...documentRecords);

		// Add employee note if provided
		if (note) {
			lead.employeeNotes = lead.employeeNotes || [];
			lead.employeeNotes.push({
				note,
				createdAt: new Date(),
			});
		}

		// Add payment details if provided
		if (paymentAmount || paymentMethod || paymentReference) {
			lead.paymentDetails = lead.paymentDetails || {};
			if (paymentAmount) lead.paymentDetails.amount = parseFloat(paymentAmount);
			if (paymentMethod) lead.paymentDetails.method = paymentMethod;
			if (paymentReference) lead.paymentDetails.reference = paymentReference;
			lead.paymentDetails.date = new Date();
			lead.paymentDetails.hasEvidence = true;
		}

		await lead.save();

		// Notify admin about document upload
		const admin = await User.findOne({ role: "admin" });
		if (admin && admin.email) {
			try {
				await sendZeptoMail({
					to: admin.email,
					subject: "Lead Documents Uploaded",
					html: `
						<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
							<div style="background: #e3f2fd; padding: 20px; border-radius: 5px 5px 0 0; border-left: 4px solid #2196f3;">
								<h2 style="color: #1565c0; margin: 0;">Lead Documents Uploaded</h2>
							</div>
							<div style="padding: 20px; background: #f8f9fa;">
								<p>Documents have been uploaded for a lead. Please review the details below:</p>
								<h3 style="color: #2c3e50;">Lead Details</h3>
								<table style="width: 100%; border-collapse: collapse;">
									<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">ID:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${lead._id}</td></tr>
									<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Name:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${lead.name}</td></tr>
									<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Email:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${lead.email}</td></tr>
									<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Service:</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${lead.serviceId && typeof lead.serviceId === 'object' ? lead.serviceId.name : (lead.serviceId || 'N/A')}</td></tr>
								</table>
								${note ? `<div style='margin:20px 0; background:#fff3e0; padding:15px; border-radius:5px; border-left:4px solid #ffa726;'><strong>Employee Note:</strong> ${note}</div>` : ''}
								<h3 style="color: #2c3e50; margin-top:25px;">Payment Details</h3>
								<ul style="padding-left:18px;">
									${paymentAmount ? `<li><strong>Amount:</strong> ₹${paymentAmount}</li>` : ''}
									${paymentMethod ? `<li><strong>Method:</strong> ${paymentMethod}</li>` : ''}
									${paymentReference ? `<li><strong>Reference:</strong> ${paymentReference}</li>` : ''}
								</ul>
								<p><strong>${documentRecords.length}</strong> document(s) uploaded. Please review this in the admin dashboard.</p>
								<p style="margin-top: 30px; color: #888;">Best regards,<br>Finshelter Team</p>
							</div>
						</div>
					`
				});
			} catch (emailError) {
				console.error("Error sending lead document upload notification:", emailError);
				// Continue with the flow even if email fails
			}
		}

		res.status(200).json({
			success: true,
			message: "Documents uploaded successfully",
			lead,
		});
	} catch (error) {
		console.error("Error uploading lead documents:", error);
		res.status(500).json({
			success: false,
			message: "Error uploading documents",
			error: error.message,
		});
	}
};

// Update service delay reason
const updateServiceDelayReason = async (req, res) => {
	try {
		const employeeId = req.user._id;
		const { serviceId, delayReason, customerId } = req.body;

		// Input validation
		if (!serviceId || !customerId) {
			return res
				.status(400)
				.json({ message: "Service ID and Customer ID are required" });
		}

		// Find the customer
		const customer = await User.findById(customerId);
		if (!customer) {
			return res.status(404).json({ message: "Customer not found" });
		}

		// Find the specific service in the customer's services array
		const serviceIndex = customer.services.findIndex(
			(service) => service._id.toString() === serviceId.toString()
		);

		if (serviceIndex === -1) {
			return res.status(404).json({ message: "Service not found" });
		}

		// Check if the service is assigned to this employee
		if (customer.services[serviceIndex].employeeId.toString() !== employeeId) {
			return res
				.status(403)
				.json({ message: "Not authorized to update this service" });
		}

		// Update the delay reason
		customer.services[serviceIndex].delayReason = delayReason;

		// Save the updated customer
		await customer.save();

		return res.status(200).json({
			message: "Service delay reason updated successfully",
			delayReason: delayReason,
		});
	} catch (error) {
		console.error("Error updating service delay reason:", error);
		return res.status(500).json({
			message: "Error updating service delay reason",
			error: error.message,
		});
	}
};

const sendOrderForL1Review = async (req, res) => {
	try {
		const { orderId } = req.body;
		const employeeId = req.user._id; // Get the employee ID from the authenticated user

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

		// Find the service index
		const serviceIndex = customer.services.findIndex(
			(service) => service.orderId === orderId
		);

		if (serviceIndex === -1) {
			return res.status(404).json({
				success: false,
				message: "Service not found",
			});
		}

		// Find the employee who is sending for review
		const employee = await User.findById(employeeId);
		if (!employee) {
			return res.status(400).json({
				success: false,
				message: "Employee not found",
			});
		}

		// Check for L1 employee assignment
		if (!employee.L1EmpCode) {
			return res.status(400).json({
				success: false,
				message:
					"No L1 employee assigned to you. Please contact your administrator.",
			});
		}

		// Update the service status to pending-l1-review
		customer.services[serviceIndex].status = "pending-l1-review";
		customer.services[serviceIndex].sentForReviewAt = new Date();
		customer.services[serviceIndex].employeeId = employeeId; // Store the employee who sent for review

		await customer.save();

		// Send email notification to L1 employee if possible
		try {
			const l1Employee = await User.findOne({ _id: employee.L1EmpCode });
			if (l1Employee && l1Employee.email) {
				await sendZeptoMail({
					to: l1Employee.email,
					subject: "New Order Review Request",
					html: `
						<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
							<div style="background: #e3f2fd; padding: 20px; border-radius: 5px 5px 0 0; border-left: 4px solid #2196f3;">
								<h2 style="color: #1565c0; margin: 0;">Order Requires L1 Review</h2>
							</div>
							<div style="padding: 20px; background: #f8f9fa;">
								<p>Hello ${l1Employee.name},</p>
								<p>A new order <strong>#${orderId}</strong> requires your review.</p>
								<p>Please check your dashboard for further details and next steps.</p>
								<div style="text-align: center; margin: 25px 0;">
									<a href="${process.env.FRONTEND_URL || 'https://your-app-url.com'}/employee/l1/review/${orderId}" style="display: inline-block; background: #2196f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: 500;">Review Order</a>
								</div>
								<p style="margin-top: 30px; color: #888;">Best regards,<br>Finshelter Team</p>
							</div>
						</div>
					`
				});
			}
		} catch (emailError) {
			console.error("Error sending email notification:", emailError);
			// Continue execution even if email fails
		}

		res.status(200).json({
			success: true,
			message: "Order sent for L1 review successfully",
		});
	} catch (error) {
		console.error("Error sending order for L1 review:", error);
		res.status(500).json({
			success: false,
			message: "Error sending order for L1 review",
			error: error.message,
		});
	}
};

// Add password reset functions
const forgotPassword = async (req, res) => {
	try {
		const { email } = req.body;

		if (!email) {
			return res.status(400).json({
				success: false,
				message: "Email is required",
			});
		}

		// Find the employee by email
		const employee = await User.findOne({ email: email, role: "employee" });
		if (!employee) {
			return res.status(404).json({
				success: false,
				message: "Employee with this email does not exist",
			});
		}

		// Generate a random reset token
		const resetToken = crypto.randomBytes(32).toString("hex");

		// Set token expiration (1 hour from now)
		const resetTokenExpiry = Date.now() + 3600000; // 1 hour in milliseconds

		// Update employee with reset token and expiry
		employee.resetPasswordToken = resetToken;
		employee.resetPasswordExpires = resetTokenExpiry;
		await employee.save();

		// Create reset URL (hardcoded frontend URL)
		// const resetUrl = `https://thefinshelter.com/employees/reset-password/${resetToken}`;

		const resetUrl = `https://thefinshelter.com/employees/reset-password/${resetToken}`;

		// Email content
		const subject = "Password Reset Request";
		const text = `You are receiving this email because you (or someone else) requested a password reset for your employee account.\n\n
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
                    <p>Hello ${employee.name},</p>
                    <p>You are receiving this email because you (or someone else) requested a password reset for your employee account.</p>
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
				to: employee.email,
				subject,
				html: htmlContent
			});
		} catch (emailError) {
			console.error("Error sending password reset email:", emailError);
			// Continue with the flow even if email fails
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

		if (!token) {
			console.log('No token provided in request');
			return res.status(400).json({
				success: false,
				message: "No token provided",
			});
		}

		console.log('Verifying token:', token);

		// Find employee with this token and check if it's expired
		const employee = await User.findOne({
			resetPasswordToken: token,
			resetPasswordExpires: { $gt: Date.now() },
			role: "employee",
		});

		if (!employee) {
			console.log('No employee found with this token or token expired');
			return res.status(400).json({
				success: false,
				message: "Password reset token is invalid or has expired",
			});
		}

		console.log('Token is valid for employee:', employee.email);

		// Token is valid
		res.status(200).json({
			success: true,
			message: "Token is valid",
			employeeId: employee._id,
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
 * Reset employee's password using the token
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

		// Find employee with this token and check if it's expired
		const employee = await User.findOne({
			resetPasswordToken: token,
			resetPasswordExpires: { $gt: Date.now() },
			role: "employee",
		});

		if (!employee) {
			return res.status(400).json({
				success: false,
				message: "Password reset token is invalid or has expired",
			});
		}

		// Generate new salt and hash the new password
		const salt = crypto.randomBytes(16).toString("hex");
		const hash = hashPassword(password, salt);

		// Update employee's password
		employee.passwordHash = hash;
		employee.salt = salt;
		
		// Clear reset token fields
		employee.resetPasswordToken = undefined;
		employee.resetPasswordExpires = undefined;
		
		await employee.save();

		res.status(200).json({
			success: true,
			message: "Password has been reset successfully. You can now log in with your new password.",
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

module.exports = {
	updateServiceStatus,
	getAssignedCustomers,
	employeeLogin,
	getQueriesForEmployee,
	replyToQuery,
	updateEmployeeProfile,
	getEmployeeDash,
	getAssignedLeads,
	approveLead,
	rejectLead,
	uploadLeadDocuments,
	updateServiceDelayReason,
	sendOrderForL1Review,
	forgotPassword,
	verifyResetToken,
	resetPassword,
};
