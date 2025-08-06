const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/userModel'); // Adjust the path based on your project structure
const crypto = require('crypto'); // Import the crypto module

dotenv.config();

// Function to hash the password and create salt
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex'); // Generate a salt
  const hash = crypto.createHmac('sha256', salt); // Use HMAC with salt
  hash.update(password);
  const passwordHash = hash.digest('hex'); // Get hashed password
  return { salt, passwordHash };
};

// Connect to MongoDB 
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('Database connected successfully');
    createAdminUser(); // Call the function to create an admin user
  })
  .catch((error) => {
    console.error('Database connection error:', error);
    process.exit(1);
  });

// Function to create an admin user
const createAdminUser = async () => {
  const email = 'rkiran352@gmail.com'; // Set the admin email
  const password = 'admin@1ZNu!>9z'; // Set the admin password
  const role = 'admin'; // Set the role as admin
  const name = 'Admin User'; // Add name for the admin

  try {
    // Check if the admin already exists
    const adminExists = await User.findOne({ email });
    if (adminExists) {
      console.log('Admin user already exists.');
      process.exit(); // Exit the process if admin already exists
    }

    // Hash the password using the custom method
    const { salt, passwordHash } = hashPassword(password);
    console.log('Password hashed successfully:', passwordHash);

    // Create the admin user
    const newAdmin = new User({
      email,
      passwordHash, // Store hashed password
      salt, // Store salt
      role,
      name, // Add the name field
    });

    // Save the new admin user to the database
    await newAdmin.save();
    console.log('Admin user created successfully:', newAdmin);
    process.exit(); // Exit the process after successful creation
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1); // Exit the process with error status
  } 
};
