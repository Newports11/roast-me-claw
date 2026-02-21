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
let db = { roasts: [], dailyStats: { date: new Date().toISOString().split('T')[0], count: 0 } };
try {
  if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {}
function saveDB() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// Initialize db structure if missing
if (!db.dailyStats) db.dailyStats = { date: new Date().toISOString().split('T')[0], count: 0 };

// Reset daily stats if new day
function updateDailyStats() {
  const today = new Date().toISOString().split('T')[0];
  if (!db.dailyStats) db.dailyStats = { date: today, count: 0 };
  if (db.dailyStats.date !== today) {
    db.dailyStats = { date: today, count: 0 };
  }
  db.dailyStats.count++;
}

// Rate limiting
const rateLimit = {};
const RATE_LIMIT = 100; // Per minute
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

const ROAST_PROMPT = (content, type) => {
  if (type === 'tweet') {
    return `ROAST THIS TWEET: "${content}"

This is a tweet. Roast the content, the take, the energy, the vibe.
Make it mean and funny. Include:
1. Savage title about the tweet
2. 5 roast points about what's wrong/boring/funny
3. Score 1-10 (mostly 1-4)
4. One-line brutal verdict

JSON only:
{"title":"title","points":["p1","p2","p3","p4","p5"],score:2,"verdict":"verdict"}`;
  }
  
  return `ROAST THIS EXACTLY: "${content}"

You are MEAN. Be SCATHING. Make it HURT. Be specific and brutal. Include:
1. Savage title
2. 5 CRUEL roast points
3. Score 1-10 (MOSTLY 1-4, rarely higher)
4. Brutal verdict

JSON only:
{"title":"title","points":["p1","p2","p3","p4","p5"],score:2,"verdict":"verdict"}`;
};

// Helper for API calls with retry
async function fetchWithRetry(url, options, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 && i < retries) {
        console.log('Rate limited, retrying...');
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return response;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function generateRoast(type, content) {
  console.log('GEMINI_API_KEY present:', !!GEMINI_API_KEY);
  console.log('OPENAI_API_KEY present:', !!OPENAI_API_KEY);
  console.log('Generating roast for content:', content.substring(0, 50));
  
  // Try Gemini first
  if (GEMINI_API_KEY) {
    try {
      console.log('Calling Gemini API...');
      const response = await fetchWithRetry('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: ROAST_PROMPT(content, type) }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 1024 }
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
      const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + OPENAI_API_KEY
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: ROAST_PROMPT(content, type) }],
          temperature: 0.8,
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
  
  // Try Groq as fallback
  if (GROQ_API_KEY) {
    try {
      console.log('Calling Groq API...');
      const response = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + GROQ_API_KEY
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [{ role: 'user', content: ROAST_PROMPT(content, type) }],
          temperature: 0.8,
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
  
  // No APIs available - throw error
  throw new Error('All AI APIs failed. Please try again later.');
}

// ========== SOCIAL PROOF ==========

function getSocialProof() {
  updateDailyStats();
  return {
    today: db.dailyStats.count,
    allTime: db.roasts.length
  };
}

// ========== API ROUTES ==========

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
    
    updateDailyStats();
    
    saveDB();
    res.json({ ...record, socialProof: getSocialProof() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/social', (req, res) => { res.json(getSocialProof()); });

app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RoastMeClaw - Get Roasted by AI</title>
  <meta property="og:title" content="Get Roasted by AI">
  <meta property="og:url" content="https://roastmeclaw.com">
  <meta property="og:description" content="The place where AI ruthlessly roasts your projects. Submit yours and see if it survives the flames 🔥">
  <meta property="og:image" content="https://roastmeclaw.com/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Get Roasted by AI">
  <meta name="twitter:description" content="The place where AI ruthlessly roasts your projects. Submit yours and see if it survives the flames 🔥">
  <meta name="twitter:image" content="https://roastmeclaw.com/og-image.png">
  <meta name="twitter:image:alt" content="RoastMeClaw AI roast preview - flaming project critique">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#fff;min-height:100vh}
    .container{max-width:800px;margin:0 auto;padding:40px 20px}
    header{text-align:center;margin-bottom:30px;background:transparent}
    h1{font-size:4rem;margin-bottom:10px;background:linear-gradient(135deg,#ff4d4d,#ff9f43);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .tagline{color:#888;font-size:1.2rem}
    .social-proof{background:#1a1a1a;border-radius:12px;padding:20px;margin-bottom:30px;text-align:center}
    .social-proof-num{font-size:2rem;font-weight:bold;color:#ff9f43}
    .social-proof-label{color:#666;font-size:0.9rem}
    .input-section{background:#1a1a1a;border-radius:16px;padding:30px;margin-bottom:40px}
    textarea,input{width:100%;padding:16px;background:#0a0a0a;border:2px solid #2a2a2a;border-radius:8px;color:#fff;font-size:1rem;margin-bottom:15px}
    textarea:focus,input:focus{outline:none;border-color:#ff4d4d}
    textarea{min-height:120px;resize:vertical}
    .roast-btn{width:100%;padding:18px;background:linear-gradient(135deg,#ff4d4d,#ff9f43);border:none;border-radius:8px;color:#fff;font-size:1.2rem;font-weight:bold;cursor:pointer}
    .loading{text-align:center;padding:40px;display:none}
    .loading.show{display:block}
    .loading-spinner{width:50px;height:50px;border:4px solid #333;border-top-color:#ff4d4d;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .result{background:#1a1a1a;border-radius:16px;padding:30px;display:none}
    .result.show{display:block}
    .result-title{font-size:2rem;color:#ff4d4d;margin-bottom:20px;text-align:center}
    .score{text-align:center;font-size:5rem;font-weight:bold;color:#ff9f43;margin:20px 0}
    .score span{font-size:2rem;color:#666}
    .points{list-style:none;margin:20px 0}
    .points li{padding:15px;background:#2a2a2a;border-radius:8px;margin-bottom:10px;font-size:1.1rem}
    .verdict{text-align:center;font-size:1.3rem;color:#ff4d4d;font-style:italic;margin-top:20px}
    .share-btns{display:flex;gap:10px;margin-top:20px}
    .share-btn{flex:1;padding:15px;background:#000;border:2px solid #fff;border-radius:8px;color:#fff;font-size:1rem;cursor:pointer;text-align:center;text-decoration:none;display:block}
    .share-btn:hover{background:#fff;color:#000}
    .disclaimer{text-align:center;color:#444;font-size:0.9rem;margin-top:40px}
  </style>
</head>
<body>
  <div class=container>
    <header style="text-align:center;margin-bottom:30px">
      <img src="/logo.png" alt="RoastMeClaw" style="width:280px;max-width:100%;mix-blend-mode:screen">
      <h1 style="font-size:3rem;margin-top:15px;background:linear-gradient(135deg,#ff4d4d,#ff9f43);-webkit-background-clip:text;-webkit-text-fill-color:transparent">RoastMeClaw</h1>
      <p class=tagline>Get roasted by AI. No feelings allowed.</p>
    </header>
    
    <div class=social-proof id=social-proof>
      <div class=social-proof-num id=roast-today>--</div>
      <div class=social-proof-label>roasts today</div>
      <div style="margin-top:10px;color:#666;font-size:0.8rem"><span id=roast-all>--</span> total roasts</div>
    </div>
    
    <div class=input-section>
      <textarea id=description placeholder="Describe your product, paste your URL, or tell me what you do..."></textarea>
      <button class=roast-btn onclick="doRoast()">ROAST ME</button>
    </div>
    
    <div class=input-section style="margin-top:20px;border:1px solid #ff4d4d">
      <p style="color:#ff4d4d;margin-bottom:15px;text-align:center;font-weight:bold">Roast Someone Else's Project 🔥</p>
      <textarea id=friend-description placeholder="Paste your friend's URL or describe their project..."></textarea>
      <button class=roast-btn onclick="doRoastFriend()">ROAST THEIRS</button>
    </div>
    
    <div class=input-section style="margin-top:20px;border:1px solid #1da1f2">
      <p style="color:#1da1f2;margin-bottom:15px;text-align:center;font-weight:bold">Roast a Tweet 🐦</p>
      <input type=text id=tweet-url placeholder="Paste a tweet URL...">
      <button class=roast-btn style="background:#1da1f2" onclick="doRoastTweet()">ROAST TWEET</button>
    </div>
    
    <div class=loading id=loading>
      <div class=loading-spinner></div>
      <p>AI is sharpening its knives...</p>
    </div>
    
    <div class=result id=result>
      <h2 class=result-title id=result-title></h2>
      <div class=score><span id=score></span><span>/10</span></div>
      <ul class=points id=points></ul>
      <p class=verdict id=verdict></p>
      
      <div class=share-btns>
        <a href=# class=share-btn id=share-btn target=_blank>Share on X</a>
      </div>
    </div>
    
    <p class=disclaimer>Built for fun.</p>
  </div>
  
  <script>
    async function loadSocial() {
      try {
        const res = await fetch("/api/social");
        const data = await res.json();
        document.getElementById("roast-today").textContent = data.today;
        document.getElementById("roast-all").textContent = data.allTime;
      } catch(e) {}
    }
    
    async function doRoast() {
      const content = document.getElementById("description").value;
      if (!content) return alert("Enter something to roast!");
      document.getElementById("loading").classList.add("show");
      document.getElementById("result").classList.remove("show");
      
      try {
        const res = await fetch("/api/roast", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({type: "description", content})
        });
        const data = await res.json();
        
        document.getElementById("result-title").textContent = data.title;
        document.getElementById("score").textContent = data.score;
        document.getElementById("points").innerHTML = data.points.map(p => "<li>"+p+"</li>").join("");
        document.getElementById("verdict").textContent = data.verdict;
        
        const tweetText = "I got roasted by @roastmeclaw! " + data.title + " Score: " + data.score + "/10 - " + data.verdict;
        document.getElementById("share-btn").href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(tweetText);
        
        document.getElementById("loading").classList.remove("show");
        document.getElementById("result").classList.add("show");
        
        if (data.socialProof) {
          document.getElementById("roast-today").textContent = data.socialProof.today;
          document.getElementById("roast-all").textContent = data.socialProof.allTime;
        }
      } catch(e) {
        alert("Roast failed.");
        document.getElementById("loading").classList.remove("show");
      }
    }
    
    async function doRoastFriend() {
      const content = document.getElementById("friend-description").value;
      if (!content) return alert("Enter something to roast!");
      document.getElementById("loading").classList.add("show");
      document.getElementById("result").classList.remove("show");
      
      try {
        const res = await fetch("/api/roast", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({type: "description", content})
        });
        const data = await res.json();
        
        document.getElementById("result-title").textContent = data.title;
        document.getElementById("score").textContent = data.score;
        document.getElementById("points").innerHTML = data.points.map(p => "<li>"+p+"</li>").join("");
        document.getElementById("verdict").textContent = data.verdict;
        
        const tweetText = "I roasted " + content.substring(0,30) + "... with @roastmeclaw! Score: " + data.score + "/10 - " + data.verdict;
        document.getElementById("share-btn").href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(tweetText);
        
        document.getElementById("loading").classList.remove("show");
        document.getElementById("result").classList.add("show");
        
        if (data.socialProof) {
          document.getElementById("roast-today").textContent = data.socialProof.today;
          document.getElementById("roast-all").textContent = data.socialProof.allTime;
        }
      } catch(e) {
        alert("Roast failed.");
        document.getElementById("loading").classList.remove("show");
      }
    }
    
    async function doRoastTweet() {
      const url = document.getElementById("tweet-url").value;
      if (!url) return alert("Enter a tweet URL!");
      if (!url.includes("x.com") && !url.includes("twitter.com")) return alert("Please enter a valid X/Twitter URL!");
      
      document.getElementById("loading").classList.add("show");
      document.getElementById("result").classList.remove("show");
      
      try {
        const res = await fetch("/api/roast", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({type: "tweet", content: url})
        });
        const data = await res.json();
        
        document.getElementById("result-title").textContent = data.title;
        document.getElementById("score").textContent = data.score;
        document.getElementById("points").innerHTML = data.points.map(p => "<li>"+p+"</li>").join("");
        document.getElementById("verdict").textContent = data.verdict;
        
        const roastText = data.points[0] + " " + data.points[1];
        document.getElementById("share-btn").href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(roastText + " 🔥");
        
        document.getElementById("loading").classList.remove("show");
        document.getElementById("result").classList.add("show");
        
        if (data.socialProof) {
          document.getElementById("roast-today").textContent = data.socialProof.today;
          document.getElementById("roast-all").textContent = data.socialProof.allTime;
        }
      } catch(e) {
        alert("Roast failed.");
        document.getElementById("loading").classList.remove("show");
      }
    }
    
    loadSocial();
  </script>
</body>
</html>`;
  
  res.send(html);
});

app.listen(PORT, () => {
  console.log('RoastMeClaw running on port ' + PORT);
  console.log('AI Mode: ' + (GEMINI_API_KEY || OPENAI_API_KEY || GROQ_API_KEY ? 'REAL AI' : 'DEMO'));
});
