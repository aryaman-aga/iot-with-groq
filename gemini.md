# IIOT Quiz Website - Codebase Understanding

## Project Overview
This project is a Flask-based web application that serves as a quiz platform for "Internet of Things" (IIOT) course assignments. It extracts multiple-choice questions (MCQs) from PDF assignment files, stores them in a JSON file, and provides an interactive web interface for users to take quizzes. It features session management, randomized questions, scoring, and AI-powered explanations for incorrect answers using the Groq API.

## Directory Structure
```text
iot/
├── .env                  # Environment variables (e.g., GROQ_API_KEY)
├── Dockerfile            # Containerization instructions
├── Procfile              # Gunicorn process configuration for deployment
├── README.md             # Project documentation
├── app.py                # Main Flask application and API routes
├── diagnostic.py         # Debugging script to verify PDF parsing accuracy
├── docs/                 # Static build directory for GitHub Pages
├── quiz_data/            # Contains the extracted questions.json
├── quiz_loader.py        # PDF parsing and question extraction logic
├── render.yaml           # Deployment configuration for Render
├── requirements.txt      # Python dependencies
├── scripts/              # Helper scripts (e.g., manual extraction)
├── static/               # Frontend assets (CSS, JS)
└── templates/            # HTML templates for the Flask app (index.html, base.html)
```

## Core Components

### Frontend (Static Mode)
The application has been converted to a **pure static site** for maximum performance and reliability on Vercel.
- **index.html**: The entry point, now a standalone static file.
- **static/js/app.js**: Handles all quiz logic entirely in the browser. It fetches `quiz_data/questions.json` once and manages filtering, shuffling, scoring, and navigation without any backend calls.
- **localStorage**: Used to persist quiz progress and settings across sessions.

### quiz_data/questions.json
The central data store containing all 540 questions across three assignment sets. It now includes pre-generated **AI explanations** for every question, eliminating the need for real-time API calls.

### scripts/enrich_explanations.py
A utility script used to pre-populate the `questions.json` with explanations. It uses local **Ollama** (specifically the `llama3` model) to generate concise technical explanations for each correct answer.

## Data Flow (Static)
1. **Load Phase**: Browser fetches `index.html` and static assets. `app.js` fetches the enriched `questions.json`.
2. **Setup**: User selects sources and weeks; `app.js` filters and shuffles the data client-side.
3. **Quiz Session**: User interacts with the UI. All logic is local.
4. **Explanations**: If the secret code (`arya21`) is entered, the pre-loaded explanations from the JSON are revealed upon answering.
5. **Completion**: A breakdown of performance is generated locally.

## Infrastructure & Deployment
- **Platform**: Optimized for **Vercel Static Hosting**.
- **Configuration**: `vercel.json` handles routing and clean URLs.
- **Performance**: Near-zero latency as no backend API calls are required during the quiz flow.
