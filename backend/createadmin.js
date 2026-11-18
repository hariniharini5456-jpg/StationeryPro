require("dotenv").config();

const db = require("./config/db");
const bcrypt = require("bcryptjs");

async function createAdmin() {
  try {
    const name = "Administrator";
    const email = "admin@stationerypro.com";
    const password = "ChangeThisPassword123!";

    const [existing] = await db.execute(
      "SELECT user_id FROM users WHERE email = ?",
      [email],
    );

    if (existing.length > 0) {
      console.log("Admin account already exists.");
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await db.execute(
      `INSERT INTO users
            (name, email, password, role, status)
            VALUES (?, ?, ?, 'admin', 'active')`,
      [name, email, hashedPassword],
    );

    console.log("Admin account created successfully!");
  } catch (error) {
    console.error("Admin creation failed:", error.message);
  } finally {
    await db.end();
  }
}

createAdmin();
