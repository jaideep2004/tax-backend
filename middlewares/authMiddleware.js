const jwt = require("jsonwebtoken");

// Custom error messages for different JWT errors
const JWT_ERROR_MESSAGES = {
    TokenExpiredError: "Token has expired",
    JsonWebTokenError: "Invalid token",
    NotBeforeError: "Token not active",
    default: "Authentication failed" 
};

// Utility function to handle token verification
const verifyToken = (token, secret) => {
    try {
        return jwt.verify(token, secret);
    } catch (error) {
        // Convert JWT errors to a standardized format
        const errorMessage = JWT_ERROR_MESSAGES[error.name] || JWT_ERROR_MESSAGES.default;
        throw new Error(errorMessage);
    }
};

const authMiddleware = (req, res, next) => {
    try {
        // Extract token
        const authHeader = req.header("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Access Denied. Invalid authorization header."
            });
        }

        const token = authHeader.replace("Bearer ", "");
        
        // Verify token
        const decoded = verifyToken(token, process.env.JWT_SECRET);

        // Support both token formats (userId or _id)
        const id = decoded._id || decoded.userId;
        const role = decoded.role;

        // Validate token structure
        if (!id || !role) {
            return res.status(401).json({
                success: false, 
                message: "Access Denied. Invalid token structure."
            });
        }

        // Attach user info to request
        req.user = {
            userId: id,
            _id: id,
            role: role,
            name: decoded.name || "Unknown"
        };

        next();
    } catch (error) {
        // Only log errors that aren't related to expired tokens or malformed/invalid tokens
        // Remove console.error statement for token expiration since these are expected when sessions time out
        // This change maintains the same logic but removes the noisy console logs
        
        return res.status(401).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = authMiddleware;