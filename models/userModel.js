const mongoose = require("mongoose");
const { CustomObjectId } = require("../utils/idGenerator");

// Consolidated schema definitions
const documentSchema = new mongoose.Schema({
	filename: { type: String, required: true },
	originalName: { type: String, required: true },
	path: { type: String, required: true },
	mimetype: { type: String, required: true },
	size: { type: Number, required: true },
	uploadedAt: { type: Date, default: Date.now },
});

const querySchema = new mongoose.Schema({
	query: { type: String, required: true },
	status: {
		type: String,
		enum: ["pending", "responded", "resolved"],
		default: "pending",
	},
	replies: [
		{
			employeeId: { type: String, ref: "User" },
			response: { type: String, required: true },
			createdAt: { type: Date, default: Date.now },
		},
	],
	attachments: [
		{
			filePath: { type: String, required: true },
			originalName: { type: String, required: true },
		},
	],
	createdAt: { type: Date, default: Date.now },
});

// Define the customer service schema
const customerServiceSchema = new mongoose.Schema({
	orderId: { type: String },
	serviceId: { type: String, ref: "Service", index: true },
	activated: { type: Boolean, default: true },
	purchasedAt: { type: Date, default: Date.now },
	employeeId: { type: String, ref: "User", index: true },
	status: { type: String, default: "In Process" },
	dueDate: { type: Date },
	documents: [documentSchema],
	queries: [querySchema],
	feedback: [
		{
			feedback: String,
			rating: Number,
			createdAt: { type: Date, default: Date.now },
		},
	],
});

// Define schema for payment history
const paymentHistorySchema = new mongoose.Schema({
	paymentId: { type: String },
	amount: { type: Number },
	date: { type: Date, default: Date.now },
	status: { type: String, enum: ["success", "failed", "pending"] },
	paymentMethod: { type: String },
});

// Define the assigned customer schema (embedded document)
const assignedCustomerSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	name: { type: String, required: true },
	email: { type: String, required: true },
	mobile: { type: Number },
	username: { type: String },
	role: { type: String, required: true },
	isActive: { type: Boolean },
	isProfileComplete: { type: Boolean },
	services: [customerServiceSchema],
	paymentHistory: [paymentHistorySchema],
	// Add other customer-specific fields as needed
	mobile: Number,
	dob: Date,
	gender: String,
	pan: String,
	gst: String,
	address: String,
	city: String,
	state: String,
	country: String,
	postalCode: Number,
	natureEmployment: String,
	annualIncome: String,
	education: String,
	certifications: String,
	institute: String,
	completionDate: Date,
	activeFrom: Date,
	activeTill: Date,
	customerCreateDate: Date,
});

// Customer fields configuration
const customerFields = {
	mobile: { type: Number },
	dob: { type: Date },
	gender: { type: String },
	pan: { type: String },
	gst: { type: String },
	address: { type: String },
	city: { type: String },
	state: { type: String },
	country: { type: String },
	postalCode: { type: Number },
	natureEmployment: { type: String },
	annualIncome: { type: String },
	education: { type: String },
	certifications: { type: String },
	institute: { type: String },
	completionDate: { type: Date },
	activeFrom: { type: Date },
	activeTill: { type: Date },
	customerCreateDate: { type: Date },
};

// Employee fields configuration

const employeeFields = {
	// Existing fields
	L1EmpCode: { type: String },
	L1Name: { type: String },
	L2EmpCode: { type: String },
	L2Name: { type: String },
	Lminus1code: { type: String },
	fullName: { type: String },
	phoneNumber: { type: Number },
	dateOfJoining: { type: Date },
	designation: { type: String },
	// servicesHandled: [
	// 	{
	// 		serviceId: { type: String, required: true },
	// 		serviceName: { type: String, required: true },
	// 		category: { type: String, required: true },
	// 	},
	// ],
	employeeStatus: { type: String },
	reasonForLeaving: { type: String },
	currentOrgRelieveDate: { type: Date },

	// Existing fields from before
	departmentCode: { type: String },
	departmentName: { type: String },
	positionCode: { type: String },
	positionDescription: { type: String },
	payrollArea: { type: String },
	dob: { type: Date },
	gender: { type: String },
	pan: { type: String },
	gst: { type: String },
	tan: { type: String },
	fulladdress: { type: String },
	city: { type: String },
	state: { type: String },
	country: { type: String },
	postalCode: { type: Number },

	// Additional new fields
	previousOrganization: { type: String },
	previousOrgFromDate: { type: Date },
	previousOrgToDate: { type: Date },
	totalExperience: { type: String },
	educationQualification: { type: String },
	university: { type: String },
	passingMonthYear: { type: Date },
	certifications: { type: String },
};

const managerFields = {
	// Most manager fields will be similar to employee fields
	L1EmpCode: { type: String },
	L1Name: { type: String },
	L2EmpCode: { type: String },
	L2Name: { type: String },

	fullName: { type: String },
	phoneNumber: { type: Number },
	dateOfJoining: { type: Date },
	designation: { type: String },
	servicesHandled: [{ type: String }],
	managerStatus: { type: String },
	reasonForLeaving: { type: String },
	currentOrgRelieveDate: { type: Date },

	// departmentCode: { type: String },
	departmentName: { type: String },
	positionCode: { type: String },
	positionDescription: { type: String },
	payrollArea: { type: String },
	dob: { type: Date },
	gender: { type: String },
	pan: { type: String },
	gst: { type: String },
	tan: { type: String },
	fulladdress: { type: String },
	city: { type: String },
	state: { type: String },
	country: { type: String },
	postalCode: { type: Number },

	previousOrganization: { type: String },
	previousOrgFromDate: { type: Date },
	previousOrgToDate: { type: Date },
	totalExperience: { type: String },
	educationQualification: { type: String },
	university: { type: String },
	passingMonthYear: { type: Date },
	certifications: { type: String },
};

const bankDetailsSchema = new mongoose.Schema({
	accountNumber: { type: String, required: true },
	accountHolderName: { type: String, required: true },
	bankName: { type: String, required: true },
	ifscCode: { type: String, required: true },
	accountType: { type: String, enum: ["savings", "current"], required: true },
	lastUpdated: { type: Date, default: Date.now },
});

// Main user schema
const userSchema = new mongoose.Schema(
	{
		_id: {
			type: String,
			required: true,
		},
		// Common fields for all users
		name: { type: String, required: true },
		lastname: { type: String },
		email: { type: String, required: true, unique: true },
		username: { type: String },
		passwordHash: { type: String, required: true },
		salt: { type: String, required: true },
		role: {
			type: String,
			enum: ["admin", "manager", "employee", "customer"],
			required: true,
		},
		isActive: { type: Boolean, default: false },
		isProfileComplete: { type: Boolean, default: false },

		// Role-specific fields
		...customerFields,
		...employeeFields,
		...managerFields, // Add manager fields to the schema

		assignedEmployees: [{ type: String, ref: "User" }],
		assignedCustomers: [assignedCustomerSchema], // Now stores complete customer objects

		// Service and payment related fields
		serviceId: { type: String, ref: "Service" },
		services: [customerServiceSchema],
		paymentHistory: [paymentHistorySchema],

		// Referral fields
		referralCode: { type: String, unique: true, default: null, sparse: true },
		referredUsers: [{ type: String, ref: "User" }],
		referredBy: { type: String, ref: "User" },
		downloadAccess: {
			type: Boolean,
			default: false,
		},
		bankDetails: bankDetailsSchema,
		serviceInterest: {
			type: String,
			ref: "Service",
			default: null,
		},
		leadSource: {
			type: String,
			enum: ["flexfunneli", "website", "referral", "other"],
			default: "website",
		},
	},
	{ timestamps: true }
);

// Middleware to generate _id based on role
userSchema.pre("validate", async function (next) {
	if (!this._id) {
		const prefixMap = {
			admin: "ADM",
			manager: "EMP",
			employee: "EMP",
			customer: "CUS",
		};
		this._id = await CustomObjectId.generate(prefixMap[this.role] || "USR");
	}
	next();
});

// Middleware to manage active status dates
userSchema.pre("save", function (next) {
	if (this.isModified("isActive")) {
		if (this.isActive) {
			this.activeFrom = new Date();
			this.activeTill = null;
		} else {
			this.activeTill = new Date();
		}
	}
	next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
