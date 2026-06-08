import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Groq } from 'groq-sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files
app.use('/premier', express.static(join(__dirname, 'premier')));
app.use('/championship', express.static(join(__dirname, 'championship')));
app.use(express.static(__dirname)); // For admin files

const groq = new Groq({ 
    apiKey: process.env.GROQ_API_KEY 
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running!' });
});

app.post('/api/generate-comment', async (req, res) => {
    try {
        const { homeTeam, awayTeam, homeScore, awayScore, events } = req.body;
        
        let eventsDescription = "";
        if (events && events.length > 0) {
            eventsDescription = events.map(ev => {
                const assistText = ev.assist ? ` (assist: ${ev.assist})` : '';
                const typeText = ev.goalType !== 'Open play' ? ` [${ev.goalType}]` : '';
                return `${ev.minute}': ${ev.player} (${ev.team})${typeText}${assistText}`;
            }).join('\n');
        } else {
            eventsDescription = "No goal details recorded.";
        }
        
        const prompt = `Write a short, exciting football match report (2-3 sentences) for ${homeTeam} vs ${awayTeam} that ended ${homeScore}-${awayScore}.

Events:
${eventsDescription}

Make it energetic and sound like a real commentator. Be concise. Don't use quotes.`;

        const response = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-8b-8192",
            temperature: 0.7,
            max_tokens: 120,
        });
        
        let comment = response.choices[0]?.message?.content || "";
        comment = comment.replace(/["']/g, '').trim();
        
        res.json({ success: true, comment });
        
    } catch (error) {
        console.error("Groq API error:", error);
        res.json({ 
            success: false, 
            comment: generateFallbackComment(req.body.homeTeam, req.body.awayTeam, req.body.homeScore, req.body.awayScore)
        });
    }
});

function generateFallbackComment(homeTeam, awayTeam, homeScore, awayScore) {
    if (homeScore === awayScore) {
        return `${homeTeam} ${homeScore}-${awayScore} ${awayTeam}. A hard-fought draw.`;
    }
    const winner = homeScore > awayScore ? homeTeam : awayTeam;
    const margin = Math.abs(homeScore - awayScore);
    
    if (margin >= 3) return `${winner} dominated with a ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)} victory!`;
    if (margin === 2) return `${winner} secured a ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)} win.`;
    return `${winner} edged it ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)} in a tight contest!`;
}

// Redirect root to premier league
app.get('/', (req, res) => {
    res.redirect('/premier/');
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 Premier League: http://localhost:${PORT}/premier/`);
    console.log(`📱 Championship: http://localhost:${PORT}/championship/`);
});