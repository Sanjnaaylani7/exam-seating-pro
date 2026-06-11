"""
app.py  —  Flask Backend for Exam Seating CSP System
=====================================================
Routes:
  GET  /              → Home page
  GET  /seating        → Seating app page
  POST /api/solve      → Run CSP solver, return JSON result
  POST /api/upload     → Parse uploaded Excel, return student list
"""

import os, json, io
from flask import Flask, render_template, request, jsonify
import pandas as pd
from csp_solver import CSPSolver, distribute_students

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload

# ── Pages ─────────────────────────────────────────────────────

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/seating')
def seating():
    return render_template('seating.html')

# ── API: Upload Excel ─────────────────────────────────────────

@app.route('/api/upload', methods=['POST'])
def upload():
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({'error': 'No file provided'}), 400

        name = file.filename.lower()
        if name.endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)

        # Flexible column matching
        def find_col(df, *keywords):
            for kw in keywords:
                for col in df.columns:
                    if kw.lower().replace(' ','') in col.lower().replace(' ','').replace('_','').replace('-',''):
                        return col
            return None

        col_name = find_col(df, 'name', 'student')
        col_roll = find_col(df, 'roll', 'id', 'regno')
        col_course = find_col(df, 'course', 'subject', 'code')
        col_sec = find_col(df, 'section', 'sec', 'class')
        col_batch = find_col(df, 'batch', 'year', 'intake')
        col_dept = find_col(df, 'department', 'dept', 'faculty', 'program')

        if not col_name:
            return jsonify({'error': f'Name column not found. Found columns: {list(df.columns)}'}), 400

        students = []
        for _, row in df.iterrows():
            name = str(row.get(col_name, '') if col_name else '').strip()
            if not name or name == 'nan':
                continue
            students.append({
                'name'      : name,
                'rollNo'    : str(row.get(col_roll, '')    if col_roll   else '').strip(),
                'course'    : str(row.get(col_course, '')  if col_course else '').strip(),
                'section'   : str(row.get(col_sec, '')     if col_sec    else '').strip(),
                'batch'     : str(row.get(col_batch, '')   if col_batch  else '').strip(),
                'department': str(row.get(col_dept, '')    if col_dept   else '').strip(),
            })

        if not students:
            return jsonify({'error': 'No valid student rows found'}), 400

        courses  = list({s['course']  for s in students if s['course']})
        sections = list({s['section'] for s in students if s['section']})
        depts    = list({s['department'] for s in students if s['department']})

        return jsonify({
            'students': students,
            'summary' : {
                'total'   : len(students),
                'courses' : courses,
                'sections': sections,
                'depts'   : depts,
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── API: Solve ────────────────────────────────────────────────

@app.route('/api/solve', methods=['POST'])
def solve():
    try:
        data      = request.get_json()
        students  = data.get('students', [])
        rows      = int(data.get('rows', 5))
        cols      = int(data.get('cols', 10))
        num_rooms = int(data.get('numRooms', 1))

        if not students:
            return jsonify({'error': 'No students provided'}), 400

        seats_per_room = rows * cols
        total_cap      = num_rooms * seats_per_room

        if len(students) > total_cap:
            return jsonify({
                'error': f'Not enough seats! {len(students)} students but only {total_cap} seats ({num_rooms} rooms × {seats_per_room}).'
            }), 400

        # Distribute students across rooms
        room_lists = distribute_students(students, num_rooms, seats_per_room)

        rooms_output = []
        total_placed = 0
        all_solved   = True

        for ri, room_students in enumerate(room_lists):
            if not room_students:
                rooms_output.append({
                    'room'    : ri + 1,
                    'solved'  : True,
                    'students': [],
                    'grid'    : [],
                    'stats'   : {},
                })
                continue

            solver = CSPSolver(room_students, rows, cols)
            ok     = solver.solve()
            stats  = solver.get_stats()
            result = solver.get_result()

            if not ok:
                all_solved = False

            total_placed += stats['placed']

            rooms_output.append({
                'room'   : ri + 1,
                'solved' : ok,
                'grid'   : result,
                'stats'  : stats,
            })

        return jsonify({
            'success'     : all_solved,
            'rooms'       : rooms_output,
            'totalPlaced' : total_placed,
            'totalStudents': len(students),
            'numRooms'    : num_rooms,
            'rows'        : rows,
            'cols'        : cols,
        })

    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


# ── Run ───────────────────────────────────────────────────────

if __name__ == '__main__':
    print("\n" + "="*50)
    print("  ExamSeat CSP  —  FAST NUCES Karachi")
    print("  Open: http://127.0.0.1:5000")
    print("="*50 + "\n")
    app.run(debug=True, port=5000)
