const mongoose = require("mongoose");
const { CustomObjectId } = require("../utils/idGenerator");

// Document upload schema
const leadDocumentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
  description: { type: String }, 
});

const leadSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    name: { 
      type: String, 
      required: true 
    },
    email: { 
      type: String, 
      required: true 
    },
    mobile: { 
      type: String, 
      required: true 
    },
    serviceId: { 
      type: String, 
      ref: "Service", 
      required: true 
    },
    message: { 
      type: String 
    },
    status: { 
      type: String, 
      enum: ["new", "assigned", "accepted", "declined", "converted", "rejected"], 
      default: "new" 
    },
    assignedToEmployee: { 
      type: String, 
      ref: "User", 
      default: null 
    },
    assignedAt: { 
      type: Date 
    },
    acceptedAt: { 
      type: Date 
    },
    declinedAt: { 
      type: Date 
    },
    rejectedAt: {
      type: Date
    },
    declineReason: { 
      type: String 
    },
    rejectReason: {
      type: String
    },
    convertedToOrderId: { 
      type: String, 
      default: null 
    },
    convertedAt: { 
      type: Date 
    },
    source: { 
      type: String, 
      enum: ["website", "flexfunneli", "referral", "other"], 
      default: "website" 
    },
    notes: { 
      type: String 
    },
    // New fields
    adminNote: {
      type: String
    },
    employeeNotes: [{
      note: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    }],
    documents: [leadDocumentSchema],
    sentBackAt: {
      type: Date
    },
    paymentDetails: {
      amount: { type: Number },
      method: { type: String },
      reference: { type: String },
      date: { type: Date },
      hasEvidence: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

// Generate ID with "LEAD" prefix
leadSchema.pre("validate", async function (next) {
  if (!this._id) {
    this._id = await CustomObjectId.generate("LEAD");
  }
  next();
});

module.exports = mongoose.model("Lead", leadSchema); 