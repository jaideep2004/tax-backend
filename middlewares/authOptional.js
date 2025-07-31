const jwt = require("jsonwebtoken");

// Optional authentication middleware: sets req.user if token is valid, else continues as guest
module.exports = function (req, res, next) {
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = {
                userId: decoded._id || decoded.userId,
                _id: decoded._id || decoded.userId,
                role: decoded.role,
                name: decoded.name || "Unknown"
            };
        } catch (e) {
            // Ignore invalid token, treat as guest
        }
    }
    next();
};
