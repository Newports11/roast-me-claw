const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const DATA_FILE = path.join(__dirname, 'data.json');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Simple DB
let db = { roasts: [] };
try {
  if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {}
function saveDB() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// Rate limiting
const rateLimit = {};
const RATE_LIMIT = 10;
const RATE_WINDOW = 60000;

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  if (!rateLimit[ip]) { rateLimit[ip] = { count: 1, reset: now + RATE_WINDOW }; return next(); }
  if (now > rateLimit[ip].reset) { rateLimit[ip] = { count: 1, reset: now + RATE_WINDOW }; return next(); }
  if (rateLimit[ip].count > RATE_LIMIT) { return res.status(429).json({ error: 'Too many requests. Slow down!' }); }
  rateLimit[ip].count++;
  next();
}

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public'));

const ROAST_PROMPT = (content) => `You are a brutally honest, savage but funny website/product roaster. Roast: "${content}"

Be specific about what you see. Roast: name, headline, design, copy, product, pricing, buzzwords.

Make it HURT but funny. Include:
1. Savage title
2. 5 specific roast points
3. Score 1-10
4. Brutal one-line verdict

JSON only:
{"title":"title","points":["p1","p2","p3","p4","p5"],score:7,"verdict":"verdict"}`;

async function generateRoast(type, content) {
  console.log('GEMINI_API_KEY present:', !!GEMINI_API_KEY);
  console.log('OPENAI_API_KEY present:', !!OPENAI_API_KEY);
  
  // Try Gemini first
  if (GEMINI_API_KEY) {
    try {
      console.log('Calling Gemini API...');
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: ROAST_PROMPT(content) }] }],
          generationConfig: { temperature: 1.2, maxOutputTokens: 1024 }
        })
      });
      
      const data = await response.json();
      console.log('Gemini response status:', response.status);
      
      if (response.status === 200 && data.candidates && data.candidates[0].content.parts[0].text) {
        const text = data.candidates[0].content.parts[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } else {
        console.log('Gemini error:', data.error?.message || 'Unknown');
      }
    } catch (e) {
      console.error('Gemini error:', e.message);
    }
  }
  
  // Try OpenAI as fallback
  if (OPENAI_API_KEY) {
    try {
      console.log('Calling OpenAI API...');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + OPENAI_API_KEY
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: ROAST_PROMPT(content) }],
          temperature: 1.2,
          max_tokens: 1024
        })
      });
      
      const data = await response.json();
      console.log('OpenAI response status:', response.status);
      
      if (response.status === 200 && data.choices && data.choices[0].message.content) {
        const text = data.choices[0].message.content;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } else {
        console.log('OpenAI error:', data.error?.message || 'Unknown');
      }
    } catch (e) {
      console.error('OpenAI error:', e.message);
    }
  }
  
  // Try Groq as fallback (different free tier)
  if (GROQ_API_KEY) {
    try {
      console.log('Calling Groq API...');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + GROQ_API_KEY
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [{ role: 'user', content: ROAST_PROMPT(content) }],
          temperature: 1.2,
          max_tokens: 1024
        })
      });
      
      const data = await response.json();
      console.log('Groq response status:', response.status);
      
      if (response.status === 200 && data.choices && data.choices[0].message.content) {
        const text = data.choices[0].message.content;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } else {
        console.log('Groq error:', data.error?.message || 'Unknown');
      }
    } catch (e) {
      console.error('Groq error:', e.message);
    }
  }
  
  // Fallback to mock
  return getMockRoast(content);
}

function getMockRoast(content) {
  const roasts = [
    { title: "Another 'Innovative' Solution", points: ["Tagline = thesaurus on steroids", "Startup or art project?", "'Revolutionary' = Excel 1997", "Hero = buzzword salad", "Pricing hidden like treasure"], score: 3, verdict: "Bold to assume anyone needs this" },
    { title: "Peak Startup Energy", points: ["Name sounds AI-generated", "About = 'we're a family' cult", "Hero = stock photo", "Five 'we're hiring'", "CTA = verbal shrug"], score: 4, verdict: "4/10 would not click again" },
    { title: "Y2K Aesthetic, 2026 Problems", points: ["Design = intern's WordPress", "Value prop needs 30-min read", "Loading > TED talks", "Mobile responsive in theory", "More typos than features"], score: 2, verdict: "What's killing startup ecosystem" }
  ];
  const roast = roasts[Math.floor(Math.random() * roasts.length)];
  if (content.toLowerCase().includes('ai')) { roast.points[0] = "AI in 2026? Revolutionary."; roast.score = Math.max(1, roast.score - 1); }
  return roast;
}

app.post('/api/roast', rateLimiter, async (req, res) => {
  const { type, content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be string' });
  if (content.length < 3) return res.status(400).json({ error: 'content too short' });
  if (content.length > 2000) return res.status(400).json({ error: 'content too long (max 2000 chars)' });
  
  try {
    const roast = await generateRoast(type, content);
    const id = 'roast_' + uuidv4().slice(0, 8);
    const record = { id, type, content, ...roast, created_at: new Date().toISOString() };
    db.roasts.push(record);
    saveDB();
    res.json(record);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/roast/:id', (req, res) => {
  const roast = db.roasts.find(r => r.id === req.params.id);
  if (!roast) return res.status(404).json({ error: 'Not found' });
  res.json(roast);
});

app.get('/api/roasts', (req, res) => { res.json(db.roasts.slice(-20).reverse()); });

app.get('/', (req, res) => {
res.send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RoastMeClaw - Get Roasted by AI</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#fff;min-height:100vh}.container{max-width:800px;margin:0 auto;padding:40px 20px}header{text-align:center;margin-bottom:50px}h1{font-size:4rem;margin-bottom:10px;background:linear-gradient(135deg,#ff4d4d,#ff9f43);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.tagline{color:#888;font-size:1.2rem}.input-section{background:#1a1a1a;border-radius:16px;padding:30px;margin-bottom:40px}textarea,input{width:100%;padding:16px;background:#0a0a0a;border:2px solid #2a2a2a;border-radius:8px;color:#fff;font-size:1rem;margin-bottom:15px}textarea:focus,input:focus{outline:none;border-color:#ff4d4d}textarea{min-height:120px;resize:vertical}.roast-btn{width:100%;padding:18px;background:linear-gradient(135deg,#ff4d4d,#ff9f43);border:none;border-radius:8px;color:#fff;font-size:1.2rem;font-weight:bold;cursor:pointer}.loading{text-align:center;padding:40px;display:none}.loading.show{display:block}.loading-spinner{width:50px;height:50px;border:4px solid #333;border-top-color:#ff4d4d;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}@keyframes spin{to{transform:rotate(360deg)}}.result{background:#1a1a1a;border-radius:16px;padding:30px;display:none}.result.show{display:block}.result-title{font-size:2rem;color:#ff4d4d;margin-bottom:20px;text-align:center}.score{text-align:center;font-size:5rem;font-weight:bold;color:#ff9f43;margin:20px 0}.score span{font-size:2rem;color:#666}.points{list-style:none;margin:20px 0}.points li{padding:15px;background:#2a2a2a;border-radius:8px;margin-bottom:10px;font-size:1.1rem}.verdict{text-align:center;font-size:1.3rem;color:#ff4d4d;font-style:italic;margin-top:20px}.share-btn{display:block;width:100%;padding:15px;background:#000;border:2px solid #fff;border-radius:8px;color:#fff;font-size:1rem;cursor:pointer;margin-top:20px;text-align:center;text-decoration:none}.disclaimer{text-align:center;color:#444;font-size:0.9rem;margin-top:40px}</style></head><body><div class=container><header><h1>RoastMeClaw</h1><p class=tagline>Get roasted by AI. No feelings allowed.</p></header><div class=input-section><textarea id=description placeholder="Describe your product..."></textarea><button class=roast-btn onclick="doRoast()">ROAST ME</button></div><div class=loading id=loading><div class=loading-spinner></div><p>AI is sharpening its knives...</p></div><div class=result id=result><h2 class=result-title id=result-title></h2><div class=score><span id=score></span><span>/10</span></div><ul class=points id=points></ul><p class=verdict id=verdict></p><a href=# class=share-btn id=share-btn target=_blank>Share on X</a></div><p class=disclaimer>Built for fun.</p></div><script>async function doRoast(){const content=document.getElementById("description").value;if(!content)return alert("Enter something to roast!");document.getElementById("loading").classList.add("show");document.getElementById("result").classList.remove("show");try{const res=await fetch("/api/roast",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"description",content})});const data=await res.json();document.getElementById("result-title").textContent=data.title;document.getElementById("score").textContent=data.score;document.getElementById("points").innerHTML=data.points.map(p=>"<li>"+p+"</li>").join("");document.getElementById("verdict").textContent=data.verdict;const tweetText="I got roasted by AI! "+data.title+" Score: "+data.score+"/10 - "+data.verdict;document.getElementById("share-btn").href="https://twitter.com/intent/tweet?text="+encodeURIComponent(tweetText);document.getElementById("loading").classList.remove("show");document.getElementById("result").classList.add("show")}catch(e){alert("Roast failed.");document.getElementById("loading").classList.remove("show")}}</script></body></html>');
});

app.listen(PORT, () => {
  console.log('RoastMeClaw running on port ' + PORT);
  console.log('AI Mode: ' + (GEMINI_API_KEY || OPENAI_API_KEY || GROQ_API_KEY ? 'REAL AI' : 'DEMO'));
});
