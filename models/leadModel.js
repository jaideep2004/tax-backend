const mongoose = require("mongoose");
const { CustomObjectId } = require("../utils/idGenerator");

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
      enum: ["new", "assigned", "accepted", "declined", "converted"], 
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
    declineReason: { 
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