# RoastMeClaw - Get Roasted by AI

A fun AI-powered product/website roaster. Tell us what to roast, and our AI will roast it.

## Quick Start

```bash
cd roast-me
npm install
npm start
```

Server runs on port 3002.

## Features

- Enter a URL or describe your product
- AI roasts it with humor + actual feedback
- Shareable results

## API

```bash
# Roast a URL
curl -X POST http://localhost:3002/api/roast \
  -H "Content-Type: application/json" \
  -d '{"type": "url", "content": "https://example.com"}'

# Roast a description
curl -X POST http://localhost:3002/api/roast \
  -H "Content-Type: application/json" \
  -d '{"type": "description", "content": "A SaaS for scheduling meetings"}'
```
