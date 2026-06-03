import cors from "cors";
import express from "express";
import { google } from "googleapis";
import { Readable } from "node:stream";

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = "https://31415hacker.github.io";

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === ALLOWED_ORIGIN) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "25mb" }));

// Authenticates as YOU using your fresh OAuth credentials & permanent Refresh Token
function getDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.drive({ version: "v3", auth: oauth2Client });
}

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "google-drive-upload-server" });
});

app.post("/upload", async (req, res) => {
  try {
    const { fileName, mimeType, fileBase64 } = req.body ?? {};
    const folderId = process.env.DRIVE_FOLDER_ID;

    if (!folderId) {
      res.status(500).json({ error: "Missing DRIVE_FOLDER_ID environment variable." });
      return;
    }

    if (!fileName || !mimeType || !fileBase64) {
      res.status(400).json({
        error: "Request body must include fileName, mimeType, and fileBase64.",
      });
      return;
    }

    if (
      typeof fileName !== "string" ||
      typeof mimeType !== "string" ||
      typeof fileBase64 !== "string"
    ) {
      res.status(400).json({
        error: "fileName, mimeType, and fileBase64 must all be strings.",
      });
      return;
    }

    const base64Payload = fileBase64.includes(",")
      ? fileBase64.slice(fileBase64.indexOf(",") + 1)
      : fileBase64;
    const fileBuffer = Buffer.from(base64Payload, "base64");

    if (!fileBuffer.length) {
      res.status(400).json({ error: "fileBase64 could not be decoded." });
      return;
    }

    const drive = getDriveClient();
    
    // Clean, direct upload execution under your user authority context
    const uploadResponse = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(fileBuffer),
      },
      fields: "id,name,mimeType,webViewLink,webContentLink",
    });

    res.status(201).json({
      success: true,
      file: uploadResponse.data,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).json({ error: "Upload failed." });
  }
});

app.use((error, _req, res, _next) => {
  if (error.message === "Not allowed by CORS") {
    res.status(403).json({ error: "CORS origin not allowed." });
    return;
  }
  console.error("Server error:", error);
  res.status(500).json({ error: "Server error." });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
