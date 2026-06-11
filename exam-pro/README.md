# ExamSeat CSP — University Exam Seating System
## AI-2002 Semester Project | FAST NUCES Karachi | BCS-6J


---

## How to Run

### Step 1 — Install Python libraries
Open terminal/cmd in this folder and run:
```
pip install flask pandas openpyxl xlrd
```

### Step 2 — Start the server
```
python app.py
```

### Step 3 — Open browser
Go to: **http://127.0.0.1:5000**

You'll see the Home Page. Click **"Launch Seating System"** to open the app.

---

## Project Structure
```
exam-seating-pro/
├── app.py              ← Flask web server (backend)
├── csp_solver.py       ← AI algorithm (CSP + MRV + LCV + FC)
├── requirements.txt    ← Python dependencies
│
├── templates/
│   ├── home.html       ← Landing page
│   └── seating.html    ← Main seating app
│
└── static/
    ├── css/seating.css ← Styles
    └── js/seating.js   ← Frontend logic
```

---

## Excel Format
Your student Excel file should have these columns (names flexible):
| Name | Roll No | Course | Section | Batch | Department |
|------|---------|--------|---------|-------|------------|
| sam | 23K-0001 | CS301 | BCS-6J | 2023 | CS |

---

## Algorithm
- **Variables:** Students (each must sit in exactly one seat)
- **Domain:** Available seat positions
- **Constraints:** Same Course+Section, Same Course+Batch, Same Name → cannot be adjacent (8 directions)
- **MRV:** Most constrained student assigned first
- **LCV:** Least eliminating seat chosen first
- **Forward Checking:** Prune invalid seats early
- **Backtracking:** Undo bad assignments and retry
