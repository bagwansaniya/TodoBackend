require("dotenv").config(); // Add this at the top

const express = require("express");
const JWT = require("jsonwebtoken");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const salt = 11;
const secretKey = process.env.JWT_SECRET; // Use .env value
const app = express();
const port = process.env.PORT || 8625; // Use .env value
const cors = require("cors");

// Middleware for parsing JSON bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

const urlconn =
  "mysql://root:XjFySZQGiXRqiCzqrAgCMLaECRRKQftj@mysql.railway.internal:3306/railway"; //
// Set up MySQL connection using .env values
const db = mysql.createConnection(urlconn);

// Connect to the database
db.connect((err) => {
  if (err) throw err;
  console.log("Connected to MySQL database");
});

// Register new user API
app.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  // Check if all fields are provided
  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // Check if the user already exists
  const checkUserQuery = "SELECT * FROM users WHERE email = ?";
  db.query(checkUserQuery, [email], (err, result) => {
    if (err) return res.status(500).json({ error: "Database query error" });
    if (result.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }
    const securePass = bcrypt.hashSync(password, salt);
    // Insert new user into the database
    const insertUserQuery =
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
    db.query(insertUserQuery, [name, email, securePass], (err, result) => {
      if (err) return res.status(500).json({ error: "Database insert error" });

      res.status(201).json({ msg: "User registered successfully" });
    });
  });
});

// Login API
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Check if the user exists
  const getUserQuery = "SELECT * FROM users WHERE email = ? ";
  db.query(getUserQuery, [email], (err, result) => {
    if (err) return res.status(500).json({ error: "Database query error" });

    if (result.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = result[0];
    const isSecurePass = bcrypt.compareSync(password, user.password);
    if (!isSecurePass) {
      return res.json({ err: "Password is not valid" });
    }

    // Sign the JWT token with user data
    const token = JWT.sign({ id: user.id, email: user.email }, secretKey, {
      expiresIn: 300,
    });
    res.json({ token });
  });
});

// Profile route to verify token
app.post("/profile", verifyByToken, (req, res) => {
  JWT.verify(res.token, secretKey, (err, success) => {
    if (err) {
      return res.status(403).json({ error: "Token is not valid" });
    }
    res.json({ success, msg: "Token is valid" });
  });
});

// Middleware to verify token
function verifyByToken(req, res, next) {
  const header = req.headers["authorization"];
  if (typeof header !== "undefined") {
    res.token = header;
    next();
  } else {
    res.status(403).json({ error: "Token is required" });
  }
}

// Get all tasks
app.get("/tasks", (req, res) => {
  const sqlQuery = "SELECT * FROM tasks ORDER BY position ASC";
  db.query(sqlQuery, (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(result);
    }
  });
});

// Add a new task
app.post("/tasks", (req, res) => {
  const { task } = req.body;
  const sqlQuery = "INSERT INTO tasks (task, completed) VALUES (?, false)";
  db.query(sqlQuery, [task], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json({ message: "Task added successfully", taskId: result.insertId });
    }
  });
});

// Delete a task
app.delete("/tasks/:id", (req, res) => {
  const { id } = req.params;
  const sqlQuery = "DELETE FROM tasks WHERE id = ?";
  db.query(sqlQuery, [id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json({ message: "Task deleted successfully" });
    }
  });
});

// Update a task
app.put("/tasks/:id", (req, res) => {
  const { id } = req.params;
  const { task } = req.body;

  const query = "UPDATE tasks SET task = ? WHERE id = ?";
  db.query(query, [task, id], (err, result) => {
    if (err) {
      console.error("Error updating task:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.status(200).json({ message: "Task updated successfully" });
  });
});

// Toggle task completion
app.put("/tasks/completed/:id", (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  const sqlQuery = "UPDATE tasks SET completed = ? WHERE id = ?";
  db.query(sqlQuery, [completed, id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json({ message: "Task completion status updated" });
    }
  });
});

// Search task by name
app.get("/tasks/search/:task", (req, res) => {
  const { task } = req.params;
  const sqlQuery = "SELECT * FROM tasks WHERE task LIKE ?";
  db.query(sqlQuery, [`%${task}%`], (err, result) => {
    // Fixed query syntax
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(result);
    }
  });
});

// Update task order
app.put("/tasks/reorder", (req, res) => {
  const { tasks } = req.body; // Array of tasks with new positions

  const updatePromises = tasks.map((task, index) => {
    return new Promise((resolve, reject) => {
      const sqlQuery = "UPDATE tasks SET position = ? WHERE id = ?";
      db.query(sqlQuery, [index, task.id], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  });

  Promise.all(updatePromises)
    .then(() => res.json({ message: "Task order updated successfully" }))
    .catch((error) =>
      res.status(500).json({ error: "Database error", details: error })
    );
});

// Start the server
app.listen(port, () => {
  console.log("Server running on port", port);
});
