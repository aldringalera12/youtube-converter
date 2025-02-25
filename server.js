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

// Log yt-dlp version to check if it works
exec(`${YT_DLP_PATH} --version`, (error, stdout, stderr) => {
    if (error) {
        console.error("yt-dlp not found or failed to run:", stderr);
    } else {
        console.log("yt-dlp version:", stdout.trim());
    }
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
        return res.status(400).json({ error: 'Missing or invalid URL/format' });
    }

    // Fetch video title
    exec(`${YT_DLP_PATH} --get-title "${url}"`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: 'Failed to get video title', details: stderr });
        }

        let title = stdout.trim().replace(/[<>:"/\\|?*]+/g, ""); // Sanitize filename
        const outputFilename = `${title}.${format}`;
        const outputPath = path.join(OUTPUT_DIR, outputFilename);

        // Delete existing file with the same name (if any)
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

        // Select correct command for MP3 or MP4
        let command;
        if (format === 'mp3') {
            command = `./yt-dlp -f bestaudio --extract-audio --audio-format mp3 --audio-quality 320K -o "${outputPath}" "${url}"`;
        } else if (format === 'mp4') {
            command = `./yt-dlp -f best -o "${outputPath}" "${url}"`;
        }

        // Execute the conversion
        exec(command, (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ error: 'Conversion failed', details: stderr });
            }

            res.json({ 
                title: title, 
                youtubeUrl: url,
                downloadUrl: `${BASE_URL}/download/${encodeURIComponent(outputFilename)}`
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
    console.log(`Server running on http://localhost:${PORT}`);
});
