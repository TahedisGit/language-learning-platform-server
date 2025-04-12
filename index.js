const express = require("express");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the "uploads" folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/resources", express.static(path.join(__dirname, "resources")));

// Middleware
app.use(cors());
app.use(express.json());

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "./uploads";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir); // create folder if not exists
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.olgdgso.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let usersCollection;
let packagesCollection;
let bundlesCollection;

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    // Assign to global variable
    const database = client.db("language-learning-platform");
    usersCollection = database.collection("users");
    packagesCollection = database.collection("packages");
    bundlesCollection = database.collection("bundles");

    // Registration route with file upload
    app.post("/register", upload.single("photo"), async (req, res) => {
      try {
        const {
          name,
          phone,
          email,
          dateOfBirth,
          address,
          gender,
          password,
          confirm_password,
        } = req.body;
        const photo = req.file ? `/uploads/${req.file.filename}` : null;

        if (password !== confirm_password) {
          return res.status(400).json({ message: "Passwords do not match!" });
        }

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists!" });
        }

        const userData = {
          name,
          phone,
          email,
          dateOfBirth,
          address,
          gender,
          password,
          photoURL: photo, // Save photoURL in MongoDB
        };

        const result = await usersCollection.insertOne(userData);
        res.status(201).json({
          message: "User registered successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
      }
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

// admin login route
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (email === adminEmail && password === adminPassword) {
    return res.status(200).json({ success: true }); // Changed to success
  } else {
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" }); // Changed to success
  }
});

// Profile route
app.get("/profile", async (req, res) => {
  try {
    const { email } = req.query;
    console.log("Received Email:", email);

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return photoURL with full path
    const photoURL = user.photoURL || null;

    res.status(200).json({
      name: user.name,
      email: user.email,
      photoURL: photoURL, // Serve full path to photo
      phone: user.phone,
      address: user.address,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Edit Profile route
app.put("/profile/update", upload.single("photo"), async (req, res) => {
  const { email, ...updateData } = req.body;

  if (req.file) {
    updateData.photoURL = `/uploads/${req.file.filename}`;
  }
  delete updateData._id;

  if (!email) {
    return res.status(400).send("Email is required");
  }
  console.log("Update Data:", updateData);

  try {
    const result = await usersCollection.updateOne(
      { email },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No changes made" });
    }

    res
      .status(200)
      .json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).send({ success: false, message: "Server error" });
  }
});

// updata Password
app.put("/update-password", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res
      .status(400)
      .json({ message: "Email and new password are required." });
  }

  try {
    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    const result = await usersCollection.updateOne(
      { email },
      { $set: { password: newPassword } }
    );

    if (result.modifiedCount > 0) {
      res.status(200).json({ message: "Password updated successfully!" });
    } else {
      res.status(400).json({ message: "Password update failed!" });
    }
  } catch (error) {
    console.error("Password update error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

// Get all packages route
app.get("/get-all-packages", async (req, res) => {
  try {
    const packages = await packagesCollection.find({}).toArray();
    res.status(200).json(packages);
  } catch (error) {
    console.error("Error fetching packages:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all bundles route
app.get("/get-all-bundles", async (req, res) => {
  try {
    const bundles = await bundlesCollection.find({}).toArray();
    res.status(200).json(bundles);
  } catch (error) {
    console.error("Error fetching bundles:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Start the Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
app.get("/", (req, res) => {
  res.send("🚀 Backend is live!");
});
