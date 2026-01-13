import { GoogleGenerativeAI } from "@google/generative-ai";
import nodemailer from "nodemailer";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure your email service
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Webhook authentication validation
function validateBasicAuth(authHeader, expectedUsername, expectedPassword) {
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const encodedCredentials = authHeader.slice(6);
  const decodedCredentials = Buffer.from(encodedCredentials, "base64").toString(
    "utf-8"
  );
  const [username, password] = decodedCredentials.split(":");

  return (
    username === expectedUsername && password === expectedPassword
  );
}

// Main handler function for Vercel
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Validate authentication from Rocketlane
    const authHeader = req.headers.authorization;
    const isValid = validateBasicAuth(
      authHeader,
      process.env.WEBHOOK_USERNAME,
      process.env.WEBHOOK_PASSWORD
    );

    if (!isValid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Extract data from Rocketlane webhook
    const { event, data } = req.body;

    console.log(`Received ${event} event from Rocketlane:`, data);

    // Prepare the data for Gemini analysis
    const dataToAnalyze = JSON.stringify(data, null, 2);

    // ==========================================
    // STEP 1: Send data to Gemini for analysis
    // ==========================================
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(
      `Please analyze the following project data from Rocketlane and provide a concise summary with key insights and action items:\n\n${dataToAnalyze}`
    );

    const summary = result.response.text();

    // ==========================================
    // STEP 2: Send summary via email
    // ==========================================
    const emailContent = {
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
      subject: `Rocketlane Project Analysis - ${new Date().toLocaleDateString()}`,
      html: `
        <h2>Project Analysis Summary</h2>
        <p><strong>Event Type:</strong> ${event}</p>
        <hr />
        <h3>Analysis</h3>
        <pre style="background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto;">${escapeHtml(summary)}</pre>
        <hr />
        <p><small>Generated automatically by Rocketlane → Gemini AI → Email automation</small></p>
      `,
    };

    await transporter.sendMail(emailContent);
    console.log("Email sent successfully");

    // ==========================================
    // STEP 3: Return success response
    // ==========================================
    res.status(200).json({
      success: true,
      message: "Data analyzed and email sent",
      summary: summary.substring(0, 100) + "...",
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// Helper function to escape HTML characters
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
