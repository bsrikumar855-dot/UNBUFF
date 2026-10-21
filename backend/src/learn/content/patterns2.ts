import type { PatternContent } from "../model.js";

/** Stacks, heaps, linked lists, trees and graphs. */
export const PATTERNS_2: PatternContent[] = [
  {
    id: "monotonic-stack",
    name: "Monotonic Stack",
    topic: "Stacks and Queues",
    level: "intermediate",
    cues: ["next greater or next smaller element", "how many days until a warmer day", "stock span", "largest rectangle in a histogram", "the nearest element to the left or right that is bigger or smaller"],
    summary: "Keep a stack whose values only increase (or only decrease). Each new element pops every entry it beats, and each pop answers that entry's question.",
    idea: [
      "The brute-force way to find each element's next greater value scans to the right for every element: O(n²). A stack makes it O(n) because every index is pushed once and popped once.",
      "Walk left to right. The stack holds indices whose answer is still unknown, in decreasing order of value. When a new value is greater than the value at the top, it is the answer for that index: pop it, record the answer, and repeat.",
      "After the loop, anything left on the stack never found a greater value (answer −1 or 0).",
      "For the histogram problem, flip the thinking: when a bar is popped because a shorter bar arrived, you now know the rectangle that bar can form, because the new bar is its right limit and the entry below it on the stack is its left limit.",
    ],
    template: String.raw`def next_greater(nums):
    """For each position, the next value to the right that is strictly greater, or -1."""
    out = [-1] * len(nums)
    stack = []                         # indices still waiting for an answer
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            out[stack.pop()] = x       # x is the first greater value to their right
        stack.append(i)
    return out


def days_until_warmer(temps):
    out = [0] * len(temps)
    stack = []
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()
            out[j] = i - j
        stack.append(i)
    return out


def largest_rectangle(heights):
    """Area of the largest rectangle in a histogram."""
    stack, best = [], 0                      # stack of indices with increasing heights
    for i, h in enumerate(heights + [0]):    # a final 0 pops everything
        while stack and heights[stack[-1]] >= h:
            height = heights[stack.pop()]
            left = stack[-1] if stack else -1
            best = max(best, height * (i - left - 1))
        stack.append(i)
    return best`,
    check: String.raw`assert next_greater([2, 1, 2, 4, 3]) == [4, 2, 4, -1, -1]
assert next_greater([]) == []
assert days_until_warmer([73, 74, 75, 71, 69, 72, 76, 73]) == [1, 1, 4, 2, 1, 1, 0, 0]
assert largest_rectangle([2, 1, 5, 6, 2, 3]) == 10
assert largest_rectangle([2, 4]) == 4
assert largest_rectangle([]) == 0`,
    complexity: { time: "O(n): every index is pushed and popped at most once", space: "O(n)" },
    pitfalls: [
      "Pushing values when you need indices. Distances and widths need positions.",
      "Choosing < versus <= in the pop condition. It decides how equal values are treated; test with duplicates.",
      "Forgetting what is left on the stack after the loop, or the sentinel that flushes it in the histogram version.",
      "Using it for \"next greater\" when the array is circular: loop over 2n positions using i % n.",
    ],
    variants: [
      { name: "Next smaller element", when: "Flip the comparison so the stack holds increasing values." },
      { name: "Circular array", when: "Iterate twice (indices 0 to 2n − 1) with i % n." },
      { name: "Previous greater or smaller", when: "Read the answer from the stack top before pushing, instead of when popping." },
      { name: "Trapping rain water (stack version)", when: "Pop a bar when a taller one arrives and add the water bounded by the stack's new top." },
    ],
    problems: [
      { title: "Next Greater Element I", slug: "next-greater-element-i", difficulty: "easy", note: "Next greater value to the right, via a stack and a map.", practice_id: null },
      { title: "Daily Temperatures", slug: "daily-temperatures", difficulty: "medium", note: "Distance to the next warmer day.", practice_id: null },
      { title: "Online Stock Span", slug: "online-stock-span", difficulty: "medium", note: "Previous greater element, streamed.", practice_id: null },
      { title: "Largest Rectangle in Histogram", slug: "largest-rectangle-in-histogram", difficulty: "hard", note: "Pop a bar to evaluate the rectangle it limits.", practice_id: null },
    ],
    related: ["matching-stack", "sliding-window-fixed", "top-k-heap"],
  },
  {
    id: "matching-stack",
    name: "Stack: matching and evaluation",
    topic: "Stacks and Queues",
    level: "core",
    cues: ["balanced brackets or parentheses", "undo, backspace or remove adjacent duplicates", "evaluate an expression or reverse Polish notation", "decode a nested string such as 3[ab]", "the most recent unmatched thing matters"],
    summary: "When the most recent open thing must be closed first (last in, first out), a stack holds what is still open.",
    idea: [
      "Push openers; when a closer arrives, the thing it must match is exactly the top of the stack. If the stack is empty or the top is the wrong kind, the input is invalid.",
      "At the end the stack must be empty, otherwise something was never closed.",
      "Expressions follow the same logic: push operands, and when an operator arrives pop its operands, compute, and push the result. Reverse Polish notation needs nothing more.",
      "Nested decoding (3[a2[c]]) pushes the state you were in (the text so far and the repeat count) when you meet [, and restores it at ].",
    ],
    template: String.raw`def is_valid(s):
    """True when every bracket closes in the right order."""
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack                  # anything left was never closed


def eval_rpn(tokens):
    """Evaluate reverse Polish notation; division truncates toward zero."""
    stack = []
    for t in tokens:
        if t in ("+", "-", "*", "/"):
            b = stack.pop()
            a = stack.pop()
            stack.append(a + b if t == "+" else a - b if t == "-" else a * b if t == "*" else int(a / b))
        else:
            stack.append(int(t))
    return stack[0]`,
    check: String.raw`assert is_valid("()[]{}")
assert is_valid("{[]}")
assert is_valid("")
assert not is_valid("(]")
assert not is_valid("([)]")
assert not is_valid("(")
assert not is_valid(")")
assert eval_rpn(["2", "1", "+", "3", "*"]) == 9
assert eval_rpn(["4", "13", "5", "/", "+"]) == 6
assert eval_rpn(["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]) == 22`,
    complexity: { time: "O(n)", space: "O(n)" },
    pitfalls: [
      "Popping from an empty stack. Check it before every pop that a closer triggers.",
      "Returning True without checking the stack is empty, which accepts \"(((\".",
      "Integer division that rounds toward negative infinity: in Python use int(a / b) for truncation toward zero.",
      "Using a stack when a counter is enough. A single bracket kind needs only a count.",
    ],
    variants: [
      { name: "Backspace and undo", when: "Push characters; a backspace pops." },
      { name: "Remove adjacent duplicates", when: "Pop when the new character equals the top." },
      { name: "Decode string", when: "Push (text so far, repeat count) on [ and restore on ]." },
      { name: "Min stack", when: "Store each value together with the minimum so far." },
    ],
    problems: [
      { title: "Valid Parentheses", slug: "valid-parentheses", difficulty: "easy", note: "The defining problem.", practice_id: "fp_001_balanced_brackets" },
      { title: "Minimum Add to Make Parentheses Valid", slug: "minimum-add-to-make-parentheses-valid", difficulty: "medium", note: "Count unmatched openers and closers.", practice_id: null },
      { title: "Evaluate Reverse Polish Notation", slug: "evaluate-reverse-polish-notation", difficulty: "medium", note: "Pop two operands per operator.", practice_id: null },
      { title: "Decode String", slug: "decode-string", difficulty: "medium", note: "Nested repeats with a stack of states.", practice_id: null },
      { title: "Balanced Brackets", slug: null, difficulty: "easy", note: "UNBLUFF graded: check bracket order.", practice_id: "fp_001_balanced_brackets" },
    ],
    related: ["monotonic-stack", "tree-dfs"],
  },
  {
    id: "top-k-heap",
    name: "Heap: Top K and running median",
    topic: "Heaps",
    level: "intermediate",
    cues: ["top K, K largest or K smallest", "Kth largest element, even in a stream", "K most frequent", "merge K sorted lists", "median of a data stream", "repeatedly take the smallest or largest"],
    summary: "A heap gives the smallest (or largest) item in O(log n). Keep a heap of size K and the K you want are always inside it.",
    idea: [
      "Sorting everything to get the top K costs O(n log n). A min-heap capped at size K costs O(n log K): push each new value, and if the heap grows past K, drop the smallest. What remains are the K largest.",
      "Use a min-heap for \"K largest\" and a max-heap for \"K smallest\": the heap stores the winners, and its root is the weakest winner, the one the next candidate has to beat.",
      "Merging K sorted lists: put each list's head in a min-heap, pop the smallest, and push that list's next element.",
      "Running median: two heaps. A max-heap holds the lower half and a min-heap the upper half, kept within one element of each other, so the median is at the top of one or between the two tops.",
    ],
    template: String.raw`import heapq


def k_largest(nums, k):
    """The k largest values, biggest first."""
    heap = []                              # min-heap of the k best so far; heap[0] is the weakest of them
    for x in nums:
        if len(heap) < k:
            heapq.heappush(heap, x)
        elif x > heap[0]:
            heapq.heapreplace(heap, x)     # pop the weakest and push x in one step
    return sorted(heap, reverse=True)


class MedianFinder:
    """Median of a growing stream. Python has only a min-heap, so the lower half stores negatives."""

    def __init__(self):
        self.lo = []        # max-heap of the smaller half (negated values)
        self.hi = []        # min-heap of the larger half

    def add(self, x):
        heapq.heappush(self.lo, -x)
        heapq.heappush(self.hi, -heapq.heappop(self.lo))     # move the lower half's largest across
        if len(self.hi) > len(self.lo):
            heapq.heappush(self.lo, -heapq.heappop(self.hi)) # keep lo the same size or one bigger

    def median(self):
        if len(self.lo) > len(self.hi):
            return -self.lo[0]
        return (-self.lo[0] + self.hi[0]) / 2`,
    check: String.raw`assert k_largest([3, 2, 1, 5, 6, 4], 2) == [6, 5]
assert k_largest([1], 1) == [1]
assert k_largest([5, 5, 5], 2) == [5, 5]
assert k_largest([], 3) == []
m = MedianFinder()
m.add(1)
assert m.median() == 1
m.add(2)
assert m.median() == 1.5
m.add(3)
assert m.median() == 2
m.add(10)
assert m.median() == 2.5`,
    complexity: { time: "O(n log K) for top K; O(log n) per insert for the running median", space: "O(K)" },
    pitfalls: [
      "Using a max-heap to keep the K largest. It is a min-heap: its root is the one you evict.",
      "Python's heapq is a min-heap only; negate values (or use tuples with a negated key) to simulate a max-heap.",
      "Pushing tuples whose second field is not comparable. Add a tie-breaking counter.",
      "Rebuilding the heap each time. Push and pop incrementally.",
    ],
    variants: [
      { name: "Top K frequent", when: "Count with a hash map, then keep a size-K heap of (count, value)." },
      { name: "Merge K sorted lists", when: "Heap of (value, list index, position)." },
      { name: "Kth largest in a stream", when: "A size-K min-heap; the root is the answer." },
      { name: "Task scheduling", when: "A max-heap of remaining counts picks the most urgent task each round." },
    ],
    problems: [
      { title: "Kth Largest Element in an Array", slug: "kth-largest-element-in-an-array", difficulty: "medium", note: "A size-K min-heap.", practice_id: null },
      { title: "Top K Frequent Elements", slug: "top-k-frequent-elements", difficulty: "medium", note: "Frequencies, then a heap.", practice_id: null },
      { title: "Merge k Sorted Lists", slug: "merge-k-sorted-lists", difficulty: "hard", note: "A heap of list heads.", practice_id: null },
      { title: "Find Median from Data Stream", slug: "find-median-from-data-stream", difficulty: "hard", note: "Two heaps balancing the halves.", practice_id: null },
    ],
    related: ["dijkstra", "hash-complement", "merge-intervals"],
  },
  {
    id: "fast-slow-pointers",
    name: "Fast and Slow Pointers",
    topic: "Linked Lists",
    level: "core",
    cues: ["detect a cycle in a linked list", "find the middle node", "find where a cycle begins", "the Nth node from the end", "a sequence that may loop forever (happy numbers)"],
    summary: "Move one pointer one step and another two steps at a time. Their relative speed reveals cycles and midpoints without extra memory.",
    idea: [
      "If a list has no cycle, the fast pointer reaches the end, and when it does the slow pointer is exactly halfway: that is the middle node.",
      "If there is a cycle, both pointers end up inside it. The fast one gains one step per move, so it must eventually land on the slow one. Meeting means a cycle exists.",
      "To find where the cycle starts, restart one pointer at the head after the meeting and move both one step at a time: they meet at the cycle's entrance. (The distance from the head to the entrance equals the distance from the meeting point to the entrance, going around.)",
      "The same idea works on any sequence generated by a function, such as repeatedly summing the squares of the digits: a cycle that never reaches 1 means the number is not happy.",
    ],
    template: String.raw`class Node:
    def __init__(self, val, next=None):
        self.val, self.next = val, next


def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            return True
    return False


def middle(head):
    """The middle node (the second of the two middles for an even length)."""
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
    return slow


def cycle_start(head):
    """The node where the cycle begins, or None."""
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            slow = head                       # restart one pointer from the head
            while slow is not fast:
                slow, fast = slow.next, fast.next
            return slow
    return None`,
    check: String.raw`def build(vals):
    head = None
    for v in reversed(vals):
        head = Node(v, head)
    return head

assert middle(build([1, 2, 3, 4, 5])).val == 3
assert middle(build([1, 2, 3, 4])).val == 3
assert middle(build([7])).val == 7
assert not has_cycle(build([1, 2, 3]))
assert not has_cycle(None)
a = build([1, 2, 3, 4])
tail = a
while tail.next:
    tail = tail.next
tail.next = a.next          # the tail points back to the second node
assert has_cycle(a)
assert cycle_start(a).val == 2
assert cycle_start(build([1, 2])) is None`,
    complexity: { time: "O(n)", space: "O(1)" },
    pitfalls: [
      "Checking fast.next.next without first checking fast and fast.next, which crashes on short lists.",
      "Comparing values (slow.val == fast.val) instead of identity (slow is fast): duplicate values are not a cycle.",
      "Starting the pointers differently than the problem expects (head versus a dummy node) and getting the wrong middle for even lengths.",
      "Using a set of visited nodes when O(1) space is required.",
    ],
    variants: [
      { name: "Nth node from the end", when: "Advance one pointer N steps, then move both until the first reaches the end." },
      { name: "Happy number", when: "Treat the digit-square-sum function as the \"next\" pointer." },
      { name: "Find the duplicate number", when: "Treat nums[i] as a pointer to index nums[i]; the duplicate is the cycle entrance." },
    ],
    problems: [
      { title: "Linked List Cycle", slug: "linked-list-cycle", difficulty: "easy", note: "Do the pointers ever meet?", practice_id: null },
      { title: "Middle of the Linked List", slug: "middle-of-the-linked-list", difficulty: "easy", note: "Fast ends when slow is halfway.", practice_id: null },
      { title: "Linked List Cycle II", slug: "linked-list-cycle-ii", difficulty: "medium", note: "Where does the cycle begin?", practice_id: null },
      { title: "Happy Number", slug: "happy-number", difficulty: "easy", note: "Cycle detection on a number sequence.", practice_id: null },
    ],
    related: ["linked-list-reversal", "two-pointers-read-write"],
  },
  {
    id: "linked-list-reversal",
    name: "Linked List Reversal",
    topic: "Linked Lists",
    level: "core",
    cues: ["reverse a linked list or part of it", "reverse in groups of K", "check whether a list is a palindrome", "reorder a list (first, last, second, second last...)", "rearrange nodes in place"],
    summary: "Walk the list once, turning each node's next pointer to point backwards. Keep hold of the next node before you overwrite the link.",
    idea: [
      "Three names are enough: prev (the reversed part so far), cur (the node you are flipping) and nxt (saved before you break the link). Flip cur.next to prev, then step all three forward.",
      "Reversing a middle segment works the same way, bracketed by the node before the segment and the node after it. A dummy node in front of the head removes the special case where the segment starts at the head.",
      "Many list problems are really \"find the middle, reverse the second half, then combine\": palindrome check compares the two halves; reorder interleaves them.",
      "Do it in place with O(1) extra space, but note that you are changing the input. If it must be left unchanged, reverse the half back afterwards.",
    ],
    template: String.raw`class Node:
    def __init__(self, val, next=None):
        self.val, self.next = val, next


def reverse_list(head):
    prev = None
    while head:
        nxt = head.next          # save the rest before breaking the link
        head.next = prev
        prev, head = head, nxt
    return prev


def reverse_between(head, left, right):
    """Reverse the nodes at positions left..right (1-based)."""
    dummy = Node(0, head)
    before = dummy
    for _ in range(left - 1):
        before = before.next
    cur = before.next
    for _ in range(right - left):          # pull the next node to the front of the segment
        nxt = cur.next
        cur.next = nxt.next
        nxt.next = before.next
        before.next = nxt
    return dummy.next


def is_palindrome(head):
    """Reverses the second half in place to compare. The list is changed."""
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
    second, first = reverse_list(slow), head
    while second:
        if first.val != second.val:
            return False
        first, second = first.next, second.next
    return True`,
    check: String.raw`def build(vals):
    head = None
    for v in reversed(vals):
        head = Node(v, head)
    return head

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

assert to_list(reverse_list(build([1, 2, 3]))) == [3, 2, 1]
assert reverse_list(None) is None
assert to_list(reverse_between(build([1, 2, 3, 4, 5]), 2, 4)) == [1, 4, 3, 2, 5]
assert to_list(reverse_between(build([1, 2, 3]), 1, 3)) == [3, 2, 1]
assert is_palindrome(build([1, 2, 2, 1]))
assert is_palindrome(build([1, 2, 3, 2, 1]))
assert not is_palindrome(build([1, 2]))
assert is_palindrome(build([1]))`,
    complexity: { time: "O(n)", space: "O(1) iterative" },
    pitfalls: [
      "Overwriting head.next before saving it, which loses the rest of the list.",
      "Returning head instead of prev: after the loop prev is the new head.",
      "Off-by-one on the segment boundaries in a partial reversal; draw a four-node example.",
      "Forgetting that the first half still points into the (now reversed) second half after an in-place palindrome check.",
    ],
    variants: [
      { name: "Reverse in groups of K", when: "Reverse each block of K, then link the blocks; stop if fewer than K remain." },
      { name: "Reorder list", when: "Find the middle, reverse the second half, interleave." },
      { name: "Add two numbers stored in lists", when: "Reverse (or use a stack) so you add from the least significant digit." },
      { name: "Recursive reversal", when: "Reverse the rest, then point the next node back at this one. Uses O(n) stack." },
    ],
    problems: [
      { title: "Reverse Linked List", slug: "reverse-linked-list", difficulty: "easy", note: "The three-pointer loop.", practice_id: null },
      { title: "Reverse Linked List II", slug: "reverse-linked-list-ii", difficulty: "medium", note: "Reverse only a segment.", practice_id: null },
      { title: "Palindrome Linked List", slug: "palindrome-linked-list", difficulty: "easy", note: "Middle, reverse the half, compare.", practice_id: null },
      { title: "Reverse Nodes in k-Group", slug: "reverse-nodes-in-k-group", difficulty: "hard", note: "Repeated segment reversal.", practice_id: null },
    ],
    related: ["fast-slow-pointers", "tree-dfs"],
  },
  {
    id: "tree-dfs",
    name: "Tree: depth-first recursion",
    topic: "Trees",
    level: "core",
    cues: ["maximum depth, diameter or height of a tree", "does a root-to-leaf path with this sum exist", "lowest common ancestor", "validate a binary search tree", "compute something for every subtree and combine", "any problem on a tree that mentions paths or subtrees"],
    summary: "Solve the problem for the left and right subtrees, then combine the two answers at the current node. The recursion mirrors the tree.",
    idea: [
      "Trust the recursion: assume your function already works for both children, and ask only what to do at this node with their answers.",
      "Write the base case first: an empty tree (None) has depth 0, no paths, sum 0. Most bugs are a missing or wrong base case.",
      "Some answers are computed on the way down (pass a remaining target sum as an argument); others on the way back up (return a depth and combine). Diameter needs both: return the depth upward but update a best answer on the side.",
      "Depth can reach n on a skewed tree, so in languages with a recursion limit you may need an explicit stack or to raise the limit.",
    ],
    template: String.raw`class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right


def max_depth(root):
    if root is None:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))


def diameter(root):
    """Length (in edges) of the longest path between any two nodes."""
    best = 0

    def depth(node):
        nonlocal best
        if node is None:
            return 0
        left, right = depth(node.left), depth(node.right)
        best = max(best, left + right)       # a path that bends at this node
        return 1 + max(left, right)          # what the parent can extend

    depth(root)
    return best


def has_path_sum(root, target):
    """Is there a root-to-leaf path whose values add up to target?"""
    if root is None:
        return False
    if root.left is None and root.right is None:
        return root.val == target
    rest = target - root.val
    return has_path_sum(root.left, rest) or has_path_sum(root.right, rest)


def lowest_common_ancestor(root, p, q):
    if root is None or root is p or root is q:
        return root
    left = lowest_common_ancestor(root.left, p, q)
    right = lowest_common_ancestor(root.right, p, q)
    return root if left and right else left or right`,
    check: String.raw`n4, n5, n3 = TreeNode(4), TreeNode(5), TreeNode(3)
n2 = TreeNode(2, n4, n5)
root = TreeNode(1, n2, n3)
assert max_depth(root) == 3
assert max_depth(None) == 0
assert diameter(root) == 3
assert diameter(TreeNode(1)) == 0
assert has_path_sum(root, 7)
assert has_path_sum(root, 4)
assert not has_path_sum(root, 5)
assert not has_path_sum(None, 0)
assert lowest_common_ancestor(root, n4, n5) is n2
assert lowest_common_ancestor(root, n4, n3) is root
assert lowest_common_ancestor(root, n2, n4) is n2`,
    complexity: { time: "O(n): each node is visited once", space: "O(h) recursion depth, where h is the tree height (up to n when skewed)" },
    pitfalls: [
      "A wrong base case. Decide what an empty subtree returns before writing anything else.",
      "Treating a node with one child as a leaf when checking root-to-leaf paths.",
      "Confusing the diameter measured in nodes with the diameter measured in edges.",
      "Validating a BST by comparing only a node with its children. Pass down the allowed (low, high) range instead.",
    ],
    variants: [
      { name: "Preorder, inorder, postorder", when: "Choose where the work happens relative to the recursive calls. Inorder on a BST visits values in sorted order." },
      { name: "Return a value, update a global", when: "Diameter, maximum path sum: the best path bends at a node but the return value goes straight up." },
      { name: "Pass information down", when: "Remaining sum, allowed range for a BST, current depth." },
      { name: "Iterative DFS", when: "Use an explicit stack to avoid recursion limits." },
    ],
    problems: [
      { title: "Maximum Depth of Binary Tree", slug: "maximum-depth-of-binary-tree", difficulty: "easy", note: "One line of recursion.", practice_id: "fp_023_tree_depth" },
      { title: "Diameter of Binary Tree", slug: "diameter-of-binary-tree", difficulty: "easy", note: "Return depth, update the best on the side.", practice_id: null },
      { title: "Path Sum", slug: "path-sum", difficulty: "easy", note: "Pass the remaining target down.", practice_id: null },
      { title: "Lowest Common Ancestor of a Binary Tree", slug: "lowest-common-ancestor-of-a-binary-tree", difficulty: "medium", note: "The node where the two answers meet.", practice_id: null },
      { title: "Binary Tree Maximum Path Sum", slug: "binary-tree-maximum-path-sum", difficulty: "hard", note: "A diameter-style bend with values.", practice_id: null },
      { title: "Tree Depth", slug: null, difficulty: "medium", note: "UNBLUFF graded: the depth of a tree given by parents.", practice_id: "fp_023_tree_depth" },
    ],
    related: ["bfs-shortest-path", "grid-graph-dfs", "matching-stack"],
  },
  {
    id: "bfs-shortest-path",
    name: "BFS: shortest path and levels",
    topic: "Graphs",
    level: "core",
    cues: ["fewest steps, minimum moves or shortest path with equal costs", "level-order traversal", "spread from several sources at once (rotting oranges, 01 matrix)", "shortest transformation sequence", "unweighted graph or grid"],
    summary: "Explore in rings with a queue. The first time you reach a node is by a shortest path, because everything closer was handled first.",
    idea: [
      "Breadth-first search visits all nodes at distance 1, then all at distance 2, and so on. A FIFO queue keeps that order.",
      "Record a distance (or a visited mark) when you first enqueue a node, not when you dequeue it. That stops the same node being queued many times.",
      "On a grid, the neighbours are the four (or eight) adjacent cells within bounds that are not walls. Treat the cell as the node.",
      "Multi-source BFS: put every source in the queue at distance 0 before starting. Distance to the nearest source then falls out directly.",
      "BFS finds shortest paths only when every move costs the same. With different weights use Dijkstra.",
    ],
    template: String.raw`from collections import deque


def shortest_path_grid(grid, start, goal):
    """grid is a list of strings where '#' is a wall. Steps in 4 directions. Returns the step count or -1."""
    rows, cols = len(grid), len(grid[0])
    dist = {start: 0}
    queue = deque([start])
    while queue:
        r, c = queue.popleft()
        if (r, c) == goal:
            return dist[(r, c)]
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] != "#" and (nr, nc) not in dist:
                dist[(nr, nc)] = dist[(r, c)] + 1       # mark when queued, not when popped
                queue.append((nr, nc))
    return -1


def bfs_distances(graph, source):
    """graph: {node: [neighbours]}. Distance in edges from source to every reachable node."""
    dist = {source: 0}
    queue = deque([source])
    while queue:
        u = queue.popleft()
        for v in graph.get(u, ()):
            if v not in dist:
                dist[v] = dist[u] + 1
                queue.append(v)
    return dist`,
    check: String.raw`assert shortest_path_grid(["..#", "..#", "..."], (0, 0), (2, 2)) == 4
assert shortest_path_grid(["#.", ".#"], (0, 1), (1, 0)) == -1
assert shortest_path_grid(["."], (0, 0), (0, 0)) == 0
assert bfs_distances({1: [2, 3], 2: [4], 3: [4], 4: []}, 1) == {1: 0, 2: 1, 3: 1, 4: 2}
assert bfs_distances({}, 1) == {1: 0}`,
    complexity: { time: "O(V + E); on a grid O(rows × cols)", space: "O(V)" },
    pitfalls: [
      "Marking visited when you pop instead of when you push, which lets a node enter the queue many times.",
      "Using a list as a queue: pop(0) is O(n). Use collections.deque.",
      "Using BFS for weighted edges. Different costs need Dijkstra.",
      "Forgetting bounds checks or the start cell being a wall.",
    ],
    variants: [
      { name: "Level-order traversal", when: "Process the queue one level at a time using its length at the start of each round." },
      { name: "Multi-source BFS", when: "Start with every source in the queue (rotting oranges, nearest 0 in a matrix)." },
      { name: "State-space BFS", when: "A node is a state (word, lock combination, puzzle board); neighbours are one legal move." },
      { name: "0-1 BFS", when: "Edge costs of 0 or 1: a deque, pushing 0-cost moves to the front." },
    ],
    problems: [
      { title: "Binary Tree Level Order Traversal", slug: "binary-tree-level-order-traversal", difficulty: "medium", note: "BFS one level at a time.", practice_id: null },
      { title: "Shortest Path in Binary Matrix", slug: "shortest-path-in-binary-matrix", difficulty: "medium", note: "BFS on a grid with 8 directions.", practice_id: null },
      { title: "Rotting Oranges", slug: "rotting-oranges", difficulty: "medium", note: "Multi-source BFS.", practice_id: null },
      { title: "01 Matrix", slug: "01-matrix", difficulty: "medium", note: "Distance to the nearest zero.", practice_id: null },
      { title: "Word Ladder", slug: "word-ladder", difficulty: "hard", note: "Each word is a node; one-letter changes are edges.", practice_id: null },
      { title: "Shortest Hops", slug: null, difficulty: "medium", note: "UNBLUFF graded: fewest hops between nodes.", practice_id: "fp_006_shortest_hops" },
    ],
    related: ["dijkstra", "grid-graph-dfs", "topological-sort"],
  },
  {
    id: "grid-graph-dfs",
    name: "DFS: components, islands and flood fill",
    topic: "Graphs",
    level: "core",
    cues: ["count islands or connected components", "flood fill or paint a region", "is there a path or is the graph connected", "surrounded regions", "area of the largest connected region", "visit everything reachable from here"],
    summary: "From each unvisited cell or node, explore everything reachable and mark it. The number of times you start a new exploration is the number of components.",
    idea: [
      "Scan every cell. When you find an unvisited land cell, you have found a new island: count it, then flood the whole island so you never count it again.",
      "Flooding can be recursive DFS, an explicit stack (safe against recursion limits on big grids), or BFS: all three visit the same set.",
      "Mark cells as visited when you push them, using a set or by overwriting the grid, so nothing is processed twice.",
      "The same skeleton answers many questions: count components, find the size of each one, check whether two cells are connected, or find regions touching the border.",
    ],
    template: String.raw`def count_islands(grid):
    """grid: list of strings of '1' (land) and '0' (water). Cells connect in 4 directions."""
    rows = len(grid)
    cols = len(grid[0]) if grid else 0
    seen = set()

    def flood(r, c):
        stack = [(r, c)]                       # explicit stack: no recursion-depth limit
        seen.add((r, c))
        while stack:
            cr, cc = stack.pop()
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = cr + dr, cc + dc
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "1" and (nr, nc) not in seen:
                    seen.add((nr, nc))         # mark when pushed
                    stack.append((nr, nc))

    islands = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == "1" and (r, c) not in seen:
                islands += 1
                flood(r, c)
    return islands


def component_sizes(graph):
    """graph: {node: [neighbours]} (undirected). Sizes of the connected components."""
    seen, sizes = set(), []
    for start in graph:
        if start in seen:
            continue
        seen.add(start)
        stack, size = [start], 0
        while stack:
            u = stack.pop()
            size += 1
            for v in graph[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        sizes.append(size)
    return sorted(sizes)`,
    check: String.raw`assert count_islands(["11000", "11000", "00100", "00011"]) == 3
assert count_islands([]) == 0
assert count_islands(["0"]) == 0
assert count_islands(["111", "010", "111"]) == 1
assert component_sizes({1: [2], 2: [1], 3: [], 4: [5], 5: [4]}) == [1, 2, 2]
assert component_sizes({}) == []`,
    complexity: { time: "O(rows × cols) or O(V + E)", space: "O(rows × cols) for the visited set and stack" },
    pitfalls: [
      "Marking a cell visited only when you pop it, which lets the same cell be pushed many times.",
      "Recursion depth: a 1000×1000 grid of land recurses a million deep. Use an explicit stack or BFS.",
      "Treating rows as lists of strings and trying to assign to them; copy to a list of lists if you mutate.",
      "Mixing up 4-directional and 8-directional connectivity: read the statement.",
    ],
    variants: [
      { name: "Largest island", when: "Return the size from each flood and keep the maximum." },
      { name: "Surrounded regions", when: "Flood from the border cells first; whatever is not reached is surrounded." },
      { name: "Cycle detection", when: "In an undirected graph, reaching a visited node that is not your parent means a cycle." },
      { name: "Clone a graph", when: "DFS with a map from original node to copy." },
    ],
    problems: [
      { title: "Number of Islands", slug: "number-of-islands", difficulty: "medium", note: "Count the floods.", practice_id: "fp_009_island_count" },
      { title: "Flood Fill", slug: "flood-fill", difficulty: "easy", note: "Paint one region.", practice_id: null },
      { title: "Max Area of Island", slug: "max-area-of-island", difficulty: "medium", note: "Size of each flood.", practice_id: null },
      { title: "Surrounded Regions", slug: "surrounded-regions", difficulty: "medium", note: "Flood from the border.", practice_id: null },
      { title: "Clone Graph", slug: "clone-graph", difficulty: "medium", note: "DFS with an old-to-new map.", practice_id: null },
      { title: "Island Count", slug: null, difficulty: "medium", note: "UNBLUFF graded: count connected regions on a grid.", practice_id: "fp_009_island_count" },
    ],
    related: ["bfs-shortest-path", "union-find", "tree-dfs"],
  },
  {
    id: "topological-sort",
    name: "Topological Sort",
    topic: "Graphs",
    level: "intermediate",
    cues: ["tasks with prerequisites or dependencies", "can all courses be finished", "find a valid order to build or schedule things", "detect a cycle in a directed graph", "order letters of an alien alphabet"],
    summary: "Repeatedly take items with no remaining prerequisites. If you can place everything, the order is valid; if you get stuck, there is a cycle.",
    idea: [
      "Model each \"a before b\" rule as a directed edge a → b. A valid order exists exactly when the graph has no cycle.",
      "Kahn's algorithm: count each node's incoming edges (its indegree). Everything with indegree 0 is ready. Take one, add it to the order, and lower the indegree of the nodes it unlocks; any that reach 0 become ready.",
      "If the order ends up shorter than the number of nodes, the remaining nodes form a cycle: no valid schedule.",
      "The alternative is a DFS that appends a node after all its descendants and reverses the result. Kahn's version is easier to get right and detects cycles for free.",
    ],
    template: String.raw`from collections import deque


def course_order(n, prerequisites):
    """Nodes 0..n-1. A pair (a, b) means a must come before b. Returns a valid order, or None if there is a cycle."""
    graph = [[] for _ in range(n)]
    indegree = [0] * n
    for a, b in prerequisites:
        graph[a].append(b)
        indegree[b] += 1

    ready = deque(i for i in range(n) if indegree[i] == 0)
    order = []
    while ready:
        u = ready.popleft()
        order.append(u)
        for v in graph[u]:
            indegree[v] -= 1
            if indegree[v] == 0:        # all of v's prerequisites are done
                ready.append(v)
    return order if len(order) == n else None`,
    check: String.raw`order = course_order(4, [(0, 1), (1, 2), (0, 3), (3, 2)])
assert order is not None and sorted(order) == [0, 1, 2, 3]
pos = {v: i for i, v in enumerate(order)}
for a, b in [(0, 1), (1, 2), (0, 3), (3, 2)]:
    assert pos[a] < pos[b]
assert course_order(2, [(0, 1), (1, 0)]) is None
assert sorted(course_order(3, [])) == [0, 1, 2]
assert course_order(1, [(0, 0)]) is None`,
    complexity: { time: "O(V + E)", space: "O(V + E)" },
    pitfalls: [
      "Getting the edge direction backwards. Decide whether (a, b) means a before b or a needs b, and keep it consistent.",
      "Not checking that every node was output, which silently accepts cyclic input.",
      "Forgetting isolated nodes: they have indegree 0 and must still appear in the order.",
      "Expecting a unique answer. Many orders can be valid; compare by checking the constraints.",
    ],
    variants: [
      { name: "Course Schedule: can finish?", when: "Return whether len(order) == n." },
      { name: "Lexicographically smallest order", when: "Use a min-heap instead of a queue." },
      { name: "Longest chain of dependencies", when: "Track the depth as you process nodes (DP on a DAG)." },
      { name: "Alien dictionary", when: "Build edges from the first differing letter of adjacent words, then sort the letters." },
    ],
    problems: [
      { title: "Course Schedule", slug: "course-schedule", difficulty: "medium", note: "Is the dependency graph acyclic?", practice_id: "fp_026_course_plan" },
      { title: "Course Schedule II", slug: "course-schedule-ii", difficulty: "medium", note: "Return an actual order.", practice_id: null },
      { title: "Alien Dictionary", slug: "alien-dictionary", difficulty: "hard", note: "Derive the order from sorted words.", practice_id: null },
      { title: "Course Plan", slug: null, difficulty: "medium", note: "UNBLUFF graded: can every course be finished?", practice_id: "fp_026_course_plan" },
    ],
    related: ["bfs-shortest-path", "union-find", "dp-1d"],
  },
  {
    id: "union-find",
    name: "Union-Find (Disjoint Set)",
    topic: "Graphs",
    level: "intermediate",
    cues: ["are these two nodes connected", "group items into components as edges arrive", "the redundant edge that creates a cycle", "merge accounts or sets that share something", "count connected components after unions"],
    summary: "Track groups with a forest of parent pointers. find tells you a group's representative; union merges two groups in almost constant time.",
    idea: [
      "Each element points to a parent, and a group's root is its representative. Two elements are in the same group exactly when find gives them the same root.",
      "Path compression (making nodes point closer to the root while you search) and union by size (hanging the smaller tree under the larger) together make each operation nearly O(1): the inverse Ackermann function, below 5 for any real input.",
      "Detect cycles in an undirected graph: when an edge connects two nodes that already share a root, that edge closes a cycle. This is the \"redundant connection\" problem.",
      "It beats DFS when edges arrive over time (online) or when you need to merge groups repeatedly, because you never have to re-scan the graph.",
    ],
    template: String.raw`class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n
        self.components = n

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]     # path halving
            x = self.parent[x]
        return x

    def union(self, a, b):
        """Merge the groups of a and b. Returns False if they were already together."""
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra                                  # attach the smaller tree under the larger
        self.parent[rb] = ra
        self.size[ra] += self.size[rb]
        self.components -= 1
        return True


def redundant_edge(n, edges):
    """The first edge that connects two already-connected nodes, or None."""
    uf = UnionFind(n)
    for a, b in edges:
        if not uf.union(a, b):
            return (a, b)
    return None`,
    check: String.raw`uf = UnionFind(5)
assert uf.union(0, 1) and uf.union(1, 2)
assert uf.find(0) == uf.find(2)
assert uf.find(0) != uf.find(3)
assert uf.components == 3
assert not uf.union(0, 2)
assert redundant_edge(3, [(0, 1), (1, 2), (2, 0)]) == (2, 0)
assert redundant_edge(3, [(0, 1), (1, 2)]) is None`,
    complexity: { time: "O(α(n)) per operation, effectively constant", space: "O(n)" },
    pitfalls: [
      "Comparing parent[a] and parent[b] instead of find(a) and find(b): parents are not roots until compressed.",
      "Forgetting to update the component count (or sizes) only when a merge really happens.",
      "Using it on a directed graph. Union-find models undirected connectivity.",
      "Mapping non-integer items (names, emails) to indices first, using a dictionary.",
    ],
    variants: [
      { name: "Accounts merge", when: "Union the accounts that share an email, then group by root." },
      { name: "Number of provinces", when: "Union every connected pair and return the component count." },
      { name: "Kruskal's minimum spanning tree", when: "Sort edges by weight and take each that unions two groups." },
      { name: "Weighted union-find", when: "Store a relative value to the parent to answer ratio or difference queries." },
    ],
    problems: [
      { title: "Number of Provinces", slug: "number-of-provinces", difficulty: "medium", note: "Count the components after all unions.", practice_id: null },
      { title: "Redundant Connection", slug: "redundant-connection", difficulty: "medium", note: "The edge whose union fails.", practice_id: null },
      { title: "Accounts Merge", slug: "accounts-merge", difficulty: "medium", note: "Group by shared emails.", practice_id: null },
      { title: "Satisfiability of Equality Equations", slug: "satisfiability-of-equality-equations", difficulty: "medium", note: "Union the equal variables, then check the not-equals.", practice_id: null },
      { title: "Most Stones Removed with Same Row or Column", slug: "most-stones-removed-with-same-row-or-column", difficulty: "medium", note: "Stones sharing a row or column are one component.", practice_id: null },
    ],
    related: ["grid-graph-dfs", "topological-sort", "dijkstra"],
  },
  {
    id: "dijkstra",
    name: "Dijkstra: weighted shortest path",
    topic: "Graphs",
    level: "intermediate",
    cues: ["cheapest or shortest route with different edge costs", "minimum time for a signal to reach all nodes", "minimum effort or cost path on a weighted grid", "all weights are non-negative", "shortest path with at most K stops (a variant)"],
    summary: "Always expand the closest unfinished node, using a min-heap. The first time a node leaves the heap, its distance is final.",
    idea: [
      "Keep the best known distance to every node. Push (distance, node) on a min-heap; pop the smallest; relax each outgoing edge by checking whether going through this node is cheaper.",
      "Why it is correct: with non-negative weights, the closest unfinished node cannot be improved by going through anything farther, so popping it finalises it.",
      "The heap may hold stale entries for a node whose distance has since improved. When you pop one, skip it if its distance is larger than the best known.",
      "Negative edges break the argument; use Bellman-Ford. If all edges cost the same, plain BFS is simpler and faster.",
    ],
    template: String.raw`import heapq


def dijkstra(graph, source):
    """graph: {u: [(v, weight), ...]} with non-negative weights. Returns {node: shortest distance from source}."""
    dist = {source: 0}
    heap = [(0, source)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist.get(u, float("inf")):
            continue                              # a stale entry: u was already reached more cheaply
        for v, w in graph.get(u, ()):
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist`,
    check: String.raw`g = {
    1: [(2, 7), (3, 9), (6, 14)],
    2: [(1, 7), (3, 10), (4, 15)],
    3: [(1, 9), (2, 10), (4, 11), (6, 2)],
    4: [(2, 15), (3, 11), (5, 6)],
    5: [(4, 6), (6, 9)],
    6: [(1, 14), (3, 2), (5, 9)],
}
assert dijkstra(g, 1) == {1: 0, 2: 7, 3: 9, 6: 11, 4: 20, 5: 20}
assert dijkstra({1: []}, 1) == {1: 0}
assert dijkstra({1: [(2, 1)]}, 3) == {3: 0}`,
    complexity: { time: "O((V + E) log V)", space: "O(V + E)" },
    pitfalls: [
      "Using Dijkstra with negative edge weights. It silently gives wrong answers.",
      "Not skipping stale heap entries, which makes it slower and can repeat work.",
      "Treating an undirected edge as one-way: add it in both directions.",
      "Using it when BFS would do. Equal costs need no heap.",
    ],
    variants: [
      { name: "Grid with costs", when: "Cells are nodes; moving into a cell costs its value or the height difference." },
      { name: "Minimise the maximum edge (minimum effort)", when: "Replace d + w with max(d, w) in the relaxation." },
      { name: "At most K stops", when: "Add the number of stops to the state, or use Bellman-Ford limited to K+1 rounds." },
      { name: "Shortest path tree", when: "Store each node's predecessor to rebuild the route." },
    ],
    problems: [
      { title: "Network Delay Time", slug: "network-delay-time", difficulty: "medium", note: "Shortest distances from one source; take the maximum.", practice_id: null },
      { title: "Path With Minimum Effort", slug: "path-with-minimum-effort", difficulty: "medium", note: "Minimise the largest step on a grid.", practice_id: null },
      { title: "Cheapest Flights Within K Stops", slug: "cheapest-flights-within-k-stops", difficulty: "medium", note: "Shortest path with a limit on edges.", practice_id: null },
      { title: "Cheapest Route", slug: null, difficulty: "medium", note: "UNBLUFF graded: cheapest route between two cities.", practice_id: "fp_024_cheapest_route" },
    ],
    related: ["bfs-shortest-path", "top-k-heap", "union-find"],
  },
];
