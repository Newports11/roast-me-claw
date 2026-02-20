const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const DATA_FILE = path.join(__dirname, 'data.json');

// Simple DB
let db = { roasts: [] };
try {
  if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {}
function saveDB() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Roast prompt
const SYSTEM_PROMPT = `You are a witty, savage but funny product/website roaster. Your job is to roast the user's product or website.

Rules:
- Be funny and sarcastic
- Roast the name, tagline, design, copy, pricing, positioning
- Be a bit mean but not cruel - it's all in good fun
- Include 3-5 roast points
- End with an overall roast score out of 10
- Don't hold back - this is roast mode!

Format as JSON:
{
  "title": "Funny roast title",
  "points": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "score": 7,
  "verdict": "One sentence summary"
}`;

// Simulate AI roast (replace with real API key for production)
async function generateRoast(type, content) {
  // For demo, generate a mock roast
  const roasts = [
    {
      title: "Another 'Innovative' Solution to a Problem Nobody Has",
      points: [
        "The tagline reads like it was written by a thesaurus on steroids",
        "I genuinely can't tell if this is a startup or an art project",
        "The 'revolutionary' feature is something Excel did in 1997",
        "Your hero section has more buzzwords than a tech conference keynote",
        "The pricing page is hidden so deep I'd need a map"
      ],
      score: 3,
      verdict: "Bold of you to assume anyone needs this"
    },
    {
      title: "Peak Startup Energy Detected",
      points: [
        "The name sounds like an AI generated it (it probably did)",
        "Your 'About' page has more 'we're a family' energy than a cult",
        "The hero image is a stock photo of people pretending to work",
        "Five 'we're hiring' mentions - we get it, you're growing",
        "The CTA button says 'Get Started' which is the verbal equivalent of a shrug"
      ],
      score: 4,
      verdict: "Solid 4/10 would not click again"
    },
    {
      title: "Y2K Aesthetic, 2026 Problems",
      points: [
        "The design screams 'our intern built this in WordPress'",
        "Your value proposition requires a 30-minute read to understand",
        "The loading animation is longer than most TED talks",
        "Mobile responsive in theory, usable in practice - never",
        "I found more typos than features"
      ],
      score: 2,
      verdict: "This is what's killing the startup ecosystem"
    }
  ];
  
  // Pick random roast and customize slightly
  const roast = roasts[Math.floor(Math.random() * roasts.length)];
  
  // Add some variety based on content
  if (content.toLowerCase().includes('ai')) {
    roast.points[0] = "AI in 2026? Revolutionary. Next you'll tell me you have a mobile app.";
    roast.score = Math.max(1, roast.score - 1);
  }
  
  return roast;
}

// API: Generate roast
app.post('/api/roast', async (req, res) => {
  const { type, content } = req.body;
  
  if (!content) return res.status(400).json({ error: 'content required' });
  
  try {
    const roast = await generateRoast(type, content);
    
    const id = 'roast_' + uuidv4().slice(0, 8);
    const record = {
      id,
      type,
      content,
      ...roast,
      created_at: new Date().toISOString()
    };
    
    db.roasts.push(record);
    saveDB();
    
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Get roast by ID
app.get('/api/roast/:id', (req, res) => {
  const roast = db.roasts.find(r => r.id === req.params.id);
  if (!roast) return res.status(404).json({ error: 'Not found' });
  res.json(roast);
});

// API: Recent roasts
app.get('/api/roasts', (req, res) => {
  res.json(db.roasts.slice(-20).reverse());
});

// Serve frontend
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔥 RoastMeClaw - Get Roasted by AI</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fff;
      min-height: 100vh;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    header {
      text-align: center;
      margin-bottom: 50px;
    }
    h1 {
      font-size: 4rem;
      margin-bottom: 10px;
      background: linear-gradient(135deg, #ff4d4d, #ff9f43);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .tagline {
      color: #888;
      font-size: 1.2rem;
    }
    .input-section {
      background: #1a1a1a;
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 40px;
    }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .tab {
      padding: 10px 20px;
      background: #2a2a2a;
      border: none;
      border-radius: 8px;
      color: #888;
      cursor: pointer;
      font-size: 1rem;
      transition: all 0.2s;
    }
    .tab.active {
      background: #ff4d4d;
      color: #fff;
    }
    textarea, input {
      width: 100%;
      padding: 16px;
      background: #0a0a0a;
      border: 2px solid #2a2a2a;
      border-radius: 8px;
      color: #fff;
      font-size: 1rem;
      margin-bottom: 15px;
      transition: border-color 0.2s;
    }
    textarea:focus, input:focus {
      outline: none;
      border-color: #ff4d4d;
    }
    textarea { min-height: 120px; resize: vertical; }
    button.roast-btn {
      width: 100%;
      padding: 18px;
      background: linear-gradient(135deg, #ff4d4d, #ff9f43);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 1.2rem;
      font-weight: bold;
      cursor: pointer;
      transition: transform 0.2s;
    }
    button.roast-btn:hover {
      transform: scale(1.02);
    }
    button.roast-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .result {
      background: #1a1a1a;
      border-radius: 16px;
      padding: 30px;
      display: none;
    }
    .result.show { display: block; }
    .result-title {
      font-size: 2rem;
      color: #ff4d4d;
      margin-bottom: 20px;
      text-align: center;
    }
    .score {
      text-align: center;
      font-size: 5rem;
      font-weight: bold;
      color: #ff9f43;
      margin: 20px 0;
    }
    .score span { font-size: 2rem; color: #666; }
    .points {
      list-style: none;
      margin: 20px 0;
    }
    .points li {
      padding: 15px;
      background: #2a2a2a;
      border-radius: 8px;
      margin-bottom: 10px;
      font-size: 1.1rem;
    }
    .verdict {
      text-align: center;
      font-size: 1.3rem;
      color: #ff4d4d;
      font-style: italic;
      margin-top: 20px;
    }
    .loading {
      text-align: center;
      padding: 40px;
      display: none;
    }
    .loading.show { display: block; }
    .loading-spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #333;
      border-top-color: #ff4d4d;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .disclaimer {
      text-align: center;
      color: #444;
      font-size: 0.9rem;
      margin-top: 40px;
    }
    .share-btn {
      display: block;
      width: 100%;
      padding: 15px;
      background: #000;
      border: 2px solid #fff;
      border-radius: 8px;
      color: #fff;
      font-size: 1rem;
      cursor: pointer;
      margin-top: 20px;
      text-align: center;
      text-decoration: none;
    }
    .share-btn:hover {
      background: #333;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🔥 RoastMeClaw</h1>
      <p class="tagline">Get roasted by AI. No feelings allowed.</p>
    </header>

    <div class="input-section">
      <div class="tabs">
        <button class="tab active" data-tab="url">URL</button>
        <button class="tab" data-tab="description">Description</button>
      </div>
      
      <div id="url-input">
        <input type="text" id="url" placeholder="https://yoursite.com">
      </div>
      
      <div id="desc-input" style="display:none;">
        <textarea id="description" placeholder="Describe your product... (e.g., A SaaS for scheduling meetings between busy professionals)"></textarea>
      </div>

      <button class="roast-btn" onclick="doRoast()">🔥 ROAST ME</button>
    </div>

    <div class="loading" id="loading">
      <div class="loading-spinner"></div>
      <p>AI is sharpening its knives...</p>
    </div>

    <div class="result" id="result">
      <h2 class="result-title" id="result-title"></h2>
      <div class="score"><span id="score"></span><span>/10</span></div>
      <ul class="points" id="points"></ul>
      <p class="verdict" id="verdict"></p>
      <a href="#" class="share-btn" id="share-btn" target="_blank">🐦 Share on X</a>
    </div>

    <p class="disclaimer">Built for fun. Don't take it personally. 🤖</p>
  </div>

  <script>
    let currentTab = 'url';
    
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        
        document.getElementById('url-input').style.display = currentTab === 'url' ? 'block' : 'none';
        document.getElementById('desc-input').style.display = currentTab === 'description' ? 'block' : 'none';
      });
    });

    async function doRoast() {
      const content = currentTab === 'url' 
        ? document.getElementById('url').value 
        : document.getElementById('description').value;
      
      if (!content) return alert('Enter something to roast!');
      
      document.getElementById('loading').classList.add('show');
      document.getElementById('result').classList.remove('show');
      
      try {
        const res = await fetch('/api/roast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: currentTab, content })
        });
        
        const data = await res.json();
        
        document.getElementById('result-title').textContent = data.title;
        document.getElementById('score').textContent = data.score;
        document.getElementById('points').innerHTML = data.points.map(p => '<li>' + p + '</li>').join('');
        document.getElementById('verdict').textContent = data.verdict;
        
        // Update share button
        const tweetText = `🔥 I just got roasted by AI!\n\n${data.title}\nScore: ${data.score}/10\n\n${data.verdict}\n\nGet roasted at:`;
        const shareUrl = 'https://roastmeclaw.com';
        document.getElementById('share-btn').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetText) + '&url=' + encodeURIComponent(shareUrl);
        
        document.getElementById('loading').classList.remove('show');
        document.getElementById('result').classList.add('show');
        
        // Scroll to result
        document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
      } catch (e) {
        alert('Roast failed. Try again.');
        document.getElementById('loading').classList.remove('show');
      }
    }
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`🔥 RoastMe running on http://localhost:${PORT}`);
});
