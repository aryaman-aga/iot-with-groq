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

### `app.py`
This is the entry point of the Flask application. 
- **Session Management**: Uses an in-memory dictionary (`QUIZ_SESSIONS`) protected by a threading `Lock` to handle concurrent quiz sessions securely.
- **API Endpoints**:
  - `GET /`: Renders the main index HTML.
  - `POST /api/start`: Initializes a new quiz session, allowing source filtering and shuffling.
  - `POST /api/question`: Retrieves a specific question based on the active session.
  - `POST /api/answer`: Submits a user's answer, updates the score, and logs the response. Returns quiz summary upon completion.
  - `POST /api/explanation`: Uses the `Groq` API (`llama-3.3-70b-versatile` model) to asynchronously generate concise explanations when a user gets an answer wrong.

### `quiz_loader.py`
Handles the extraction of quiz data from raw PDF files.
- **PDF Processing**: Uses `pypdf` to read text from three specific assignment PDFs (`2024 iiot.pdf`, `2026 iiot assignments.pdf`, `Merged IIOT Assignments.pdf`).
- **Parsing Logic**: Heavy usage of complex Regular Expressions (`re`) to identify question blocks, options (A, B, C, D), correct answers, and detailed solutions.
- **Caching**: Compiles the parsed questions into a structured payload and saves it to `quiz_data/questions.json` to prevent re-parsing the PDFs on every server startup.

### `diagnostic.py`
A standalone debugging script used to evaluate the efficiency of the extraction logic. It uses `PyMuPDF` (`fitz`) to count occurrences of "QUESTION" markers and option patterns, comparing them against the finalized questions parsed by `quiz_loader.py` to identify missing or malformed questions.

### Frontend (`templates/`, `static/`, `docs/`)
- Uses standard Jinja2 templates (`base.html`, `index.html`) to render the user interface.
- Interactions during the quiz are handled dynamically via frontend JavaScript making AJAX calls to the Flask API endpoints.
- The `docs/` folder allows the static front-end to be deployed directly via GitHub Pages.

## Data Flow
1. **Extraction Phase**: On startup (or via script), `quiz_loader.py` scans the PDFs, extracts the text, normalizes it, and maps it to a JSON structure in `questions.json`.
2. **Initialization**: `app.py` loads `questions.json` into memory. 
3. **Quiz Session**: User selects years/sources on the frontend and starts the quiz. An API call creates a `QuizSession` tracking their progress.
4. **Interactive Quiz**: The user answers questions. State is validated on the backend. If an answer is wrong, the frontend requests an explanation from the Groq API via the backend.
5. **Completion**: Upon finishing, a breakdown of performance by source is generated and returned to the user.

## Infrastructure & Deployment
- **Dependencies**: Uses `Flask`, `gunicorn`, `pypdf`, and `groq` (implied by imports).
- **Deployment Ready**: The project is pre-configured for deployment on Render via `render.yaml` and Heroku/Generic PaaS via `Procfile`. It also includes a `Dockerfile` for containerized environments.
