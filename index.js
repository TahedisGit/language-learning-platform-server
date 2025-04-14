const express = require("express");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from folders
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/resources", express.static(path.join(__dirname, "resources")));

// Multer for profile storage
const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "./uploads";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir); // create folder if not exists
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const uploadProfile = multer({
  storage: profileStorage,
  // limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Multer for question storage
const questionStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const type = req.body.type;
    const subFolder = type === "reading" ? "reading" : "listening";
    const dir = `./resources/${subFolder}`;

    if (!fs.existsSync("./resources")) fs.mkdirSync("./resources");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const uploadQuestion = multer({ storage: questionStorage });

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
let studentCollection;
let faqCollection;

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    // Assign to global variable
    const database = client.db("language-learning-platform");
    usersCollection = database.collection("users");
    packagesCollection = database.collection("packages");
    bundlesCollection = database.collection("bundles");
    studentCollection = database.collection("exam-history");
    faqCollection = database.collection("faqs");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

// Registration route
app.post("/register", uploadProfile.single("photo"), async (req, res) => {
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

    // console.log("User Data:", user);

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
app.put("/profile/update", uploadProfile.single("photo"), async (req, res) => {
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

// Add new package route
app.post("/add-package", uploadQuestion.any(), async (req, res) => {
  // console.log("files", req.files);
  try {
    // add image URL to each question
    const imageBasedQuestions = req.body.questions.filter(
      (item) => item.subType === "image-based"
    );
    imageBasedQuestions.map((item, idx) => {
      item.imageUrl = `/resources/${item.type}/${req.files[idx].filename}`;
      req.body.questions.find((ques) => ques.id === item.id).imageUrl =
        item.imageUrl;
    });
    // console.log(" imageBasedQuestions", req.body.questions);

    // add audio URL to each question
    const listeningQuestions = req.body.questions.filter(
      (item) => item.type === "listening"
    );
    listeningQuestions.map((item, idx) => {
      item.audioUrl = `/resources/${item.type}/${req.files[idx].filename}`;
      req.body.questions.find((ques) => ques.id === item.id).audioUrl =
        item.audioUrl;
    });
    // console.log(" listeningQuestions", listeningQuestions);

    const packages = await packagesCollection.findOne({});
    if (!packages) {
      return res.status(404).json({ message: "No packages found!" });
    }

    // update the package to the database
    const result = await packagesCollection.updateOne(
      { _id: new ObjectId(packages._id) },
      { $push: { packages: req.body } }
    );
    if (result.modifiedCount > 0) {
      res.status(200).json({ message: "Package added successfully!" });
    } else {
      res.status(400).json({ message: "Failed to add package!" });
    }
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Something went wrong" });
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

// get exam history route
app.get("/get-exam-history", async (req, res) => {
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(400).json({ message: "Missing studentId in query" });
  }

  try {
    const studentData = await studentCollection.findOne({
      student_id: studentId,
    });

    if (!studentData) {
      return res.json({
        student_id: studentId,
        exams: [],
      });
    }

    res.json(studentData);
  } catch (error) {
    console.error("Failed to fetch user dashboard data:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Route to handle exam submission
app.post("/submit-exam", async (req, res) => {
  const examData = req.body;

  if (!examData?.student_id || !examData?.exam_id) {
    return res.status(400).json({ message: "Missing student_id or exam_id" });
  }

  try {
    const existingStudent = await studentCollection.findOne({
      student_id: examData.student_id,
    });

    if (existingStudent) {
      // Student already exists → Push new exam to exams array
      const result = await studentCollection.updateOne(
        { student_id: examData.student_id },
        {
          $push: {
            exams: {
              exam_id: examData.exam_id,
              package_id: examData.package_id,
              package_name: examData.package_name,
              total_questions: examData.total_questions,
              total_correct_answers: examData.total_correct_answers,
              time_taken: examData.time_taken,
              score: examData.score,
              date: examData.date,
              status: examData.status,
            },
          },
        }
      );
      res.json({ message: "Exam added to existing student", result });
    } else {
      // First time exam → Create new student document
      const newStudent = {
        student_id: examData.student_id,
        exams: [
          {
            exam_id: examData.exam_id,
            package_id: examData.package_id,
            package_name: examData.package_name,
            total_questions: examData.total_questions,
            total_correct_answers: examData.total_correct_answers,
            time_taken: examData.time_taken,
            score: examData.score,
            date: examData.date,
            status: examData.status,
          },
        ],
      };

      const result = await studentCollection.insertOne(newStudent);
      res.json({ message: "New student created and exam saved", result });
    }
  } catch (error) {
    console.error("Error submitting exam:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all FAQs
app.get("/get-faqs", async (req, res) => {
  try {
    const faqs = await faqCollection.find().toArray();
    res.status(200).json(faqs);
  } catch (err) {
    console.error("Error fetching FAQs:", err);
    res.status(500).json({ message: "Failed to fetch FAQs" });
  }
});

// Start the Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Test route
app.get("/", (req, res) => {
  res.send("🚀 Backend is live!");
});
