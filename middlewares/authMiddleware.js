// const jwt = require("jsonwebtoken");

// const authMiddleware = (req, res, next) => {
// 	try {
// 		// Extract the token from the Authorization header
// 		const token = req.header("Authorization")?.replace("Bearer ", "");

// 		if (!token) {
// 			return res
// 				.status(401)
// 				.json({ message: "Access Denied. No token provided." });
// 		}

// 		// Verify the token
// 		const decoded = jwt.verify(token, process.env.JWT_SECRET);

// 		// Ensure the role and other required fields are present
// 		if (!decoded._id || !decoded.role) {
// 			return res.status(400).json({ message: "Invalid token structure." });
// 		}

// 		// Attach the decoded user information to the request
// 		req.user = {
// 			userId: decoded._id, // Add this line to match what the controller expects
// 			_id: decoded._id,
// 			role: decoded.role,
// 			name: decoded.name || "Unknown",
// 		};

// 		next(); // Proceed to the next middleware or route handler
// 	} catch (error) {
// 		console.error("Authentication Error:", error);
// 		res
// 			.status(400)
// 			.json({ message: "Invalid or expired token.", error: error.message });
// 	}
// };

// module.exports = authMiddleware;

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

        // Validate token structure
        if (!decoded._id || !decoded.role) {
            return res.status(401).json({
                success: false, 
                message: "Access Denied. Invalid token structure."
            });
        }

        // Attach user info to request
        req.user = {
            userId: decoded._id,
            _id: decoded._id,
            role: decoded.role,
            name: decoded.name || "Unknown"
        };

        next();
    } catch (error) {
        // Only log errors that aren't related to malformed/invalid tokens
        if (!error.message.includes("Invalid token")) {
            console.error("Unexpected authentication error:", {
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }

        return res.status(401).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = authMiddleware;