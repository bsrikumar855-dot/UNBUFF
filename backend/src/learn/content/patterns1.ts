import type { PatternContent } from "../model.js";

/** Arrays, strings and searching. */
export const PATTERNS_1: PatternContent[] = [
  {
    id: "two-pointers-opposite",
    name: "Two Pointers: opposite ends",
    topic: "Arrays and Strings",
    level: "core",
    cues: ["sorted array and a pair or triplet that must hit a target", "palindrome or mirror check", "maximise the area, width or distance between two positions", "reverse or compare from both ends"],
    summary: "Start one pointer at each end and move them toward each other, using what you just saw to decide which one moves.",
    idea: [
      "A brute-force pair search tries every (i, j), which is O(n²). When the array is sorted, one comparison tells you something about many pairs at once.",
      "Put lo at the start and hi at the end. If the pair is too small, no pair using this lo and anything at or left of hi can work, so lo moves right. If it is too large, hi moves left. Every step discards a whole row of pairs, so the loop is O(n).",
      "The same shape works without sorting when a different fact justifies the move: for a palindrome, equal ends let you step inward; for the water-container problem, the shorter wall can never do better with a narrower gap, so you move the shorter one.",
      "For three numbers, fix one with an outer loop and run the pair search on the rest: O(n²) overall.",
    ],
    template: String.raw`def pair_with_sum(nums, target):
    """nums is sorted ascending. Return (i, j) with i < j and nums[i] + nums[j] == target, or None."""
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return lo, hi
        if s < target:
            lo += 1      # too small: only a bigger left value can help
        else:
            hi -= 1      # too big: only a smaller right value can help
    return None`,
    check: String.raw`assert pair_with_sum([1, 2, 4, 7, 11], 9) == (1, 3)
assert pair_with_sum([1, 2, 3], 10) is None
assert pair_with_sum([], 1) is None
assert pair_with_sum([5, 5], 10) == (0, 1)`,
    complexity: { time: "O(n) after sorting (O(n log n) if you sort first)", space: "O(1)" },
    pitfalls: [
      "Using it on an unsorted array without sorting first. The reasoning \"too small, so move lo\" only holds when the array is ordered.",
      "Writing lo <= hi. That lets a pointer pair with itself; use lo < hi when you need two different elements.",
      "In 3Sum, forgetting to skip equal values after a match, which returns duplicate triplets.",
      "Moving both pointers on a match when the problem asks for all pairs: skip duplicates first, then move.",
    ],
    variants: [
      { name: "Palindrome check", when: "Compare s[lo] and s[hi]; skip non-letters on each side." },
      { name: "Container with most water", when: "Move the shorter wall: a narrower gap can only help if the shorter side gets taller." },
      { name: "Trapping rain water", when: "Keep the best wall seen from each side; the lower side decides how much water sits at the pointer." },
      { name: "kSum", when: "Fix k−2 numbers with loops, finish with the opposite-ends pair search." },
    ],
    problems: [
      { title: "Two Sum II - Input Array Is Sorted", slug: "two-sum-ii-input-array-is-sorted", difficulty: "medium", note: "A sorted array and a target pair: the textbook cue.", practice_id: null },
      { title: "Valid Palindrome", slug: "valid-palindrome", difficulty: "easy", note: "Compare from both ends and step inward.", practice_id: null },
      { title: "3Sum", slug: "3sum", difficulty: "medium", note: "Sort, fix one number, then pair-search the rest.", practice_id: null },
      { title: "Container With Most Water", slug: "container-with-most-water", difficulty: "medium", note: "Maximise an area between two positions; move the shorter wall.", practice_id: null },
      { title: "Trapping Rain Water", slug: "trapping-rain-water", difficulty: "hard", note: "Two inward pointers with a running maximum on each side.", practice_id: "fp_030_rain_trap" },
      { title: "Mirror Phrase", slug: null, difficulty: "easy", note: "UNBLUFF graded: a mirror check from both ends.", practice_id: "fp_012_mirror_phrase" },
      { title: "Triple Zero", slug: null, difficulty: "medium", note: "UNBLUFF graded: three numbers that sum to zero.", practice_id: "fp_020_triple_zero" },
    ],
    related: ["two-pointers-read-write", "sliding-window-variable", "binary-search-boundary"],
  },
  {
    id: "two-pointers-read-write",
    name: "Two Pointers: read and write",
    topic: "Arrays and Strings",
    level: "core",
    cues: ["modify the array in place with O(1) extra space", "remove duplicates or a given value", "move all zeros or a category to one end", "partition by a condition"],
    summary: "One pointer reads every element; a second marks where the next kept element goes. The kept part grows behind the reader.",
    idea: [
      "The reader scans the whole array. The writer only advances when the reader finds something worth keeping, so everything before the writer is the finished answer.",
      "Because the writer never passes the reader, you can overwrite in place without losing data you still need.",
      "Deciding what \"worth keeping\" means is the whole problem: for sorted duplicates it is \"different from the last kept value\"; for move-zeroes it is \"not zero\"; for a partition it is \"satisfies the condition\".",
    ],
    template: String.raw`def remove_duplicates_sorted(nums):
    """In place. Returns k so that nums[:k] holds each value once, in order."""
    write = 0
    for read in range(len(nums)):
        if write == 0 or nums[read] != nums[write - 1]:
            nums[write] = nums[read]
            write += 1
    return write


def move_zeroes(nums):
    """In place. Moves every zero to the end and keeps the order of the others."""
    write = 0
    for read in range(len(nums)):
        if nums[read] != 0:
            nums[write], nums[read] = nums[read], nums[write]
            write += 1`,
    check: String.raw`a = [1, 1, 2, 2, 3]
k = remove_duplicates_sorted(a)
assert a[:k] == [1, 2, 3]
b = [0, 1, 0, 3, 12]
move_zeroes(b)
assert b == [1, 3, 12, 0, 0]
c = []
assert remove_duplicates_sorted(c) == 0`,
    complexity: { time: "O(n)", space: "O(1)" },
    pitfalls: [
      "Comparing with nums[read - 1] instead of the last kept value nums[write - 1]: after overwriting, the old neighbour may be gone.",
      "Forgetting that only the first k entries are meaningful afterwards; the rest is leftover data.",
      "Swapping when read == write is harmless, but skipping it is cleaner if the array is huge.",
    ],
    variants: [
      { name: "Remove element", when: "Keep everything that is not equal to the given value." },
      { name: "Dutch national flag", when: "Three groups (0, 1, 2): three pointers, one pass." },
      { name: "Allow at most two copies", when: "Compare with nums[write - 2] instead of nums[write - 1]." },
    ],
    problems: [
      { title: "Remove Duplicates from Sorted Array", slug: "remove-duplicates-from-sorted-array", difficulty: "easy", note: "Keep a value only if it differs from the last kept one.", practice_id: null },
      { title: "Move Zeroes", slug: "move-zeroes", difficulty: "easy", note: "Keep non-zeros in order, then the zeros fall to the end.", practice_id: null },
      { title: "Remove Element", slug: "remove-element", difficulty: "easy", note: "In-place filter with O(1) space.", practice_id: null },
      { title: "Sort Colors", slug: "sort-colors", difficulty: "medium", note: "Three-way partition in one pass.", practice_id: null },
      { title: "Longest Run", slug: null, difficulty: "easy", note: "UNBLUFF graded: scan runs of equal characters with a start and a current pointer.", practice_id: "fp_003_longest_run" },
      { title: "Rotate Right", slug: null, difficulty: "medium", note: "UNBLUFF graded: rotation by three in-place reversals.", practice_id: "fp_019_rotate_right" },
    ],
    related: ["two-pointers-opposite", "fast-slow-pointers"],
  },
  {
    id: "sliding-window-fixed",
    name: "Sliding Window: fixed size",
    topic: "Arrays and Strings",
    level: "core",
    cues: ["window of size k", "every contiguous block of length k", "maximum or average of k consecutive elements", "anagram or permutation of a pattern in a string"],
    summary: "Keep a summary of the last k elements. Moving the window one step adds one element and removes one, so each step is O(1).",
    idea: [
      "Recomputing a k-element sum for every start position costs O(n·k). Neighbouring windows share k−1 elements, so you only need to add the new one and subtract the one that left.",
      "Build the first window, then slide: window += nums[i] − nums[i − k]. The same idea works for anything you can update incrementally: counts of letters, number of distinct values, a running product (with care for zeros).",
      "For a maximum over every window you need more than a sum. Keep a deque of useful indices (a monotonic queue) so the current maximum is always at the front.",
    ],
    template: String.raw`def max_sum_of_k(nums, k):
    """Largest sum of any k consecutive numbers. Requires len(nums) >= k."""
    window = sum(nums[:k])
    best = window
    for i in range(k, len(nums)):
        window += nums[i] - nums[i - k]    # one in, one out
        best = max(best, window)
    return best


from collections import deque


def window_maximums(nums, k):
    """The maximum of every window of size k, using a deque of indices (front = current max)."""
    dq, out = deque(), []
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] <= x:    # smaller values can never be the maximum again
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:                 # the front slid out of the window
            dq.popleft()
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out`,
    check: String.raw`assert max_sum_of_k([2, 1, 5, 1, 3, 2], 3) == 9
assert max_sum_of_k([4], 1) == 4
assert window_maximums([1, 3, -1, -3, 5, 3, 6, 7], 3) == [3, 3, 5, 5, 6, 7]
assert window_maximums([9, 8, 7], 1) == [9, 8, 7]`,
    complexity: { time: "O(n)", space: "O(1) for sums; O(k) for the maximum deque" },
    pitfalls: [
      "Off-by-one on the first full window: the first answer is ready at index k − 1, not k.",
      "Recomputing the window from scratch inside the loop, which silently turns O(n) into O(n·k).",
      "For maximums, popping with < instead of <= leaves equal values that expire out of order.",
    ],
    variants: [
      { name: "Fixed window with counts", when: "Find anagrams: compare a 26-letter count array as the window slides." },
      { name: "Window maximum", when: "Use a monotonic deque so the maximum is at the front." },
      { name: "Average or product", when: "Update the running value incrementally; watch zeros for products." },
    ],
    problems: [
      { title: "Maximum Average Subarray I", slug: "maximum-average-subarray-i", difficulty: "easy", note: "The cleanest fixed-size sum.", practice_id: null },
      { title: "Permutation in String", slug: "permutation-in-string", difficulty: "medium", note: "A fixed window of letter counts.", practice_id: null },
      { title: "Sliding Window Maximum", slug: "sliding-window-maximum", difficulty: "hard", note: "Needs the monotonic deque.", practice_id: "fp_029_window_maximums" },
      { title: "Window Maximums", slug: null, difficulty: "hard", note: "UNBLUFF graded: the maximum of every window.", practice_id: "fp_029_window_maximums" },
    ],
    related: ["sliding-window-variable", "monotonic-stack", "prefix-sum"],
  },
  {
    id: "sliding-window-variable",
    name: "Sliding Window: variable size",
    topic: "Arrays and Strings",
    level: "core",
    cues: ["longest or shortest substring or subarray that satisfies a condition", "at most K distinct, at most K zeros, sum at least S", "contiguous block with all positive numbers", "no repeating characters"],
    summary: "Grow the window on the right every step; shrink from the left while the window is invalid (for longest) or while it is valid (for shortest).",
    idea: [
      "Two indices, left and right, bound a window. Right always moves forward and brings in a new element. Left only moves when the window needs fixing, so each index moves at most n times: O(n) total, even though there is a loop inside a loop.",
      "Longest valid window: add the new element, then shrink from the left until the window is valid again, then record its length.",
      "Shortest valid window: add the new element, then while the window is valid, record its length and shrink from the left.",
      "This only works when shrinking can never make an invalid window valid again in the wrong direction. With all-positive numbers or counts that is true. With negative numbers it is not: use prefix sums instead.",
    ],
    template: String.raw`def longest_unique(s):
    """Length of the longest substring with no repeated character."""
    last = {}                      # character -> index of its latest occurrence
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1    # jump just past the earlier copy
        last[ch] = right
        best = max(best, right - left + 1)
    return best


def shortest_with_sum_at_least(nums, target):
    """Shortest contiguous block of positive numbers with sum >= target, or 0 if none."""
    left = total = 0
    best = float("inf")
    for right, x in enumerate(nums):
        total += x
        while total >= target:     # valid: record, then try a smaller window
            best = min(best, right - left + 1)
            total -= nums[left]
            left += 1
    return 0 if best == float("inf") else best`,
    check: String.raw`assert longest_unique("abcabcbb") == 3
assert longest_unique("bbbb") == 1
assert longest_unique("pwwkew") == 3
assert longest_unique("") == 0
assert shortest_with_sum_at_least([2, 3, 1, 2, 4, 3], 7) == 2
assert shortest_with_sum_at_least([1, 1], 5) == 0`,
    complexity: { time: "O(n): each pointer only moves forward", space: "O(k) for the characters or counts in the window" },
    pitfalls: [
      "Using it with negative numbers: removing an element can raise the sum, so the shrink rule breaks. Reach for prefix sums and a hash map.",
      "Shrinking with if instead of while, which leaves an invalid window after one step.",
      "Updating the answer in the wrong place: for longest, after the window is valid again; for shortest, inside the while loop.",
      "Forgetting that last[ch] may point to a character already outside the window (check last[ch] >= left).",
    ],
    variants: [
      { name: "At most K distinct", when: "Keep a count map; shrink while it has more than K keys. \"Exactly K\" = atMost(K) − atMost(K−1)." },
      { name: "Replace up to K characters", when: "Track the most frequent letter in the window; it is valid while length − maxCount <= K." },
      { name: "Minimum window containing all of T", when: "Track how many required letters are still missing; shrink while none are missing." },
    ],
    problems: [
      { title: "Longest Substring Without Repeating Characters", slug: "longest-substring-without-repeating-characters", difficulty: "medium", note: "Longest valid window with a last-seen map.", practice_id: "fp_021_longest_unique_stretch" },
      { title: "Minimum Size Subarray Sum", slug: "minimum-size-subarray-sum", difficulty: "medium", note: "Shortest window with sum at least S (positive numbers).", practice_id: null },
      { title: "Longest Repeating Character Replacement", slug: "longest-repeating-character-replacement", difficulty: "medium", note: "Valid while length minus the top count is at most K.", practice_id: null },
      { title: "Max Consecutive Ones III", slug: "max-consecutive-ones-iii", difficulty: "medium", note: "At most K zeros in the window.", practice_id: null },
      { title: "Fruit Into Baskets", slug: "fruit-into-baskets", difficulty: "medium", note: "At most two distinct values.", practice_id: null },
      { title: "Minimum Window Substring", slug: "minimum-window-substring", difficulty: "hard", note: "Shortest window containing every needed letter.", practice_id: null },
      { title: "Longest Unique Stretch", slug: null, difficulty: "medium", note: "UNBLUFF graded: longest run with no repeats.", practice_id: "fp_021_longest_unique_stretch" },
      { title: "Window Distinct", slug: null, difficulty: "medium", note: "UNBLUFF graded: distinct values across windows.", practice_id: "fp_008_window_distinct" },
    ],
    related: ["sliding-window-fixed", "two-pointers-opposite", "hash-complement"],
  },
  {
    id: "prefix-sum",
    name: "Prefix Sum",
    topic: "Arrays and Strings",
    level: "core",
    cues: ["many range-sum queries on a fixed array", "subarray whose sum equals K", "sum of a block divisible by K", "everything except the current element"],
    summary: "Precompute running totals once. Any range sum is then one subtraction, and \"find a subarray with sum K\" becomes a hash-map lookup.",
    idea: [
      "Let prefix[i] be the sum of the first i numbers. The sum of nums[l..r] is prefix[r + 1] − prefix[l], so after O(n) preparation every range query is O(1).",
      "For \"how many subarrays sum to K\", walk once keeping the running total. A block ending here sums to K exactly when an earlier prefix equals total − K, so count how many times you have seen that earlier value in a dictionary.",
      "Seed the dictionary with {0: 1}: the empty prefix lets a block that starts at index 0 count.",
      "The same idea works in 2D (a prefix table gives any rectangle sum in O(1)) and with other operations that can be undone, such as XOR.",
    ],
    template: String.raw`from itertools import accumulate


def build_prefix(nums):
    """prefix[i] = sum of nums[:i]; so prefix[0] = 0."""
    return [0, *accumulate(nums)]


def range_sum(prefix, l, r):
    """Sum of nums[l..r], inclusive, 0-based."""
    return prefix[r + 1] - prefix[l]


def count_subarrays_with_sum(nums, k):
    """How many contiguous blocks sum to exactly k (negatives allowed)."""
    seen = {0: 1}            # prefix value -> how often it has appeared
    total = count = 0
    for x in nums:
        total += x
        count += seen.get(total - k, 0)
        seen[total] = seen.get(total, 0) + 1
    return count`,
    check: String.raw`p = build_prefix([1, 2, 3, 4])
assert p == [0, 1, 3, 6, 10]
assert range_sum(p, 1, 2) == 5
assert range_sum(p, 0, 3) == 10
assert count_subarrays_with_sum([1, 1, 1], 2) == 2
assert count_subarrays_with_sum([1, 2, 3], 3) == 2
assert count_subarrays_with_sum([1, -1, 0], 0) == 3`,
    complexity: { time: "O(n) to build, O(1) per query", space: "O(n)" },
    pitfalls: [
      "Off-by-one between a 0-based array and a prefix array that is one longer.",
      "Forgetting the seed {0: 1}, which misses every block that starts at the very beginning.",
      "Using a sliding window when numbers can be negative. A prefix map handles negatives; a window does not.",
      "Integer overflow in other languages: use 64-bit totals.",
    ],
    variants: [
      { name: "Divisible by K", when: "Store prefix % K in the map instead of the raw prefix." },
      { name: "2D prefix", when: "prefix[i][j] gives any rectangle sum with four lookups." },
      { name: "Product except self", when: "Left products times right products, built in two passes." },
      { name: "Difference array", when: "The reverse direction: many range updates, one final prefix pass." },
    ],
    problems: [
      { title: "Range Sum Query - Immutable", slug: "range-sum-query-immutable", difficulty: "easy", note: "The pure build-once, query-many case.", practice_id: "fp_014_range_sums" },
      { title: "Find Pivot Index", slug: "find-pivot-index", difficulty: "easy", note: "Left sum equals right sum.", practice_id: null },
      { title: "Subarray Sum Equals K", slug: "subarray-sum-equals-k", difficulty: "medium", note: "Prefix plus a hash map; negatives allowed.", practice_id: null },
      { title: "Continuous Subarray Sum", slug: "continuous-subarray-sum", difficulty: "medium", note: "Remainders of the prefix modulo K.", practice_id: null },
      { title: "Product of Array Except Self", slug: "product-of-array-except-self", difficulty: "medium", note: "Prefix and suffix products.", practice_id: null },
      { title: "Range Sums", slug: null, difficulty: "easy", note: "UNBLUFF graded: answer many range-sum queries.", practice_id: "fp_014_range_sums" },
    ],
    related: ["kadane", "sliding-window-variable", "hash-complement"],
  },
  {
    id: "kadane",
    name: "Kadane's Algorithm",
    topic: "Arrays and Strings",
    level: "core",
    cues: ["maximum sum of a contiguous subarray", "best stretch, best run, largest block", "maximum product of a contiguous subarray", "an optimal block that ends at each position"],
    summary: "For each position, the best block ending here is either the element alone or the best block ending at the previous position, extended.",
    idea: [
      "Define cur as the best sum of a block that ends exactly at this element. It is max(x, cur + x): if the earlier block helps, extend it; if it only drags the sum down, drop it and start fresh.",
      "The answer is the largest cur seen anywhere, because the best block has to end somewhere.",
      "It is a one-variable dynamic programme: the state is \"best ending here\", and each step only needs the previous state, so memory is O(1).",
      "For products, track both the largest and the smallest value ending here, because a negative times a negative flips a minimum into a maximum.",
    ],
    template: String.raw`def max_subarray(nums):
    """Largest sum of a non-empty contiguous block."""
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)     # extend the block, or start a new one here
        best = max(best, cur)
    return best`,
    check: String.raw`assert max_subarray([-2, 1, -3, 4, -1, 2, 1, -5, 4]) == 6
assert max_subarray([-3, -1, -2]) == -1
assert max_subarray([5]) == 5
assert max_subarray([1, 2, 3]) == 6`,
    complexity: { time: "O(n)", space: "O(1)" },
    pitfalls: [
      "Starting best at 0, which is wrong when every number is negative (the answer is the largest single element).",
      "Allowing an empty block when the problem requires a non-empty one.",
      "For the product version, tracking only the maximum: you must carry the minimum as well.",
    ],
    variants: [
      { name: "Maximum product subarray", when: "Carry the max and min ending here; swap them on a negative number." },
      { name: "Circular array", when: "Answer = max(normal Kadane, total − minimum subarray), unless every element is negative." },
      { name: "Return the indices", when: "Remember where cur last restarted." },
    ],
    problems: [
      { title: "Maximum Subarray", slug: "maximum-subarray", difficulty: "medium", note: "The definition of the pattern.", practice_id: "fp_018_best_stretch" },
      { title: "Maximum Product Subarray", slug: "maximum-product-subarray", difficulty: "medium", note: "Track both the maximum and the minimum.", practice_id: null },
      { title: "Maximum Sum Circular Subarray", slug: "maximum-sum-circular-subarray", difficulty: "medium", note: "Total minus the worst block.", practice_id: null },
      { title: "Best Stretch", slug: null, difficulty: "medium", note: "UNBLUFF graded: the largest sum of a contiguous block.", practice_id: "fp_018_best_stretch" },
    ],
    related: ["prefix-sum", "dp-1d"],
  },
  {
    id: "hash-complement",
    name: "Hash Map: complement and counting",
    topic: "Arrays and Strings",
    level: "core",
    cues: ["find two numbers that add up to a target (unsorted)", "does any value appear twice", "group items that are equal up to ordering", "count how often each thing appears", "longest run of consecutive integers"],
    summary: "Trade memory for time: remember what you have seen in a dictionary or set, so each question becomes an O(1) lookup.",
    idea: [
      "Whenever you catch yourself writing a nested loop just to ask \"have I seen X before?\", a hash map answers it in one step.",
      "Complement lookup: for each x, ask whether target − x is already stored. Store x after the check, so an element does not pair with itself.",
      "Canonical keys: items that are \"the same up to order\" (anagrams) share a canonical form, such as the sorted letters or a 26-slot count tuple. Use it as the dictionary key to group them.",
      "Sets give O(1) membership. For the longest consecutive run, only start counting from numbers whose predecessor is missing, and each run is walked once.",
    ],
    template: String.raw`def two_sum(nums, target):
    """Indices (i, j) of two different elements adding up to target, or None. Unsorted input."""
    seen = {}                      # value -> index
    for i, x in enumerate(nums):
        if target - x in seen:
            return seen[target - x], i
        seen[x] = i                # store after checking, so x cannot pair with itself
    return None


def group_anagrams(words):
    groups = {}
    for w in words:
        groups.setdefault("".join(sorted(w)), []).append(w)   # canonical key
    return list(groups.values())


def longest_consecutive(nums):
    values = set(nums)
    best = 0
    for v in values:
        if v - 1 not in values:                 # v starts a run
            end = v
            while end + 1 in values:
                end += 1
            best = max(best, end - v + 1)
    return best`,
    check: String.raw`assert two_sum([2, 7, 11, 15], 9) == (0, 1)
assert two_sum([3, 3], 6) == (0, 1)
assert two_sum([1, 2], 9) is None
g = group_anagrams(["eat", "tea", "tan", "ate", "nat", "bat"])
assert sorted(sorted(x) for x in g) == [["ate", "eat", "tea"], ["bat"], ["nat", "tan"]]
assert longest_consecutive([100, 4, 200, 1, 3, 2]) == 4
assert longest_consecutive([]) == 0`,
    complexity: { time: "O(n) expected", space: "O(n)" },
    pitfalls: [
      "Inserting x before checking for its complement, so a number matches itself.",
      "Using a list for membership tests. in on a list is O(n), which brings the nested loop back.",
      "Unhashable keys: use a tuple (never a list) as a dictionary key.",
      "Assuming dictionary order is meaningful when the problem needs a particular order.",
    ],
    variants: [
      { name: "Frequency map", when: "Count occurrences: majority element, top K frequent, valid anagram." },
      { name: "Seen set", when: "Detect duplicates or cycles in one pass." },
      { name: "Complement of a prefix", when: "Combine with prefix sums to count subarrays with a target sum." },
    ],
    problems: [
      { title: "Two Sum", slug: "two-sum", difficulty: "easy", note: "Look up target minus the current value.", practice_id: "fp_002_pair_count" },
      { title: "Contains Duplicate", slug: "contains-duplicate", difficulty: "easy", note: "A seen set.", practice_id: null },
      { title: "Valid Anagram", slug: "valid-anagram", difficulty: "easy", note: "Compare letter counts.", practice_id: "fp_016_anagram_check" },
      { title: "Group Anagrams", slug: "group-anagrams", difficulty: "medium", note: "A canonical key per group.", practice_id: null },
      { title: "Longest Consecutive Sequence", slug: "longest-consecutive-sequence", difficulty: "medium", note: "Start counting only where the predecessor is missing.", practice_id: null },
      { title: "Pair Count", slug: null, difficulty: "easy", note: "UNBLUFF graded: count pairs with a target sum.", practice_id: "fp_002_pair_count" },
      { title: "Missing Number", slug: null, difficulty: "easy", note: "UNBLUFF graded: find what is absent with a set.", practice_id: "fp_013_missing_number" },
      { title: "Anagram Check", slug: null, difficulty: "easy", note: "UNBLUFF graded: equal letter counts.", practice_id: "fp_016_anagram_check" },
    ],
    related: ["prefix-sum", "sliding-window-variable", "top-k-heap"],
  },
  {
    id: "merge-intervals",
    name: "Intervals: sort and sweep",
    topic: "Arrays and Strings",
    level: "core",
    cues: ["merge overlapping intervals", "insert an interval into a sorted list", "minimum number of meeting rooms or platforms", "remove the fewest intervals so none overlap", "total length covered by intervals"],
    summary: "Sort by start, then walk once, comparing each interval with the last one you kept.",
    idea: [
      "Once intervals are sorted by start, overlap is a local question: the next interval overlaps the last merged block exactly when its start is at or before that block's end.",
      "Merging: if it overlaps, stretch the last block's end to the larger end; otherwise start a new block.",
      "Covered length is the sum of the merged blocks' lengths, which avoids double counting.",
      "To count how many intervals overlap at once (meeting rooms), turn each into two events, +1 at the start and −1 at the end, sort the events, and track the running total's maximum. A min-heap of end times does the same job.",
      "To keep as many non-overlapping intervals as possible, sort by END and greedily keep each one that starts after the last kept end.",
    ],
    template: String.raw`def merge(intervals):
    """Merge overlapping [start, end] pairs. Touching intervals (end == next start) are merged."""
    out = []
    for start, end in sorted(intervals):              # sort by start
        if out and start <= out[-1][1]:               # overlaps the last block
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out


def max_overlap(intervals):
    """Largest number of half-open intervals [l, r) active at the same moment."""
    events = []
    for l, r in intervals:
        events.append((l, 1))
        events.append((r, -1))        # at a tie, -1 sorts first, so [1,2) and [2,3) do not overlap
    best = cur = 0
    for _, delta in sorted(events):
        cur += delta
        best = max(best, cur)
    return best`,
    check: String.raw`assert merge([[1, 3], [2, 6], [8, 10], [15, 18]]) == [[1, 6], [8, 10], [15, 18]]
assert merge([[1, 4], [4, 5]]) == [[1, 5]]
assert merge([]) == []
assert merge([[5, 6], [1, 2]]) == [[1, 2], [5, 6]]
assert max_overlap([(0, 30), (5, 10), (15, 20)]) == 2
assert max_overlap([(1, 2), (2, 3)]) == 1`,
    complexity: { time: "O(n log n) for the sort; O(n) for the sweep", space: "O(n) for the output" },
    pitfalls: [
      "Not sorting first. The local overlap test only works on sorted input.",
      "Deciding whether touching intervals ([1,4] and [4,5]) overlap. Read the statement: it changes <= to <.",
      "Mutating the input lists while merging when the caller expects them unchanged.",
      "Sorting by start when the greedy needs sorting by end (maximum non-overlapping set).",
    ],
    variants: [
      { name: "Insert interval", when: "Copy everything before, merge everything that overlaps, copy the rest." },
      { name: "Meeting rooms II", when: "Sweep events, or keep a min-heap of end times." },
      { name: "Non-overlapping intervals", when: "Sort by end; keep an interval if it starts at or after the last kept end." },
      { name: "Covered length", when: "Merge first, then sum (end − start)." },
    ],
    problems: [
      { title: "Merge Intervals", slug: "merge-intervals", difficulty: "medium", note: "Sort by start and extend the last block.", practice_id: "fp_022_merge_overlaps" },
      { title: "Insert Interval", slug: "insert-interval", difficulty: "medium", note: "Merge into an already-sorted list.", practice_id: null },
      { title: "Non-overlapping Intervals", slug: "non-overlapping-intervals", difficulty: "medium", note: "Greedy by earliest end.", practice_id: null },
      { title: "Meeting Rooms II", slug: "meeting-rooms-ii", difficulty: "medium", note: "How many intervals are active at once.", practice_id: null },
      { title: "Minimum Number of Arrows to Burst Balloons", slug: "minimum-number-of-arrows-to-burst-balloons", difficulty: "medium", note: "Sort by end and shoot greedily.", practice_id: null },
      { title: "Merge Overlaps", slug: null, difficulty: "medium", note: "UNBLUFF graded: merge overlapping intervals.", practice_id: "fp_022_merge_overlaps" },
      { title: "Covered Time", slug: null, difficulty: "medium", note: "UNBLUFF graded: total length of a union of intervals.", practice_id: "fp_007_covered_time" },
    ],
    related: ["top-k-heap", "binary-search-boundary"],
  },
  {
    id: "binary-search-boundary",
    name: "Binary Search: find a boundary",
    topic: "Searching",
    level: "core",
    cues: ["sorted array and an element or position to find", "first or last occurrence, insertion position", "smallest index such that a condition holds", "rotated sorted array", "O(log n) is required"],
    summary: "Keep a range that is guaranteed to contain the answer and halve it each step. Think \"where does a yes/no condition flip?\", not \"find this value\".",
    idea: [
      "Most binary searches are really boundary searches: some condition is false for a while and then true forever (or the reverse). The answer is the first index where it flips.",
      "Use a half-open range [lo, hi): lo is the first index that might be the answer; hi is a place that is known to be fine (it starts at n, meaning \"none of them\"). Loop while lo < hi, test mid, and either keep mid (hi = mid) or discard it (lo = mid + 1).",
      "Because you never write lo = mid, the range always shrinks and the loop cannot stall. Write down what lo and hi mean before you code, and the off-by-one errors disappear.",
      "Lower bound (first index with a[i] >= x) is the building block: first occurrence is the lower bound of x, last occurrence is the lower bound of x + 1, minus one.",
      "Rotated arrays: at each mid, one half is always sorted. Decide whether the target lies in the sorted half and discard the other.",
    ],
    template: String.raw`def lower_bound(a, x):
    """First index i with a[i] >= x, or len(a) if none. a is sorted ascending."""
    lo, hi = 0, len(a)            # the answer is in [lo, hi]
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] >= x:
            hi = mid              # mid might be the answer: keep it
        else:
            lo = mid + 1          # mid is too small: discard it
    return lo


def first_and_last(a, x):
    """(first, last) index of x in sorted a, or (-1, -1) when absent."""
    first = lower_bound(a, x)
    if first == len(a) or a[first] != x:
        return -1, -1
    return first, lower_bound(a, x + 1) - 1      # for integers`,
    check: String.raw`assert lower_bound([1, 3, 3, 5], 3) == 1
assert lower_bound([1, 3, 3, 5], 4) == 3
assert lower_bound([1, 3], 9) == 2
assert lower_bound([], 1) == 0
assert lower_bound([1, 3], 0) == 0
assert first_and_last([5, 7, 7, 8, 8, 10], 8) == (3, 4)
assert first_and_last([5, 7, 7, 8, 8, 10], 6) == (-1, -1)`,
    complexity: { time: "O(log n)", space: "O(1)" },
    pitfalls: [
      "Mixing closed and half-open ranges: lo <= hi with hi = n, or hi = mid - 1 with lo < hi. Pick one convention and stay in it.",
      "Infinite loops from lo = mid when mid rounds down. Prefer the lo = mid + 1 / hi = mid form.",
      "Overflow in (lo + hi) / 2 in languages with fixed-width ints: use lo + (hi - lo) / 2.",
      "Assuming the data is sorted. Binary search on unsorted data returns nonsense with no error.",
    ],
    variants: [
      { name: "Upper bound", when: "First index with a[i] > x: change >= to >." },
      { name: "Rotated sorted array", when: "Find the sorted half, then decide which side holds the target." },
      { name: "Peak element", when: "Compare mid with mid + 1 to see which side must contain a peak." },
      { name: "Search a sorted matrix", when: "Treat it as a flattened sorted array, or walk from a corner." },
    ],
    problems: [
      { title: "Binary Search", slug: "binary-search", difficulty: "easy", note: "The plain version.", practice_id: null },
      { title: "Search Insert Position", slug: "search-insert-position", difficulty: "easy", note: "Exactly the lower bound.", practice_id: "fp_004_first_not_less" },
      { title: "Find First and Last Position of Element in Sorted Array", slug: "find-first-and-last-position-of-element-in-sorted-array", difficulty: "medium", note: "Two boundary searches.", practice_id: null },
      { title: "Search in Rotated Sorted Array", slug: "search-in-rotated-sorted-array", difficulty: "medium", note: "One half is always sorted.", practice_id: null },
      { title: "Find Minimum in Rotated Sorted Array", slug: "find-minimum-in-rotated-sorted-array", difficulty: "medium", note: "The rotation point is a boundary.", practice_id: null },
      { title: "First Not Less", slug: null, difficulty: "easy", note: "UNBLUFF graded: the lower bound for many queries.", practice_id: "fp_004_first_not_less" },
    ],
    related: ["binary-search-on-answer", "two-pointers-opposite"],
  },
  {
    id: "binary-search-on-answer",
    name: "Binary Search on the Answer",
    topic: "Searching",
    level: "intermediate",
    cues: ["minimum value that is feasible", "maximum value that still works", "minimise the largest or maximise the smallest", "within D days, with at most K groups", "the answer is a number in a known range"],
    summary: "When checking \"is value X enough?\" is easy and the answer is monotone (if X works, so does any bigger X), binary search the value itself.",
    idea: [
      "You are not searching an array. You are searching the range of possible answers, for example speeds 1 to the maximum pile size, with a feasibility test feasible(x).",
      "The test must be monotone: once it turns true it stays true as x grows (or the mirror image). That is the same boundary idea as before, applied to answers.",
      "Steps: (1) pick the smallest and largest possible answers; (2) write feasible(x) as a simple greedy pass; (3) binary search the first x for which it is true (or the last, for maximise problems).",
      "The cost is O(log(range) × cost of one check), which is usually tiny compared with trying every answer.",
    ],
    template: String.raw`def min_eating_speed(piles, hours):
    """Smallest integer speed k so that sum(ceil(p / k) for p in piles) <= hours."""
    def feasible(k):
        return sum((p + k - 1) // k for p in piles) <= hours     # ceil without floats

    lo, hi = 1, max(piles)            # the answer is somewhere in [1, max(piles)]
    while lo < hi:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid                  # fast enough: try slower
        else:
            lo = mid + 1              # too slow: need faster
    return lo


def split_array_largest_sum(nums, parts):
    """Split nums into at most 'parts' contiguous pieces so the largest piece sum is as small as possible."""
    def pieces_needed(limit):
        count, cur = 1, 0
        for x in nums:
            if cur + x > limit:
                count, cur = count + 1, 0
            cur += x
        return count

    lo, hi = max(nums), sum(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if pieces_needed(mid) <= parts:
            hi = mid
        else:
            lo = mid + 1
    return lo`,
    check: String.raw`assert min_eating_speed([3, 6, 7, 11], 8) == 4
assert min_eating_speed([30, 11, 23, 4, 20], 5) == 30
assert min_eating_speed([30, 11, 23, 4, 20], 6) == 23
assert split_array_largest_sum([7, 2, 5, 10, 8], 2) == 18
assert split_array_largest_sum([1, 2, 3, 4, 5], 2) == 9`,
    complexity: { time: "O(log(range) × cost of one feasibility check)", space: "O(1)" },
    pitfalls: [
      "A feasibility test that is not monotone. Check the direction: does a bigger value only ever help?",
      "Wrong bounds: the lower bound must be at least the smallest possible answer (for splitting, the largest single element), or feasible() is meaningless.",
      "Floating-point division inside feasible(). Use integer ceiling: (p + k - 1) // k.",
      "Returning hi when you wanted the last true value in a maximise problem: use mid = (lo + hi + 1) // 2 and lo = mid.",
    ],
    variants: [
      { name: "Minimise the maximum", when: "Ship packages, split array, painter's partition: feasibility is a greedy count of groups." },
      { name: "Maximise the minimum", when: "Aggressive cows, magnetic force: search the largest distance that still fits, using the \"upper\" midpoint." },
      { name: "Real-valued answers", when: "Loop a fixed number of iterations (for example 100) instead of comparing for equality." },
    ],
    problems: [
      { title: "Koko Eating Bananas", slug: "koko-eating-bananas", difficulty: "medium", note: "Smallest speed that finishes in time.", practice_id: null },
      { title: "Capacity To Ship Packages Within D Days", slug: "capacity-to-ship-packages-within-d-days", difficulty: "medium", note: "Smallest capacity; greedy day count.", practice_id: null },
      { title: "Minimum Number of Days to Make m Bouquets", slug: "minimum-number-of-days-to-make-m-bouquets", difficulty: "medium", note: "Smallest day on which enough bouquets bloom.", practice_id: null },
      { title: "Split Array Largest Sum", slug: "split-array-largest-sum", difficulty: "hard", note: "Minimise the largest piece.", practice_id: null },
    ],
    related: ["binary-search-boundary", "dp-knapsack-coin"],
  },
];
