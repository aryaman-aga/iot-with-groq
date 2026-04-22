# IIOT Quiz Website

A production-ready quiz web app generated from your 3 IIOT PDF assignment files.

## Features

- Extracts MCQ questions from:
  - `2024 iiot.pdf`
  - `2026 iiot assignments.pdf`
  - `Merged IIOT Assignments.pdf`
- Year/source-wise question selection
- Shuffle or non-shuffle mode
- Instant correctness feedback after each answer
- Running score + final score with per-source breakdown
- Responsive, modern UI
- Deployment-ready with `gunicorn`, `Procfile`, `Dockerfile`, and `render.yaml`

## Local Run (venv)

1. Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. (Optional) Regenerate extracted quiz data:

```bash
python scripts/extract_questions.py
```

4. Run the app:

```bash
python app.py
```

Open: http://127.0.0.1:5000

## Production Run

```bash
gunicorn --bind 0.0.0.0:5000 app:app
```

## GitHub Pages (Static Publish)

This repository includes a static build under `docs/` so you can publish it directly with GitHub Pages.

### One-time setup

1. Create an empty repository on GitHub.
2. Add your GitHub repository as remote and push:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git add .
git commit -m "Initial quiz website"
git push -u origin main
```

3. In your GitHub repository:
   - Go to **Settings** -> **Pages**
   - Under **Build and deployment**, choose:
     - **Source**: Deploy from a branch
     - **Branch**: `main`
     - **Folder**: `/docs`
   - Click **Save**

4. Wait for deployment, then open:

```text
https://<your-username>.github.io/<your-repo>/
```

### Updating after changes

```bash
git add .
git commit -m "Update quiz app"
git push
```

GitHub Pages will auto-redeploy from `main/docs`.

## Deploy on Render

1. Push this folder to GitHub.
2. In Render, create **New Web Service** from the repository.
3. Render can auto-detect `render.yaml`, or use:
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn --bind 0.0.0.0:$PORT app:app`

## Project Structure

- `app.py` - Flask app, quiz APIs, scoring/session flow
- `quiz_loader.py` - PDF parsing and question data generation
- `scripts/extract_questions.py` - manual extraction command
- `templates/` - HTML templates
- `static/` - CSS/JS assets
- `quiz_data/questions.json` - extracted question bank
