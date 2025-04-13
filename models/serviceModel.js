const mongoose = require("mongoose");
const { CustomObjectId } = require("../utils/idGenerator");

// Old Service Model - Commented out
/*
const serviceSchema = new mongoose.Schema(
	{
		_id: {
			type: String,
			required: true,
		}, 
		category: { type: String, required: true },
		name: { type: String, required: true },
		description: { type: String },
		actualPrice: { type: Number, required: true },
		salePrice: { type: Number, required: true },
		currency: { type: String, required: true },
		hsncode: { type: String, required: true },
		// dueDate: { type: Date, required: true },
		processingDays: {
			type: Number,
			required: true, 
			default: 7, // Default processing time in days
		},
		isActive: {
			type: Boolean,
			default: true, // Services are active by default
		},
		requiredDocuments: [
			{
				name: String,
				description: String,
				required: Boolean,
			},
		],
	},
	{ timestamps: true }
);

// Middleware: Generate _id with "SER" prefix before validation
serviceSchema.pre("validate", async function (next) {
	if (!this._id) {
		this._id = await CustomObjectId.generate("SER");
	}
	next();
});
module.exports = mongoose.model("Service", serviceSchema);
*/

// Updated Service Model with Packages
const packageSchema = new mongoose.Schema({
	name: { type: String },
	description: { type: String },
	actualPrice: { type: Number },
	salePrice: { type: Number },
	features: [{ type: String }],
	processingDays: {
		type: Number,
		default: 7,
	},
});

const serviceSchema = new mongoose.Schema(
	{
		_id: {
			type: String,
			required: true, 
		},
		category: { type: String, required: true },
		name: { type: String, required: true },
		description: { type: String },
		hsncode: { type: String, required: true },
		currency: { type: String, default: "INR" },
		gstRate: { 
			type: Number, 
			default: 18, // Default GST rate is 18%
			min: 0,
			max: 100
		},
		isActive: {
			type: Boolean,
			default: true, // Services are active by default
		},
		hasStaticPage: {
			type: Boolean,
			default: false, // By default, services don't have a static page
		}, 
		packages: [packageSchema],
		requiredDocuments: [
			{
				name: String,
				description: String,
				required: Boolean,
			},
		],
	},
	{ timestamps: true }
);

serviceSchema.pre("validate", async function (next) {
	if (!this._id) {
		this._id = await CustomObjectId.generate("SER");
	}
	next();
});

module.exports = mongoose.model("Service", serviceSchema);
