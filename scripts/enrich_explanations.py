import os
import json
import time
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuration
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "quiz_data" / "questions.json"
OLLAMA_MODEL = "llama3" 
OLLAMA_URL = "http://localhost:11434/api/generate"
MAX_WORKERS = 4  # Slightly more workers

def fetch_explanation_ollama(question_data):
    prompt = f"""Question: {question_data['question']}
Options:
A) {question_data['options'].get('a', 'N/A')}
B) {question_data['options'].get('b', 'N/A')}
C) {question_data['options'].get('c', 'N/A')}
D) {question_data['options'].get('d', 'N/A')}

Correct Answer: {question_data['answer'].upper()}

Briefly explain why this answer is correct. Be extremely concise (2 sentences max). Focus on the core technical reason."""

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": 60, # Reduced to speed up
            "temperature": 0.3
        }
    }

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(OLLAMA_URL, data=data, headers={'Content-Type': 'application/json'})

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result.get("response", "").strip()
    except Exception as e:
        # print(f"Error calling Ollama for {question_data['id']}: {e}")
        return None

def push_to_github():
    print("\nPushing changes to GitHub...")
    if not os.path.exists(os.path.join(PROJECT_ROOT, ".git")):
        print("Not a git repository. Skipping push.")
        return
        
    try:
        os.system("git add .")
        os.system('git commit -m "feat: complete AI explanations for all questions"')
        os.system("git push")
        print("Successfully pushed to GitHub!")
    except Exception as e:
        print(f"Failed to push to GitHub: {e}")

def main():
    if not DATA_PATH.exists():
        print(f"Data file not found at {DATA_PATH}")
        return

    with open(DATA_PATH, "r") as f:
        data = json.load(f)

    questions = data.get("questions", [])
    total = len(questions)
    
    indices_to_process = [i for i, q in enumerate(questions) if not q.get("explanation")]
    to_process = [questions[i] for i in indices_to_process]
    
    already_done = total - len(to_process)
    newly_updated = 0

    print(f"Total Questions: {total}")
    print(f"Already Completed: {already_done}")
    print(f"Remaining: {len(to_process)}")

    if not to_process:
        print("Everything is already up to date!")
        return

    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_index = {
                executor.submit(fetch_explanation_ollama, q): idx 
                for idx, q in zip(indices_to_process, to_process)
            }
            
            completed = 0
            for future in as_completed(future_to_index):
                idx = future_to_index[future]
                q_id = questions[idx]['id']
                completed += 1
                
                try:
                    explanation = future.result()
                    if explanation:
                        questions[idx]["explanation"] = explanation
                        newly_updated += 1
                        print(f"[{completed}/{len(to_process)}] Success: {q_id}")
                    else:
                        print(f"[{completed}/{len(to_process)}] Failed: {q_id}")
                except Exception as e:
                    print(f"[{completed}/{len(to_process)}] Exception for {q_id}: {e}")

                # Save frequently
                if newly_updated % 2 == 0:
                    with open(DATA_PATH, "w") as f:
                        json.dump(data, f, indent=2)

    except KeyboardInterrupt:
        print("\nInterrupted. Saving progress...")
    finally:
        with open(DATA_PATH, "w") as f:
            json.dump(data, f, indent=2)

    print(f"\nDone! Newly Updated: {newly_updated}")
    
    if newly_updated > 0:
        push_to_github()

if __name__ == "__main__":
    main()
