import re
import fitz  # PyMuPDF
from quiz_loader import parse_questions_from_pdf
from collections import Counter
from pathlib import Path

def diagnostic(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    
    # 1. Total QUESTION markers
    question_markers = len(re.findall(r'QUESTION', text, re.IGNORECASE))
    
    # 2. Finalized question count
    questions = parse_questions_from_pdf(Path(pdf_path), "test_id", "test_label")
    finalized_count = len(questions)
    
    # 3. Distribution of option-marker formats
    patterns = {
        'a.': len(re.findall(r'\ba\.', text, re.IGNORECASE)),
        'a)': len(re.findall(r'\ba\)', text, re.IGNORECASE)),
        '(a)': len(re.findall(r'\(a\)', text, re.IGNORECASE)),
        'a .': len(re.findall(r'\ba \.', text, re.IGNORECASE)),
    }
    
    # 4. Count of QUESTION blocks that have answer but missing at least one of a/b/c/d options.
    blocks = re.split(r'QUESTION', text, flags=re.IGNORECASE)[1:]
    missing_options_with_answer = 0
    for block in blocks:
        has_answer = re.search(r'Answer:', block, re.IGNORECASE)
        has_a = re.search(r'\ba[.)]', block, re.IGNORECASE) or re.search(r'\(a\)', block, re.IGNORECASE)
        has_b = re.search(r'\bb[.)]', block, re.IGNORECASE) or re.search(r'\(b\)', block, re.IGNORECASE)
        has_c = re.search(r'\bc[.)]', block, re.IGNORECASE) or re.search(r'\(c\)', block, re.IGNORECASE)
        has_d = re.search(r'\bd[.)]', block, re.IGNORECASE) or re.search(r'\(d\)', block, re.IGNORECASE)
        
        if has_answer and not (has_a and has_b and has_c and has_d):
            missing_options_with_answer += 1
            
    return {
        "markers": question_markers,
        "finalized": finalized_count,
        "patterns": patterns,
        "missing_options": missing_options_with_answer
    }

files = ["2024 iiot.pdf", "2026 iiot assignments.pdf", "2025 iiot assignments.pdf"]
for f in files:
    try:
        res = diagnostic(f)
        print(f"{f}:")
        print(f"  Markers: {res['markers']}")
        print(f"  Finalized: {res['finalized']}")
        print(f"  Patterns: {res['patterns']}")
        print(f"  Missing Options: {res['missing_options']}")
    except Exception as e:
        print(f"Error processing {f}: {e}")
