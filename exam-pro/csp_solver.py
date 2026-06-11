"""
csp_solver.py  —  Exam Seating CSP Solver (Python)
===================================================
Variables  : Students (each must be assigned exactly one seat)
Domains    : Available seat positions in the hall grid
Constraints:
  1. Same course  + same section  → NOT adjacent (8-directional)
  2. Same course  + same batch    → NOT adjacent
  3. Same name (duplicate/twins)  → NOT adjacent

Techniques:
  - MRV  (Minimum Remaining Values) heuristic
  - LCV  (Least Constraining Value) heuristic
  - Forward Checking
  - Backtracking Search
"""

import random
from typing import List, Dict, Optional, Tuple


class CSPSolver:
    MAX_CALLS = 500_000

    def __init__(self, students: List[Dict], rows: int, cols: int):
        self.students  = students
        self.rows      = rows
        self.cols      = cols
        self.total     = rows * cols
        self.grid      = [-1] * self.total   # grid[seat] = student_index | -1

        # stats
        self.calls      = 0
        self.backtracks = 0
        self.assignments = 0
        self.solved     = False

    # ── helpers ──────────────────────────────────────────────

    def _idx(self, r, c):  return r * self.cols + c
    def _row(self, i):     return i // self.cols
    def _col(self, i):     return i %  self.cols

    def _neighbours(self, i: int) -> List[int]:
        r, c = self._row(i), self._col(i)
        ns = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                nr, nc = r + dr, c + dc
                if 0 <= nr < self.rows and 0 <= nc < self.cols:
                    ns.append(self._idx(nr, nc))
        return ns

    @staticmethod
    def _n(s, field): return (s.get(field) or '').strip().lower()

    def _conflicts(self, a: Dict, b: Dict) -> bool:
        """True if placing a and b adjacent violates any constraint."""
        if not a or not b:
            return False
        # Rule 1: same course + same section
        if self._n(a,'course') and self._n(a,'course') == self._n(b,'course'):
            if self._n(a,'section') and self._n(a,'section') == self._n(b,'section'):
                return True
        # Rule 2: same course + same batch
        if self._n(a,'course') and self._n(a,'course') == self._n(b,'course'):
            if self._n(a,'batch') and self._n(a,'batch') == self._n(b,'batch'):
                return True
        # Rule 3: same name
        if self._n(a,'name') and self._n(a,'name') == self._n(b,'name'):
            return True
        return False

    def _can_place(self, si: int, seat: int) -> bool:
        student = self.students[si]
        for n in self._neighbours(seat):
            ni = self.grid[n]
            if ni != -1 and self._conflicts(student, self.students[ni]):
                return False
        return True

    def _valid_seats(self, si: int, available: List[int]) -> List[int]:
        return [s for s in available if self._can_place(si, s)]

    # ── MRV ──────────────────────────────────────────────────

    def _mrv_select(self, remaining: List[int], available: List[int]) -> int:
        best_si, best_count = remaining[0], float('inf')
        for si in remaining:
            count = sum(1 for s in available if self._can_place(si, s))
            if count < best_count:
                best_count, best_si = count, si
                if count == 0:
                    break
        return best_si

    # ── LCV ──────────────────────────────────────────────────

    def _lcv_order(self, si: int, seats: List[int],
                   remaining: List[int], available: List[int]) -> List[int]:
        if len(seats) <= 1:
            return seats
        sample = [x for x in remaining if x != si][:6]

        def score(seat):
            self.grid[seat] = si
            new_avail = [s for s in available if s != seat]
            elim = sum(
                1 for other in sample
                for s in new_avail
                if not self._can_place(other, s)
            )
            self.grid[seat] = -1
            return elim

        return sorted(seats, key=score)

    # ── Forward Checking ─────────────────────────────────────

    def _forward_check(self, remaining: List[int], available: List[int]) -> bool:
        for si in remaining:
            if not any(self._can_place(si, s) for s in available):
                return False
        return True

    # ── Backtracking ─────────────────────────────────────────

    def _backtrack(self, remaining: List[int], available: List[int]) -> bool:
        self.calls += 1
        if self.calls > self.MAX_CALLS:
            return False
        if not remaining:
            return True
        if len(available) < len(remaining):
            return False

        si      = self._mrv_select(remaining, available)
        seats   = self._valid_seats(si, available)
        if not seats:
            return False

        seats   = self._lcv_order(si, seats, remaining, available)
        new_rem = [x for x in remaining if x != si]

        for seat in seats:
            self.grid[seat] = si
            self.assignments += 1
            new_avail = [s for s in available if s != seat]

            if self._forward_check(new_rem, new_avail):
                if self._backtrack(new_rem, new_avail):
                    return True

            self.grid[seat] = -1
            self.backtracks += 1

        return False

    # ── Public ───────────────────────────────────────────────

    def solve(self) -> bool:
        # Sort by course frequency desc (most common students first → MRV works better)
        from collections import Counter
        freq = Counter(self._n(s, 'course') for s in self.students)
        indices = sorted(range(len(self.students)),
                         key=lambda i: -freq[self._n(self.students[i], 'course')])

        all_seats = list(range(self.total))
        self.solved = self._backtrack(indices, all_seats)
        return self.solved

    def get_result(self) -> List[Optional[Dict]]:
        """Returns flat grid list: student dict or None for each seat."""
        out = []
        for r in range(self.rows):
            for c in range(self.cols):
                idx = self._idx(r, c)
                si  = self.grid[idx]
                if si == -1:
                    out.append(None)
                else:
                    s = dict(self.students[si])
                    s['seat_row'] = r + 1
                    s['seat_col'] = c + 1
                    out.append(s)
        return out

    def get_stats(self) -> Dict:
        return {
            'solved'      : self.solved,
            'calls'       : self.calls,
            'backtracks'  : self.backtracks,
            'assignments' : self.assignments,
            'placed'      : sum(1 for x in self.grid if x != -1),
            'total_students': len(self.students),
            'total_seats' : self.total,
        }


# ── Distributor ───────────────────────────────────────────────

def distribute_students(students: List[Dict], num_rooms: int, seats_per_room: int):
    """
    Spread students across rooms so same course+section are in different rooms.
    Returns list of lists (one per room).
    """
    total_cap = num_rooms * seats_per_room
    if len(students) > total_cap:
        raise ValueError(
            f"Not enough seats! {len(students)} students but only "
            f"{total_cap} seats ({num_rooms} rooms × {seats_per_room})."
        )

    # Group by course+section
    from collections import defaultdict
    groups = defaultdict(list)
    for s in students:
        key = f"{(s.get('course') or '').lower()}_{(s.get('section') or '').lower()}"
        groups[key].append(s)

    # Sort groups by size descending
    sorted_groups = sorted(groups.values(), key=len, reverse=True)

    rooms  = [[] for _ in range(num_rooms)]
    counts = [0] * num_rooms

    for group in sorted_groups:
        start = counts.index(min(counts))
        for i, student in enumerate(group):
            placed = False
            for offset in range(num_rooms):
                ri = (start + i + offset) % num_rooms
                if counts[ri] < seats_per_room:
                    rooms[ri].append(student)
                    counts[ri] += 1
                    placed = True
                    break
            if not placed:
                break

    return rooms
