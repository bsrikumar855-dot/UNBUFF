import type { PatternContent } from "../model.js";

/** Backtracking and dynamic programming. */
export const PATTERNS_3: PatternContent[] = [
  {
    id: "backtracking",
    name: "Backtracking: choose, explore, undo",
    topic: "Recursion and Backtracking",
    level: "intermediate",
    cues: ["generate all subsets, permutations or combinations", "all ways to place things under constraints (N-Queens, Sudoku)", "find every path or every valid string", "combinations that add up to a target", "the answer is a list of all solutions"],
    summary: "Build a solution one decision at a time. After exploring a choice, undo it and try the next, so one path array is reused for the whole search.",
    idea: [
      "Picture a decision tree. Each level makes one choice (take this element, put a queen in this column). A leaf is a complete solution. Backtracking is a depth-first walk of that tree.",
      "The loop has three steps: choose (append to the path), explore (recurse), un-choose (pop). Undoing keeps the shared path correct for the next sibling.",
      "Prune early: if a partial solution already breaks a rule (the sum exceeds the target, two queens attack), stop descending. Pruning is what makes it fast enough.",
      "Order the choices to avoid duplicates: for subsets and combinations pass a start index so you only look forward; for permutations track what is already used.",
      "Copy the path when you record a solution (path[:]), because the same list is mutated afterwards.",
    ],
    template: String.raw`def subsets(nums):
    out, path = [], []

    def go(start):
        out.append(path[:])                  # every partial path is itself a subset
        for i in range(start, len(nums)):
            path.append(nums[i])             # choose
            go(i + 1)                        # explore
            path.pop()                       # un-choose

    go(0)
    return out


def permutations(nums):
    out, path, used = [], [], [False] * len(nums)

    def go():
        if len(path) == len(nums):
            out.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            used[i] = True
            path.append(nums[i])
            go()
            path.pop()
            used[i] = False

    go()
    return out


def combination_sum(candidates, target):
    """All combinations (each number reusable) that add up to target."""
    cands = sorted(candidates)
    out, path = [], []

    def go(start, remaining):
        if remaining == 0:
            out.append(path[:])
            return
        for i in range(start, len(cands)):
            if cands[i] > remaining:
                break                        # prune: sorted, so nothing later fits either
            path.append(cands[i])
            go(i, remaining - cands[i])      # i, not i + 1: the same number may repeat
            path.pop()

    go(0, target)
    return out


def n_queens_count(n):
    cols, diag1, diag2 = set(), set(), set()

    def go(row):
        if row == n:
            return 1
        total = 0
        for c in range(n):
            if c in cols or row - c in diag1 or row + c in diag2:
                continue                      # prune: this square is attacked
            cols.add(c); diag1.add(row - c); diag2.add(row + c)
            total += go(row + 1)
            cols.remove(c); diag1.remove(row - c); diag2.remove(row + c)
        return total

    return go(0)`,
    check: String.raw`s = subsets([1, 2, 3])
assert len(s) == 8 and sorted(map(sorted, s)) == [[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]
assert subsets([]) == [[]]
p = permutations([1, 2, 3])
assert len(p) == 6 and sorted(p) == [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]
assert combination_sum([2, 3, 6, 7], 7) == [[2, 2, 3], [7]]
assert combination_sum([2], 1) == []
assert [n_queens_count(n) for n in (1, 4, 6, 8)] == [1, 2, 4, 92]`,
    complexity: { time: "Exponential in the worst case (for example O(n · 2ⁿ) for subsets, O(n!) for permutations); pruning cuts it sharply", space: "O(depth of the recursion) plus the output" },
    pitfalls: [
      "Appending the path itself instead of a copy, so every recorded answer ends up identical (and empty).",
      "Forgetting to undo a choice, so state leaks between branches.",
      "Duplicates in the input: sort first and skip a value equal to the one just tried at the same level.",
      "Not pruning. Without it, even small inputs can take forever.",
    ],
    variants: [
      { name: "Subsets and combinations", when: "A start index moves forward so each set is generated once." },
      { name: "Permutations", when: "Track which elements are used; every position tries every unused element." },
      { name: "Constraint satisfaction", when: "N-Queens, Sudoku: check constraints before descending." },
      { name: "Grid path search", when: "Word search: mark the cell visited, explore the four neighbours, then unmark." },
      { name: "Generate valid strings", when: "Parentheses: only add ( while opens remain, only add ) while closes would not exceed opens." },
    ],
    problems: [
      { title: "Subsets", slug: "subsets", difficulty: "medium", note: "Choose or skip each element.", practice_id: null },
      { title: "Permutations", slug: "permutations", difficulty: "medium", note: "Try every unused element at each position.", practice_id: null },
      { title: "Combination Sum", slug: "combination-sum", difficulty: "medium", note: "Reusable numbers with pruning.", practice_id: null },
      { title: "N-Queens", slug: "n-queens", difficulty: "hard", note: "Prune on columns and diagonals.", practice_id: null },
    ],
    related: ["dp-knapsack-coin", "tree-dfs", "grid-graph-dfs"],
  },
  {
    id: "dp-1d",
    name: "Dynamic Programming: one dimension",
    topic: "Dynamic Programming",
    level: "core",
    cues: ["count the number of ways to reach step n", "maximum you can collect with a rule about neighbours (cannot take adjacent)", "the answer for position i depends on the previous one or two answers", "decode or split a sequence in how many ways", "brute force recursion repeats the same sub-calls"],
    summary: "Define the answer for a prefix, write how it depends on smaller prefixes, and fill them in order. Each sub-problem is solved once.",
    idea: [
      "Dynamic programming is recursion without the repeated work. If a naive recursion recomputes the same sub-problems (Fibonacci does), store each result the first time and reuse it.",
      "A reliable recipe: (1) say in words what dp[i] means; (2) find the recurrence, how dp[i] follows from earlier values; (3) set the base cases; (4) fill in order; (5) read the answer. Step 1 is where most of the work is.",
      "When dp[i] only needs the last one or two values, keep just those variables and use O(1) space.",
      "Two styles give the same answer: top-down (recursion plus a cache) is easy to write; bottom-up (a loop) is usually faster and avoids recursion limits.",
    ],
    template: String.raw`def climb_stairs(n):
    """Ways to climb n steps taking 1 or 2 at a time."""
    prev, cur = 1, 1                  # ways to stand on step 0 and on step 1
    for _ in range(n - 1):
        prev, cur = cur, prev + cur   # ways(i) = ways(i - 1) + ways(i - 2)
    return cur


def house_robber(nums):
    """Largest sum with no two adjacent elements taken."""
    take, skip = 0, 0                 # best total if the last house is robbed / not robbed
    for x in nums:
        take, skip = skip + x, max(take, skip)
    return max(take, skip)


def decode_ways(s):
    """Ways to read a digit string as letters (1 = A ... 26 = Z)."""
    if not s or s[0] == "0":
        return 0
    prev, cur = 1, 1                  # ways for the empty prefix and for the first character
    for i in range(1, len(s)):
        ways = 0
        if s[i] != "0":
            ways += cur               # read s[i] as its own letter
        if 10 <= int(s[i - 1:i + 1]) <= 26:
            ways += prev              # read s[i-1:i+1] as one letter
        prev, cur = cur, ways
    return cur`,
    check: String.raw`assert [climb_stairs(n) for n in (1, 2, 3, 5)] == [1, 2, 3, 8]
assert house_robber([1, 2, 3, 1]) == 4
assert house_robber([2, 7, 9, 3, 1]) == 12
assert house_robber([]) == 0
assert house_robber([5]) == 5
assert decode_ways("12") == 2
assert decode_ways("226") == 3
assert decode_ways("06") == 0
assert decode_ways("10") == 1`,
    complexity: { time: "O(n)", space: "O(1) when only the last values are kept (O(n) with a full table)" },
    pitfalls: [
      "Starting to code before you can say what dp[i] means in a sentence.",
      "Wrong base cases, especially for n = 0 or an empty input.",
      "Off-by-one between the string index and the dp index.",
      "Adding up ways when the problem wants the maximum, or the reverse.",
    ],
    variants: [
      { name: "Fibonacci-style counting", when: "ways(i) = ways(i-1) + ways(i-2)." },
      { name: "Take or skip", when: "House robber: best ending in take versus skip." },
      { name: "Decode and partition", when: "At each position, try a one-character and a two-character piece." },
      { name: "Memoised recursion", when: "When the recurrence is easier to see top-down, add a cache." },
    ],
    problems: [
      { title: "Climbing Stairs", slug: "climbing-stairs", difficulty: "easy", note: "The simplest recurrence.", practice_id: "fp_015_stair_ways" },
      { title: "House Robber", slug: "house-robber", difficulty: "medium", note: "Take or skip, with a rule about neighbours.", practice_id: null },
      { title: "Decode Ways", slug: "decode-ways", difficulty: "medium", note: "One or two characters at a time.", practice_id: null },
      { title: "Stair Ways", slug: null, difficulty: "easy", note: "UNBLUFF graded: count the ways up a staircase.", practice_id: "fp_015_stair_ways" },
    ],
    related: ["kadane", "dp-knapsack-coin", "dp-grid"],
  },
  {
    id: "dp-knapsack-coin",
    name: "Dynamic Programming: knapsack and coin change",
    topic: "Dynamic Programming",
    level: "intermediate",
    cues: ["choose a subset under a weight or budget limit to maximise value", "fewest coins to make an amount", "number of ways to make a sum", "can the array be split into two equal halves", "each item used once (0/1) or any number of times (unbounded)"],
    summary: "dp[s] answers the question for budget s. Loop over items, and for each item update the budgets it can fit into.",
    idea: [
      "State: dp[s] is the best answer (minimum coins, maximum value, a count, or a yes/no) using the items processed so far for a budget of s.",
      "0/1 knapsack (each item once): iterate the budget downwards, so an item cannot be reused within its own round. Unbounded (coins, reusable): iterate upwards, so it can.",
      "Counting combinations versus orderings: put the coin loop on the outside to count each combination once; put the amount loop outside and the coin loop inside to count ordered sequences.",
      "Many problems are this in disguise: splitting an array into equal sum halves is a subset-sum question; target-sum is a subset-sum with a shifted target.",
    ],
    template: String.raw`def coin_change_min(coins, amount):
    """Fewest coins (each coin reusable) summing to amount, or -1."""
    INF = float("inf")
    best = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and best[a - c] + 1 < best[a]:
                best[a] = best[a - c] + 1
    return -1 if best[amount] == INF else best[amount]


def coin_ways(coins, amount):
    """Number of different combinations of coins (reusable) summing to amount."""
    ways = [1] + [0] * amount
    for c in coins:                        # coins outermost: each combination counted once
        for a in range(c, amount + 1):
            ways[a] += ways[a - c]
    return ways[amount]


def can_partition_equal(nums):
    """Can nums be split into two groups with the same sum?"""
    total = sum(nums)
    if total % 2:
        return False
    target = total // 2
    dp = [True] + [False] * target
    for x in nums:
        for s in range(target, x - 1, -1):     # downwards: each number used at most once
            dp[s] = dp[s] or dp[s - x]
    return dp[target]


def knapsack_01(weights, values, capacity):
    best = [0] * (capacity + 1)
    for w, v in zip(weights, values):
        for c in range(capacity, w - 1, -1):
            best[c] = max(best[c], best[c - w] + v)
    return best[capacity]`,
    check: String.raw`assert coin_change_min([1, 2, 5], 11) == 3
assert coin_change_min([2], 3) == -1
assert coin_change_min([1], 0) == 0
assert coin_ways([1, 2, 5], 5) == 4
assert coin_ways([2], 3) == 0
assert coin_ways([3], 0) == 1
assert can_partition_equal([1, 5, 11, 5])
assert not can_partition_equal([1, 2, 3, 5])
assert not can_partition_equal([1])
assert knapsack_01([1, 3, 4, 5], [1, 4, 5, 7], 7) == 9
assert knapsack_01([], [], 10) == 0`,
    complexity: { time: "O(items × budget)", space: "O(budget)" },
    pitfalls: [
      "Looping the budget upwards in a 0/1 problem, which lets one item be used many times.",
      "Mixing up the loop order for counting combinations versus ordered sequences.",
      "Using 0 as the \"impossible\" value for a minimum problem. Use infinity.",
      "Forgetting that the budget can be huge: this is pseudo-polynomial, fine for 10⁴ but not 10⁹.",
    ],
    variants: [
      { name: "Subset sum", when: "dp[s] is a boolean: can a subset reach s?" },
      { name: "Target sum (signs)", when: "Assign + or − to every number: count subsets with a shifted target." },
      { name: "Unbounded knapsack", when: "Items reusable: iterate the budget upwards." },
      { name: "Bounded knapsack", when: "Each item has a count: expand the copies or use binary splitting." },
    ],
    problems: [
      { title: "Coin Change", slug: "coin-change", difficulty: "medium", note: "Minimum coins, reusable.", practice_id: "fp_005_coin_ways" },
      { title: "Partition Equal Subset Sum", slug: "partition-equal-subset-sum", difficulty: "medium", note: "A subset-sum yes/no.", practice_id: null },
      { title: "Target Sum", slug: "target-sum", difficulty: "medium", note: "Assign signs; count the ways.", practice_id: null },
      { title: "Coin Ways", slug: null, difficulty: "medium", note: "UNBLUFF graded: count the ways to make an amount.", practice_id: "fp_005_coin_ways" },
      { title: "Knapsack Value", slug: null, difficulty: "medium", note: "UNBLUFF graded: the best value within a weight limit.", practice_id: "fp_025_knapsack_value" },
    ],
    related: ["dp-1d", "binary-search-on-answer", "backtracking"],
  },
  {
    id: "dp-strings",
    name: "Dynamic Programming: two strings",
    topic: "Dynamic Programming",
    level: "intermediate",
    cues: ["longest common subsequence", "minimum edits (insert, delete, replace) to turn one string into another", "longest palindromic subsequence or substring", "match or interleave two strings", "the answer depends on prefixes of both strings"],
    summary: "dp[i][j] answers the question for the first i characters of one string and the first j of the other, and each cell looks only at its neighbours.",
    idea: [
      "Make a table with one row per prefix of the first string and one column per prefix of the second. Cell (i, j) is the answer for a[:i] and b[:j].",
      "Look at the last characters. If they match, the answer extends the diagonal cell (LCS: +1; edit distance: +0). If not, you choose between the cells above, to the left and diagonal, each representing one operation.",
      "Row 0 and column 0 are the base cases, where one string is empty: LCS 0, edit distance equal to the other string's length.",
      "Each row only needs the previous row, so memory can drop from O(n·m) to O(m).",
      "Longest palindromic subsequence is the LCS of a string with its reverse.",
    ],
    template: String.raw`def lcs_length(a, b):
    """Length of the longest common subsequence."""
    prev = [0] * (len(b) + 1)
    for i in range(1, len(a) + 1):
        cur = [0] * (len(b) + 1)
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                cur[j] = prev[j - 1] + 1               # extend the diagonal
            else:
                cur[j] = max(prev[j], cur[j - 1])      # drop a character from either string
        prev = cur
    return prev[len(b)]


def edit_distance(a, b):
    """Fewest single-character insertions, deletions and replacements to turn a into b."""
    prev = list(range(len(b) + 1))                     # "" -> b[:j] takes j insertions
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)                       # a[:i] -> "" takes i deletions
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                cur[j] = prev[j - 1]
            else:
                cur[j] = 1 + min(prev[j - 1], prev[j], cur[j - 1])   # replace, delete, insert
        prev = cur
    return prev[len(b)]


def longest_palindromic_subsequence(s):
    return lcs_length(s, s[::-1])`,
    check: String.raw`assert lcs_length("abcde", "ace") == 3
assert lcs_length("abc", "def") == 0
assert lcs_length("", "abc") == 0
assert edit_distance("horse", "ros") == 3
assert edit_distance("intention", "execution") == 5
assert edit_distance("", "abc") == 3
assert edit_distance("same", "same") == 0
assert longest_palindromic_subsequence("bbbab") == 4
assert longest_palindromic_subsequence("cbbd") == 2`,
    complexity: { time: "O(n × m)", space: "O(m) with two rolling rows (O(n × m) for the full table)" },
    pitfalls: [
      "Mixing up the table index (prefix length) and the string index: a[i - 1] pairs with row i.",
      "Wrong base row and column for edit distance (they are lengths, not zeros).",
      "Confusing subsequence (gaps allowed) with substring (contiguous): the recurrences differ.",
      "Rolling arrays: you must read prev[j - 1] before it is overwritten.",
    ],
    variants: [
      { name: "Shortest common supersequence", when: "Length = len(a) + len(b) − LCS." },
      { name: "Minimum insertions to make a palindrome", when: "len(s) − longest palindromic subsequence." },
      { name: "Distinct subsequences, wildcard matching", when: "The same two-index table with a different transition." },
      { name: "Reconstruct the answer", when: "Keep the full table and walk back from the corner." },
    ],
    problems: [
      { title: "Longest Common Subsequence", slug: "longest-common-subsequence", difficulty: "medium", note: "The base case of the family.", practice_id: null },
      { title: "Edit Distance", slug: "edit-distance", difficulty: "medium", note: "Replace, delete or insert.", practice_id: "fp_010_edit_cost" },
      { title: "Longest Palindromic Subsequence", slug: "longest-palindromic-subsequence", difficulty: "medium", note: "LCS with the reversed string.", practice_id: null },
      { title: "Edit Cost", slug: null, difficulty: "hard", note: "UNBLUFF graded: the cheapest way to turn one string into another.", practice_id: "fp_010_edit_cost" },
    ],
    related: ["dp-knapsack-coin", "dp-lis", "dp-grid"],
  },
  {
    id: "dp-lis",
    name: "Longest Increasing Subsequence",
    topic: "Dynamic Programming",
    level: "advanced",
    cues: ["longest strictly increasing subsequence", "stack envelopes or boxes inside each other", "minimum number of non-increasing runs to cover a sequence", "keep order, drop elements, so values rise", "n up to 10⁵ so O(n²) is too slow"],
    summary: "O(n²) by DP over ending positions, or O(n log n) by keeping, for each length, the smallest tail value and binary searching it.",
    idea: [
      "Simple DP: best[i] is the length of the longest increasing subsequence ending exactly at i. Look back at every j < i with nums[j] < nums[i]: best[i] = 1 + max(best[j]). The answer is the largest best[i]. That is O(n²).",
      "Faster: tails[k] holds the smallest possible last value of any increasing subsequence of length k + 1 seen so far. tails is always sorted, so for each new value, binary search for where it belongs: replace the first tail that is >= it, or append if it is larger than all of them.",
      "The length of tails is the answer. (tails itself is not necessarily a real subsequence, only a record of best endings.)",
      "Use bisect_left for strictly increasing and bisect_right for non-decreasing.",
    ],
    template: String.raw`from bisect import bisect_left


def lis_length(nums):
    """Length of the longest strictly increasing subsequence, in O(n log n)."""
    tails = []                          # tails[k]: smallest last value of an increasing run of length k + 1
    for x in nums:
        i = bisect_left(tails, x)       # first tail >= x
        if i == len(tails):
            tails.append(x)             # x extends the longest run
        else:
            tails[i] = x                # x is a smaller ending for runs of length i + 1
    return len(tails)


def lis_length_quadratic(nums):
    """The same answer in O(n^2): best[i] = longest run ending exactly at i."""
    best = [1] * len(nums)
    for i in range(len(nums)):
        for j in range(i):
            if nums[j] < nums[i]:
                best[i] = max(best[i], best[j] + 1)
    return max(best, default=0)`,
    check: String.raw`cases = [([10, 9, 2, 5, 3, 7, 101, 18], 4), ([0, 1, 0, 3, 2, 3], 4), ([7, 7, 7, 7], 1), ([], 0), ([1, 2, 3, 4], 4), ([4, 3, 2, 1], 1)]
for nums, expected in cases:
    assert lis_length(nums) == expected, nums
    assert lis_length_quadratic(nums) == expected, nums`,
    complexity: { time: "O(n log n) with binary search; O(n²) with plain DP", space: "O(n)" },
    pitfalls: [
      "Treating tails as the actual subsequence. Only its length is meaningful.",
      "Using bisect_right for a strictly increasing problem, which counts equal values as extending.",
      "Mixing up subsequence (not contiguous) with subarray (contiguous).",
      "Reconstructing the subsequence needs extra bookkeeping (predecessor links); the length alone does not.",
    ],
    variants: [
      { name: "Russian doll envelopes", when: "Sort by width ascending and height descending for equal widths, then LIS on heights." },
      { name: "Longest non-decreasing", when: "Use bisect_right." },
      { name: "Count the number of LIS", when: "Track counts alongside lengths in the O(n²) DP." },
      { name: "Minimum deletions to make sorted", when: "n − LIS." },
    ],
    problems: [
      { title: "Longest Increasing Subsequence", slug: "longest-increasing-subsequence", difficulty: "medium", note: "The definition of the pattern.", practice_id: "fp_028_rising_chain" },
      { title: "Russian Doll Envelopes", slug: "russian-doll-envelopes", difficulty: "hard", note: "Sort two dimensions into one LIS.", practice_id: null },
      { title: "Increasing Triplet Subsequence", slug: "increasing-triplet-subsequence", difficulty: "medium", note: "LIS capped at length 3: two tails are enough.", practice_id: null },
      { title: "Rising Chain", slug: null, difficulty: "hard", note: "UNBLUFF graded: the longest increasing subsequence.", practice_id: "fp_028_rising_chain" },
    ],
    related: ["dp-strings", "binary-search-boundary", "kadane"],
  },
  {
    id: "dp-grid",
    name: "Dynamic Programming: grids",
    topic: "Dynamic Programming",
    level: "core",
    cues: ["number of paths from the top-left to the bottom-right moving only right or down", "minimum or maximum path sum through a grid", "obstacles on the path", "the answer for a cell depends on the cell above and the cell to the left", "triangle or matrix with a movement rule"],
    summary: "Each cell's answer comes from the cells you could have arrived from. Fill the grid row by row, and only the previous row is needed.",
    idea: [
      "If you can only move right or down, you reach a cell from above or from the left. So paths(r, c) = paths(r−1, c) + paths(r, c−1), and best(r, c) = grid[r][c] + min(best(r−1, c), best(r, c−1)).",
      "The first row and first column are base cases because they have only one way in.",
      "Obstacles simply zero out a cell's path count. Different moves (diagonals, left) change which neighbours you combine, but the shape of the solution stays the same.",
      "A single row array updated left to right (row[c] += row[c − 1]) is enough, because row[c] already holds the value from above.",
    ],
    template: String.raw`def unique_paths(rows, cols):
    """Paths from the top-left to the bottom-right moving only right or down."""
    row = [1] * cols                       # the first row: one way to reach each cell
    for _ in range(1, rows):
        for c in range(1, cols):
            row[c] += row[c - 1]           # from above (already in row[c]) plus from the left
    return row[-1]


def min_path_sum(grid):
    """Smallest sum of values on a path from the top-left to the bottom-right (right or down moves)."""
    rows, cols = len(grid), len(grid[0])
    best = [float("inf")] * cols
    best[0] = 0
    for r in range(rows):
        for c in range(cols):
            if c == 0:
                best[c] += grid[r][c]                              # only from above
            else:
                best[c] = min(best[c], best[c - 1]) + grid[r][c]   # from above or from the left
    return best[-1]`,
    check: String.raw`assert unique_paths(3, 7) == 28
assert unique_paths(3, 2) == 3
assert unique_paths(1, 1) == 1
assert unique_paths(1, 5) == 1
assert min_path_sum([[1, 3, 1], [1, 5, 1], [4, 2, 1]]) == 7
assert min_path_sum([[1, 2, 3], [4, 5, 6]]) == 12
assert min_path_sum([[5]]) == 5`,
    complexity: { time: "O(rows × cols)", space: "O(cols) with one rolling row" },
    pitfalls: [
      "Wrong base row and column. Fill them first, or special-case them as above.",
      "Using a minimum with a base value of 0 for unreachable cells; use infinity.",
      "Updating a rolling row in the wrong direction and reading a value you already overwrote.",
      "Counting paths with huge grids: the answer can overflow fixed-width integers.",
    ],
    variants: [
      { name: "Unique paths with obstacles", when: "Set an obstacle cell's count to 0." },
      { name: "Triangle minimum path", when: "Each cell connects to two cells in the next row." },
      { name: "Maximal square", when: "dp[r][c] = 1 + min(up, left, up-left) when the cell is 1." },
      { name: "Cherry pickup, dungeon game", when: "Two walkers or a backwards fill; the same skeleton with a twist." },
    ],
    problems: [
      { title: "Unique Paths", slug: "unique-paths", difficulty: "medium", note: "Add the cell above and the cell to the left.", practice_id: null },
      { title: "Minimum Path Sum", slug: "minimum-path-sum", difficulty: "medium", note: "Take the cheaper of the two ways in.", practice_id: null },
      { title: "Triangle", slug: "triangle", difficulty: "medium", note: "A grid that narrows.", practice_id: null },
      { title: "Maximal Square", slug: "maximal-square", difficulty: "medium", note: "Min of three neighbours plus one.", practice_id: null },
    ],
    related: ["dp-1d", "dp-strings", "bfs-shortest-path"],
  },
];
