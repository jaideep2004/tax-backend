require("dotenv").config();
const User = require("../models/userModel");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
	service: "gmail", // Use your email service provider
	auth: {
		user: process.env.EMAIL_USER, // Your email address
		pass: process.env.EMAIL_PASS, // Your email app-specific password
	},
});

const sendZeptoMail = require("./sendZeptoMail");

// Wrapper to support both html and text
const sendZeptoMailWrapper = async ({ to, subject, text, html }) => {
	try {
		await sendZeptoMail({
			to,
			subject,
			html: html || `<pre>${text}</pre>`
		});
		console.log(`ZeptoMail sent to ${to}`);
	} catch (error) {
		console.error(`Failed to send ZeptoMail to ${to}:`, error);
	}
};

// For compatibility, you may export sendZeptoMail as sendEmail if needed
module.exports = {
	sendZeptoMail: sendZeptoMailWrapper,
	// sendEmail: sendZeptoMailWrapper // Uncomment if you want to alias
};

// Utility function to handle customer-employee assignments
const handleCustomerEmployeeAssignment = async (
	customer,
	serviceId,
	employee = null
) => {
	try {
		// If no employee provided, try to find one for this service
		if (!employee) {
			employee = await User.findOne({
				role: "employee",
				servicesHandled: { $in: [serviceId] }, // Look for serviceId in the servicesHandled array
				isActive: true, // Make sure the employee is active
			});
		}

		if (!employee) {
			return { success: false, message: "No employee available" };
		}

		// Find the service in customer's services array
		const serviceIndex = customer.services.findIndex(
			(service) => service.serviceId.toString() === serviceId.toString()
		);

		if (serviceIndex === -1) {
			return { success: false, message: "Service not found for customer" };
		}

		// Update customer's service with employee
		customer.services[serviceIndex].employeeId = employee._id;
		await customer.save();

		// Get the full customer object to store
		const customerToStore = {
			_id: customer._id,
			name: customer.name,
			email: customer.email,
			mobile: customer.mobile,
			username: customer.username,
			role: customer.role,
			isActive: customer.isActive,
			isProfileComplete: customer.isProfileComplete,
			services: customer.services.map((service) => ({
				orderId: service.orderId,
				serviceId: service.serviceId,
				activated: service.activated,
				purchasedAt: service.purchasedAt,
				status: service.status,
				dueDate: service.dueDate,
				documents: service.documents,
				queries: service.queries,
				feedback: service.feedback,
				employeeId: service.employeeId,
			})),
			paymentHistory: customer.paymentHistory,
		};

		// Check if customer already exists in employee's assigned customers
		const existingCustomerIndex = employee.assignedCustomers.findIndex(
			(assigned) => assigned._id.toString() === customer._id.toString()
		);

		if (existingCustomerIndex === -1) {
			// Add new customer object to employee's assigned customers
			employee.assignedCustomers.push(customerToStore);
		} else {
			// Update existing customer object
			employee.assignedCustomers[existingCustomerIndex] = customerToStore;
		}

		await employee.save();

		// Send notification emails using ZeptoMail
		await Promise.all([
			sendZeptoMail({
				to: customer.email,
				subject: "Employee Assigned",
				html: `
					<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;'>
						<div style='background: #e3f2fd; padding: 20px; border-radius: 5px 5px 0 0; border-left: 4px solid #2196f3;'>
							<h2 style='color: #1565c0; margin: 0;'>Employee Assigned</h2>
						</div>
						<div style='padding: 20px; background: #f8f9fa;'>
							<p>Hello ${customer.name},</p>
							<p>An employee has been assigned to assist you with your service.</p>
							<ul style='padding-left:18px;'>
								<li><strong>Employee Name:</strong> ${employee.name}</li>
								<li><strong>Employee Email:</strong> ${employee.email}</li>
							</ul>
							<p style='margin-top: 30px; color: #888;'>Best regards,<br>Finshelter Team</p>
						</div>
					</div>
				`
			}),
			sendZeptoMail({
				to: employee.email,
				subject: "New Customer Assigned",
				html: `
					<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;'>
						<div style='background: #e3f2fd; padding: 20px; border-radius: 5px 5px 0 0; border-left: 4px solid #2196f3;'>
							<h2 style='color: #1565c0; margin: 0;'>New Customer Assigned</h2>
						</div>
						<div style='padding: 20px; background: #f8f9fa;'>
							<p>Hello ${employee.name},</p>
							<p>A new customer has been assigned to you.</p>
							<ul style='padding-left:18px;'>
								<li><strong>Customer Name:</strong> ${customer.name}</li>
								<li><strong>Customer Email:</strong> ${customer.email}</li>
							</ul>
							<p style='margin-top: 30px; color: #888;'>Best regards,<br>Finshelter Team</p>
						</div>
					</div>
				`
			})
		]);

		return { success: true, employee };
	} catch (error) {
		console.error("Error in handleCustomerEmployeeAssignment:", error);
		return { success: false, message: error.message };
	}
};

// Function to reassign unassigned customers for a service
const assignUnassignedCustomers = async (serviceId, employee) => {
	try {
		const unassignedCustomers = await User.find({
			role: "customer",
			services: {
				$elemMatch: {
					serviceId: serviceId,
					employeeId: { $exists: false },
				},
			},
		});

		const assignments = [];
		for (const customer of unassignedCustomers) {
			const result = await handleCustomerEmployeeAssignment(
				customer,
				serviceId,
				employee
			);
			assignments.push({
				customer: {
					_id: customer._id,
					name: customer.name,
					email: customer.email,
					services: customer.services,
				},
				success: result.success,
				message: result.success ? "Assigned successfully" : result.message,
			});
		}

		return assignments;
	} catch (error) {
		console.error("Error in assignUnassignedCustomers:", error);
		throw error;
	}
};

module.exports = {
	handleCustomerEmployeeAssignment,
	assignUnassignedCustomers,
};
