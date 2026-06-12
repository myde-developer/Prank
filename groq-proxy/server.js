const express = require('express');
const multer = require('multer');
const { OpenAI } = require('openai'); // Groq uses OpenAI-compatible SDK
const cors = require('cors');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize Groq client
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Groq Vision Proxy is running' });
});

app.post('/parse-match', upload.single('image'), async (req, res) => {
    try {
        let imageBase64;
        if (req.body.image) {
            imageBase64 = req.body.image;
        } else if (req.file) {
            imageBase64 = req.file.buffer.toString('base64');
        } else {
            return res.status(400).json({ error: 'No image provided' });
        }

        const prompt = `
            You are a football match analyzer. Extract the following from this screenshot:
            - Home team name (exactly as written)
            - Away team name
            - Final score (home goals, away goals)
            - List of goal events (minute, team, scorer, assist if visible, goal type: "Open play", "Penalty", "Free kick", "Header", "Own goal")

            Return ONLY valid JSON in this exact structure, no extra text:
            {
                "home": "string",
                "away": "string",
                "homeScore": number,
                "awayScore": number,
                "events": [
                    {
                        "minute": number,
                        "team": "string",
                        "player": "string",
                        "assist": "string or null",
                        "goalType": "string"
                    }
                ]
            }
            If a detail is missing, use null. Do not invent data.
        `;

        const response = await groq.chat.completions.create({
    model: "llama-3.2-11b-vision-preview",  
    messages: [
        {
            role: "user",
            content: [
                { type: "text", text: prompt },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBase64}`
                    }
                }
            ]
        }
    ],
    response_format: { type: "json_object" }
});

        const extracted = JSON.parse(response.choices[0].message.content);
        res.json({ success: true, ...extracted });
    } catch (error) {
        console.error("Groq API error:", error);
        res.status(500).json({ error: "Failed to parse image", details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
});