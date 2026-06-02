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

function getServiceAccountCredentials() {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!rawCredentials) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable.");
  }

  try {
    const credentials = JSON.parse(rawCredentials);

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error("Service account JSON must include client_email and private_key.");
    }

    return credentials;
  } catch (error) {
    throw new Error(`Invalid GOOGLE_SERVICE_ACCOUNT_JSON: ${error.message}`);
  }
}

function getDriveClient() {
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  return google.drive({ version: "v3", auth });
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
      supportsAllDrives: true,
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
