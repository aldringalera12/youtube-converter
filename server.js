const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Set absolute path for yt-dlp
const YT_DLP_PATH = path.resolve('./yt-dlp');

// Use '/tmp/downloads' since Render has ephemeral storage
const OUTPUT_DIR = '/tmp/downloads';

// Ensure the downloads folder exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Path to cookies.txt (update this if needed)
const COOKIES_FILE = path.resolve('./cookies.txt');

// Function to refresh cookies
const updateCookies = () => {
    console.log("🔄 Refreshing cookies...");

    exec('python3 fetch_cookies.py', (error, stdout, stderr) => {
        if (error) {
            console.error("❌ Failed to refresh cookies:", stderr);
        } else {
            console.log("✅ Cookies updated:", stdout.trim());
        }
    });
};

// 🔹 Refresh cookies when the server starts
updateCookies();

// Middleware to refresh cookies before every download request
app.use((req, res, next) => {
    updateCookies();
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Define BASE_URL for absolute download links
const BASE_URL = "https://youtube-converter-51vz.onrender.com/"; // Replace with your actual Render URL

// YouTube conversion route
app.post('/convert', (req, res) => {
    const { url, format } = req.body;

    if (!url || !format || !['mp3', 'mp4'].includes(format)) {
        console.error("❌ Invalid request data:", req.body);
        return res.status(400).json({ error: 'Missing or invalid URL/format' });
    }

    console.log(`🔹 Received request: URL = ${url}, Format = ${format}`);

    // Fetch video title using yt-dlp with cookies
    exec(`${YT_DLP_PATH} --cookies ${COOKIES_FILE} --get-title "${url}"`, (error, stdout, stderr) => {
        if (error) {
            console.error("❌ Failed to get video title:", stderr);
            return res.status(500).json({ error: 'Failed to get video title', details: stderr });
        }

        let title = stdout.trim().replace(/[<>:"/\\|?*]+/g, ""); // Sanitize filename
        const outputFilename = `${title}.${format}`;
        const outputPath = path.join(OUTPUT_DIR, outputFilename);

        console.log(`🔹 Video Title: ${title}`);

        // Select correct command for MP3 or MP4 (using cookies)
        let command;
        if (format === 'mp3') {
            command = `${YT_DLP_PATH} --cookies ${COOKIES_FILE} -f bestaudio --extract-audio --audio-format mp3 --audio-quality 320K -o "${outputPath}" "${url}"`;
        } else if (format === 'mp4') {
            command = `${YT_DLP_PATH} --cookies ${COOKIES_FILE} -f best -o "${outputPath}" "${url}"`;
        }

        console.log(`🔹 Running command: ${command}`);

        // Execute the conversion
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error("❌ Conversion failed:", stderr);
                return res.status(500).json({ error: 'Conversion failed', details: stderr });
            }

            console.log("✅ Conversion successful:", outputFilename);

            res.json({ 
                title: title, 
                youtubeUrl: url,
                downloadUrl: `/download/${encodeURIComponent(outputFilename)}` 
            });
        });
    });
});

// Route to serve downloads
app.get('/download/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(OUTPUT_DIR, filename);

    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Set correct content type for MP3 and MP4
        if (filename.endsWith('.mp3')) {
            res.setHeader('Content-Type', 'audio/mpeg');
        } else if (filename.endsWith('.mp4')) {
            res.setHeader('Content-Type', 'video/mp4');
        }

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('end', () => {
            // Ensure file deletion after stream ends
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error(`Error deleting file ${filename}:`, unlinkErr);
                } else {
                    console.log(`Deleted file: ${filename}`);
                }
            });
        });

    } else {
        res.status(404).send('File not found');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
