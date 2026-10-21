import type { DbmsTopicContent } from "../model.js";

/** Normalization, transactions, concurrency, indexing, recovery and the wider landscape. */
export const DBMS_2: DbmsTopicContent[] = [
  {
    id: "normalization",
    name: "Functional dependencies and normalization",
    group: "Design",
    summary: "Why repeating facts causes bugs, and how 1NF, 2NF, 3NF and BCNF remove the repetition.",
    minutes: 15,
    sections: [
      {
        heading: "Why normalize: three anomalies",
        body: [
          "Suppose every order line stores the customer's name and city. The same facts are repeated on many rows, and three things go wrong. Update anomaly: the customer moves, and you must change every row; miss one and the data disagrees with itself. Insertion anomaly: you cannot record a new customer until they place an order. Deletion anomaly: deleting a customer's only order erases the only record of who they are.",
          "Normalization is the discipline of storing each fact once, so these anomalies cannot happen.",
        ],
      },
      {
        heading: "Functional dependencies and the normal forms",
        body: [
          "A functional dependency X → Y means: if two rows agree on X, they must agree on Y. customer_id → customer_name says a customer id determines the name. The left side is the determinant. Keys are the determinants of everything.",
          "1NF: every column holds one atomic value, with no repeating groups or lists inside a cell. A phones column holding \"98765, 91234\" breaks it.",
          "2NF: in 1NF, and no non-key column depends on only part of a composite key. With key (student_id, course_id), a student_name column depends on student_id alone, a partial dependency; move it to a student table.",
          "3NF: in 2NF, and no non-key column depends on another non-key column (a transitive dependency). employee(id, dept_id, dept_name) has dept_id → dept_name; move the department into its own table.",
          "BCNF: for every dependency X → Y, X must be a candidate key. It is slightly stricter than 3NF and closes the remaining gaps when a table has several overlapping candidate keys. A handy memory aid: every non-key attribute must depend on the key, the whole key and nothing but the key.",
        ],
      },
      {
        heading: "Going too far, and denormalizing on purpose",
        body: [
          "Normalized designs need more joins. For read-heavy reporting or very high traffic it can be right to denormalize deliberately: copy a value, or precompute a total, to avoid a join. You accept the update anomaly in exchange for speed, so you must keep the copies in sync (a trigger, a job, or by writing through one code path).",
          "A decomposition should be lossless (joining the pieces gives back exactly the original rows) and ideally dependency preserving (you can still enforce each dependency without joining).",
        ],
      },
    ],
    key_points: [
      "Normalize so each fact is stored once; this prevents update, insertion and deletion anomalies.",
      "1NF atomic values; 2NF no partial dependency; 3NF no transitive dependency; BCNF every determinant is a candidate key.",
      "A functional dependency X → Y: the same X always has the same Y.",
      "Decompositions must be lossless; dependency preserving is desirable.",
      "Denormalize only on purpose, for measured read speed, and keep copies in sync.",
    ],
    example: {
      title: "Spotting repeated facts in one wide table",
      setup: `CREATE TABLE order_line(
  order_id INTEGER, customer_id INTEGER, customer_name TEXT, customer_city TEXT, product TEXT, qty INTEGER
);
INSERT INTO order_line VALUES
  (1, 100, 'Asha', 'Chennai', 'Pen', 2),
  (1, 100, 'Asha', 'Chennai', 'Notebook', 1),
  (2, 101, 'Ravi', 'Pune', 'Pen', 5),
  (3, 100, 'Asha', 'Chennai', 'Bag', 1);`,
      query: `SELECT DISTINCT customer_id, customer_name, customer_city
FROM order_line
ORDER BY customer_id;`,
      explanation: "Four order lines carry only two customers, and Asha's details are written three times. That is the transitive dependency customer_id → customer_name, customer_city sitting inside an orders table. The DISTINCT result is exactly the customer table a normalized design would hold, with each fact stored once.",
      columns: ["customer_id", "customer_name", "customer_city"],
      rows: [[100, "Asha", "Chennai"], [101, "Ravi", "Pune"]],
    },
    interview: [
      { q: "What are the update, insertion and deletion anomalies?", a: "They are problems caused by storing the same fact in many rows: changing it means many updates and a miss leaves inconsistent data (update); you cannot store a fact without an unrelated one (insertion); removing a row loses an unrelated fact (deletion)." },
      { q: "What is the difference between 3NF and BCNF?", a: "3NF allows a dependency X → Y when Y is part of a candidate key even if X is not a key. BCNF requires every determinant to be a candidate key, so it is stricter, though a BCNF decomposition may not preserve all dependencies." },
      { q: "When would you denormalize?", a: "When measurements show joins are too slow for a read-heavy path, such as reporting. You copy or precompute data and take on the work of keeping the copies consistent." },
    ],
    quiz: [
      { id: "n1", question: "Key is (student_id, course_id). The column student_name depends only on student_id. Which normal form does this violate?", options: ["1NF", "2NF", "3NF", "BCNF only"], answer: 1, why: "A non-key column depending on part of a composite key is a partial dependency, which 2NF forbids." },
      { id: "n2", question: "A column called phones holds the text \"98765, 91234\". Which normal form does this break?", options: ["1NF", "2NF", "3NF", "None"], answer: 0, why: "1NF requires atomic values. Put each phone number in its own row of a separate table." },
      { id: "n3", question: "employee(id, dept_id, dept_name), where dept_id determines dept_name. This table violates...", options: ["1NF", "2NF", "3NF", "Nothing"], answer: 2, why: "dept_name depends on dept_id, which is a non-key column, so it is a transitive dependency: a 3NF violation." },
      { id: "n4", question: "Why might a team deliberately denormalize a table?", options: ["To save disk space", "To avoid joins on a read-heavy path", "To make updates simpler", "Because it is required by SQL"], answer: 1, why: "Copying data avoids joins and speeds reads, at the cost of keeping the copies consistent." },
    ],
    related: ["keys-constraints", "er-model", "joins"],
  },
  {
    id: "transactions-acid",
    name: "Transactions and ACID",
    group: "Transactions",
    summary: "Grouping several statements into one all-or-nothing unit, and the four guarantees a database makes about it.",
    minutes: 12,
    sections: [
      {
        heading: "What a transaction is",
        body: [
          "A transaction is a group of operations that must succeed or fail together. Moving 300 from one account to another is two updates (subtract, add). If the system dies between them, the money would vanish. Wrapping both in one transaction guarantees you never see the half-done state.",
          "You mark it with BEGIN (or START TRANSACTION), then finish with COMMIT to make every change permanent, or ROLLBACK to undo them all. Most databases run in autocommit mode by default, treating each single statement as its own transaction. A SAVEPOINT lets you roll back part of a transaction.",
        ],
      },
      {
        heading: "ACID",
        body: [
          "Atomicity: all of the transaction's effects happen or none do. If any statement fails, everything is rolled back. Databases implement this with an undo log.",
          "Consistency: a transaction takes the database from one valid state to another, so every constraint (keys, CHECK rules, foreign keys) holds after it. The database enforces the declared rules; the application is responsible for the meaning of the business rules.",
          "Isolation: concurrent transactions do not see each other's unfinished work, as if they ran one at a time. How strictly is controlled by the isolation level.",
          "Durability: once COMMIT returns, the change survives a crash or power loss. Databases achieve it by writing the change to a log on disk before acknowledging the commit.",
        ],
      },
    ],
    key_points: [
      "A transaction is all-or-nothing: COMMIT keeps everything, ROLLBACK undoes everything.",
      "Atomicity: undo log. Durability: write-ahead log flushed before commit.",
      "Consistency means constraints hold before and after.",
      "Isolation hides in-progress work from other transactions; levels trade strictness for speed.",
      "Autocommit makes every statement its own transaction.",
    ],
    example: {
      title: "A rolled-back transfer, then a committed one",
      setup: `CREATE TABLE account(id INTEGER PRIMARY KEY, owner TEXT, balance INTEGER CHECK (balance >= 0));
INSERT INTO account VALUES (1, 'Asha', 500), (2, 'Ravi', 100);
BEGIN;
UPDATE account SET balance = balance - 300 WHERE id = 1;
UPDATE account SET balance = balance + 300 WHERE id = 2;
ROLLBACK;
BEGIN;
UPDATE account SET balance = balance - 200 WHERE id = 1;
UPDATE account SET balance = balance + 200 WHERE id = 2;
COMMIT;`,
      query: `SELECT owner, balance FROM account ORDER BY id;`,
      explanation: "The first transfer of 300 was rolled back, so nothing changed. The second transfer of 200 was committed, so Asha has 500 − 200 = 300 and Ravi has 100 + 200 = 300. The total never changes: money is neither created nor lost, whichever way a transaction ends.",
      columns: ["owner", "balance"],
      rows: [["Asha", 300], ["Ravi", 300]],
    },
    interview: [
      { q: "Explain ACID with an example.", a: "In a money transfer, atomicity means both the debit and the credit happen or neither does; consistency means no balance goes negative and the total is preserved; isolation means another transaction never sees the money gone from one account but not yet in the other; durability means a committed transfer survives a crash." },
      { q: "How does a database provide atomicity and durability?", a: "With a log. An undo log lets it reverse an incomplete transaction (atomicity). A write-ahead log is flushed to disk before a commit is acknowledged, so the change can be replayed after a crash (durability)." },
      { q: "What happens if the server crashes in the middle of a transaction?", a: "On restart, recovery replays the committed work from the log and undoes the changes of transactions that had not committed, so the database returns to a consistent state." },
    ],
    quiz: [
      { id: "t1", question: "A transfer fails after the debit but before the credit, and the database restores the old balances. This is...", options: ["Atomicity", "Durability", "Isolation", "Normalization"], answer: 0, why: "Atomicity: the transaction's effects happen entirely or not at all." },
      { id: "t2", question: "After COMMIT returns, the power fails, and the data is still there afterwards. This is...", options: ["Atomicity", "Consistency", "Isolation", "Durability"], answer: 3, why: "Durability: committed changes survive crashes, because the log was written to disk before the commit was acknowledged." },
      { id: "t3", question: "Which statement undoes every change since BEGIN?", options: ["COMMIT", "SAVEPOINT", "ROLLBACK", "TRUNCATE"], answer: 2, why: "ROLLBACK discards the transaction's changes." },
      { id: "t4", question: "In autocommit mode, how is a single UPDATE treated?", options: ["It waits for an explicit COMMIT", "As its own transaction, committed on success", "It is never saved", "It locks the whole database"], answer: 1, why: "Autocommit wraps every statement in its own transaction and commits it automatically when it succeeds." },
    ],
    related: ["isolation-and-locks", "recovery-wal", "keys-constraints"],
  },
  {
    id: "isolation-and-locks",
    name: "Concurrency: isolation levels, locks and deadlocks",
    group: "Transactions",
    summary: "What goes wrong when transactions overlap, the four standard isolation levels, and how locks and MVCC keep them apart.",
    minutes: 16,
    sections: [
      {
        heading: "What goes wrong when transactions overlap",
        body: [
          "Dirty read: T1 reads a value that T2 has changed but not yet committed. If T2 rolls back, T1 acted on data that never existed.",
          "Non-repeatable read: T1 reads a row, T2 updates and commits it, and T1 reads it again and gets a different value within the same transaction.",
          "Phantom read: T1 runs a query for a set of rows, T2 inserts or deletes a matching row and commits, and T1 runs the same query and sees a different set.",
          "Lost update: T1 and T2 both read a balance of 100, T1 adds 50 and writes 150, T2 adds 20 and writes 120. T1's update vanished. Write skew: two transactions each read an overlapping set, make decisions that are fine alone, and write different rows, together breaking a rule (two doctors both going off call).",
        ],
      },
      {
        heading: "The isolation levels",
        body: [
          "READ UNCOMMITTED allows dirty reads; it is rarely used. READ COMMITTED prevents dirty reads: you only ever see committed data, but a repeated read may change. It is the default in PostgreSQL and Oracle.",
          "REPEATABLE READ also prevents non-repeatable reads: rows you have read do not change under you. It is the default in MySQL's InnoDB. Whether phantoms are prevented depends on the engine, so check the documentation.",
          "SERIALIZABLE prevents all of the above: the result is as if the transactions ran one after another. It is the safest and the slowest, and may abort transactions that would conflict, so applications must be ready to retry.",
          "Higher isolation means fewer anomalies but more blocking or retries. Choose the lowest level that keeps your invariants safe, and use explicit locking (SELECT ... FOR UPDATE) for the specific read-modify-write steps that need it.",
        ],
      },
      {
        heading: "Locks, MVCC and deadlocks",
        body: [
          "A shared (read) lock lets several readers share a row; an exclusive (write) lock lets one writer in and blocks the rest. Two-phase locking takes locks as it goes and releases them only at the end, which guarantees serializability.",
          "MVCC (multi-version concurrency control) keeps several versions of a row. Each transaction reads a consistent snapshot, so readers do not block writers and writers do not block readers. PostgreSQL, Oracle and InnoDB use it.",
          "A deadlock is a cycle of waiting: T1 holds a lock on A and wants B; T2 holds B and wants A. The database detects the cycle and aborts one victim, which the application should retry. You avoid most deadlocks by always locking rows in the same order and keeping transactions short.",
        ],
      },
    ],
    key_points: [
      "Anomalies: dirty read, non-repeatable read, phantom read, lost update, write skew.",
      "READ COMMITTED stops dirty reads; REPEATABLE READ also stops non-repeatable reads; SERIALIZABLE stops them all.",
      "Stronger isolation means more blocking or retries.",
      "MVCC lets readers and writers proceed without blocking each other.",
      "Deadlock: a wait cycle. The database aborts a victim; lock in a consistent order and retry.",
    ],
    example: null,
    interview: [
      { q: "What are the standard isolation levels and what does each prevent?", a: "READ UNCOMMITTED prevents nothing. READ COMMITTED prevents dirty reads. REPEATABLE READ also prevents non-repeatable reads. SERIALIZABLE also prevents phantoms, so the outcome equals some serial order." },
      { q: "What is a deadlock and how do you handle it?", a: "Two or more transactions each hold a lock another needs, so none can proceed. The database detects the cycle and aborts one transaction. Applications retry, keep transactions short and acquire locks in a consistent order." },
      { q: "What is MVCC?", a: "Multi-version concurrency control: the database keeps several versions of each row and gives every transaction a consistent snapshot, so reads do not block writes and writes do not block reads." },
    ],
    quiz: [
      { id: "i1", question: "T1 reads a row, T2 changes it and commits, and T1 reads it again and sees a new value. This is a...", options: ["Dirty read", "Non-repeatable read", "Phantom read", "Deadlock"], answer: 1, why: "The same row read twice in one transaction returned different committed values: a non-repeatable read." },
      { id: "i2", question: "Which isolation level is the weakest that still prevents dirty reads?", options: ["READ UNCOMMITTED", "READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"], answer: 1, why: "READ COMMITTED guarantees you only see committed data." },
      { id: "i3", question: "T1 locks row A and waits for B; T2 locks row B and waits for A. This is...", options: ["A phantom read", "A lost update", "A deadlock", "Optimistic concurrency"], answer: 2, why: "Each waits for the other forever: a cycle of waiting. The database aborts one of them." },
      { id: "i4", question: "Two transactions read balance 100, each adds money and writes back, and one addition disappears. This is a...", options: ["Dirty read", "Lost update", "Phantom read", "Constraint violation"], answer: 1, why: "A lost update: the second write overwrote the first because neither saw the other." },
    ],
    related: ["transactions-acid", "recovery-wal", "indexing"],
  },
  {
    id: "indexing",
    name: "Indexing and B+ trees",
    group: "Performance",
    summary: "How an index turns a full-table scan into a few page reads, when it helps, and when it quietly does not.",
    minutes: 14,
    sections: [
      {
        heading: "What an index is",
        body: [
          "Without an index, finding rows where email = 'x' means reading the whole table (a full scan). An index is a separate, sorted structure that maps column values to row locations, so the database can jump straight to the matches.",
          "Most databases use a B+ tree: a shallow, balanced tree where each node holds many keys, so even a table of millions of rows is only three or four levels deep. All values live in the leaf level, and the leaves are linked in order, which makes range queries (BETWEEN, ORDER BY) fast as well as exact lookups.",
          "A clustered index decides the physical order of the table's rows (so there can be only one per table; in InnoDB it is the primary key). A non-clustered (secondary) index is a separate structure that points back to the rows.",
        ],
      },
      {
        heading: "Designing useful indexes",
        body: [
          "Index the columns you filter, join and sort on. Selectivity matters: an index on a column with two values (a boolean) rarely helps, because it does not narrow the search enough.",
          "A composite index on (a, b) is sorted by a, then by b, and follows the leftmost-prefix rule: it serves filters on a, or on a and b, but not on b alone. Put the equality columns first and the range column last.",
          "A covering index contains every column the query needs, so the database answers from the index without touching the table at all.",
          "Things that stop an index being used: wrapping the column in a function (WHERE LOWER(email) = ...), a leading wildcard (LIKE '%abc'), comparing mismatched types, and in some cases OR across different columns. Rewrite the condition, or index the expression.",
          "The price: every insert, update and delete must also maintain each index, and indexes take space. Index for the queries you actually run, and drop the ones that nothing uses.",
        ],
      },
      {
        heading: "Checking what the database really does",
        body: [
          "Ask the database for its plan with EXPLAIN (or EXPLAIN ANALYZE to run it and time it). A plan that says SCAN or Seq Scan on a big table is reading everything; one that says SEARCH, Index Scan or Index Only Scan is using an index. Measure before and after you add an index, rather than guessing.",
        ],
      },
    ],
    key_points: [
      "An index is a sorted B+ tree: lookups and ranges in O(log n) instead of a full scan.",
      "A clustered index orders the table itself (one per table); secondary indexes point to rows.",
      "A composite index obeys the leftmost-prefix rule.",
      "Functions on the column and leading wildcards stop an index from being used.",
      "Indexes speed reads but slow writes and use space.",
    ],
    example: {
      title: "The plan changes when an index exists",
      setup: `CREATE TABLE user(id INTEGER PRIMARY KEY, email TEXT, city TEXT);
INSERT INTO user VALUES (1, 'a@x.com', 'Chennai'), (2, 'b@x.com', 'Pune'), (3, 'c@x.com', 'Delhi');
CREATE INDEX idx_user_email ON user(email);`,
      query: `EXPLAIN QUERY PLAN SELECT * FROM user WHERE email = 'b@x.com';`,
      explanation: "With the index, SQLite reports a SEARCH that uses idx_user_email: it walks the tree to the matching entry. Had we filtered on city instead, which has no index, the plan would say SCAN user, meaning every row is read. (Plan wording differs between databases; the idea does not.)",
      columns: ["detail"],
      rows: [["SEARCH user USING INDEX idx_user_email (email=?)"]],
    },
    interview: [
      { q: "How does a B+ tree index speed up a query?", a: "It keeps keys sorted in a shallow balanced tree, so a lookup needs only a few page reads (the tree's height) instead of scanning every row. Linked leaves also make range scans efficient." },
      { q: "Why might an index not be used?", a: "A function on the indexed column, a leading wildcard in LIKE, a type mismatch, a condition that is not selective enough (the optimizer prefers a scan), or a composite index whose leftmost column is not filtered." },
      { q: "What is a covering index?", a: "An index that contains all the columns a query reads, so the database can answer it from the index alone, without fetching table rows." },
    ],
    quiz: [
      { id: "x1", question: "A composite index is on (country, city). Which filter can use it?", options: ["WHERE city = 'Pune' only", "WHERE country = 'India'", "WHERE LOWER(city) = 'pune'", "None of them"], answer: 1, why: "Leftmost prefix: the index is sorted by country first, so a filter on country can use it. A filter on city alone cannot." },
      { id: "x2", question: "Which query typically cannot use a normal index on name?", options: ["WHERE name = 'Asha'", "WHERE name LIKE 'As%'", "WHERE name LIKE '%sha'", "ORDER BY name"], answer: 2, why: "A leading wildcard means the start of the value is unknown, so the sorted order cannot narrow the search." },
      { id: "x3", question: "What is the main cost of adding more indexes?", options: ["Queries always get slower", "Writes get slower and storage grows", "The table can no longer be updated", "They must be rebuilt daily"], answer: 1, why: "Every insert, update and delete must update each index too." },
      { id: "x4", question: "How many clustered indexes can a table have?", options: ["Exactly one", "Any number", "One per column", "None"], answer: 0, why: "A clustered index defines the physical row order, and rows can only be stored in one order." },
    ],
    related: ["sql-basics", "isolation-and-locks", "joins"],
  },
  {
    id: "recovery-wal",
    name: "Recovery and write-ahead logging",
    group: "Transactions",
    summary: "How a database survives a crash without losing committed work or keeping half-finished work.",
    minutes: 10,
    sections: [
      {
        heading: "The problem",
        body: [
          "Databases keep data pages in memory and write them to disk lazily, because disk writes are slow. If power fails, memory is lost: committed changes that had not reached disk would vanish, and a crash in the middle of a transaction could leave partial changes on disk. Recovery has to fix both.",
        ],
      },
      {
        heading: "Write-ahead logging",
        body: [
          "The rule of write-ahead logging (WAL): a description of every change is appended to the log, and the log is forced to disk, before the changed data page is allowed to reach disk. A transaction counts as committed once its commit record is safely in the log; the data pages can follow later.",
          "The log is written sequentially, which is fast, so durability is cheap. This is why databases can acknowledge a commit without having written the actual table pages.",
          "Log records hold enough to redo a change (the new value) and to undo it (the old value).",
        ],
      },
      {
        heading: "Checkpoints and crash recovery",
        body: [
          "A checkpoint periodically writes dirty pages to disk and records how far recovery would have to look back, so the log does not grow forever and restarts stay quick.",
          "After a crash the database restarts and reads the log. Redo: replay every change that was logged but may not have reached the data pages, including those of uncommitted transactions, to bring the pages to their state at the crash. Undo: roll back every transaction that had no commit record. What remains is exactly the committed work. The widely used ARIES algorithm follows these analysis, redo and undo phases.",
          "Buffer policies explain why both redo and undo are needed: STEAL lets dirty pages of uncommitted transactions be written to disk early (so undo may be needed), and NO-FORCE does not require committed pages to be written at commit (so redo may be needed). Most databases use steal and no-force for speed.",
        ],
      },
    ],
    key_points: [
      "Write-ahead rule: log first, data page later.",
      "A transaction is committed once its commit record is flushed to the log.",
      "Recovery = analysis, redo (repeat history), undo (roll back the unfinished).",
      "Checkpoints bound how much log must be replayed.",
      "Steal / no-force is fast and is why both redo and undo exist.",
    ],
    example: null,
    interview: [
      { q: "What is write-ahead logging?", a: "A protocol where the log record describing a change must reach stable storage before the modified data page does. It lets the database redo committed changes and undo uncommitted ones after a crash." },
      { q: "Why does a database need both redo and undo?", a: "Because pages may be written before commit (steal), so uncommitted changes can be on disk and must be undone; and pages need not be written at commit (no-force), so committed changes may be missing and must be redone." },
      { q: "What is a checkpoint?", a: "A point at which the database flushes modified pages to disk and notes the state, so recovery only has to process the log after that point." },
    ],
    quiz: [
      { id: "r1", question: "In write-ahead logging, what must reach disk first?", options: ["The modified data page", "The log record describing the change", "A backup copy of the table", "The index"], answer: 1, why: "The log record comes first, so a change can always be redone or undone after a crash." },
      { id: "r2", question: "After a crash, a transaction has no commit record in the log. Recovery will...", options: ["Redo it", "Undo it", "Ignore it entirely", "Ask the user"], answer: 1, why: "Without a commit record the transaction is incomplete, so its changes are rolled back." },
      { id: "r3", question: "What is the purpose of a checkpoint?", options: ["To delete old tables", "To bound how much of the log recovery must replay", "To lock the database", "To compress data"], answer: 1, why: "Recovery can start from the last checkpoint instead of the beginning of the log." },
      { id: "r4", question: "A no-force policy means...", options: ["Committed pages need not be written to disk at commit time", "Uncommitted pages are never written", "The log is optional", "Transactions cannot abort"], answer: 0, why: "With no-force, durability comes from the log; the data pages can be written later, which is why redo may be needed." },
    ],
    related: ["transactions-acid", "isolation-and-locks"],
  },
  {
    id: "sql-vs-nosql",
    name: "SQL vs NoSQL, ACID vs BASE and the CAP theorem",
    group: "Landscape",
    summary: "The families of databases, what each is good at, and the trade-off a distributed system cannot avoid.",
    minutes: 11,
    sections: [
      {
        heading: "The families",
        body: [
          "Relational (SQL) databases such as PostgreSQL and MySQL store tables with a fixed schema, support joins and strong transactions, and are the safe default for structured business data.",
          "Document stores (MongoDB) keep flexible JSON-like documents, good when each record is naturally a self-contained tree and the shape varies. Key-value stores (Redis, DynamoDB) give very fast lookups by key, used for caches and sessions. Wide-column stores (Cassandra) spread huge volumes of writes across many machines. Graph databases (Neo4j) make relationships first-class and traverse them quickly, as in social networks and recommendations.",
          "\"NoSQL\" is not a single thing; it just means \"not the relational model\", and several of these databases now offer SQL-like queries or transactions.",
        ],
      },
      {
        heading: "ACID, BASE and CAP",
        body: [
          "Strict ACID transactions are hard to scale across many machines. Many distributed stores therefore relax them to BASE: Basically Available, Soft state, Eventually consistent. Replicas may briefly disagree, and converge if no new writes arrive.",
          "The CAP theorem says that when a network partition splits a distributed system, you cannot keep both consistency (every read sees the latest write) and availability (every request gets an answer). You choose: a CP system refuses some requests during the partition to stay correct; an AP system keeps answering but may return stale data. When there is no partition you can have both. Partition tolerance is not optional in a real network.",
        ],
      },
      {
        heading: "Choosing",
        body: [
          "Start relational unless you have a specific reason not to: the data has relationships, correctness matters, and you will run queries you cannot predict. Reach for another model when the access pattern is clear and specialised: caching, massive write throughput, flexible documents, or heavy graph traversal.",
          "Scaling styles differ too. Relational systems typically scale up (a bigger machine) and out with read replicas; many NoSQL systems were built to scale out by sharding data across machines. Sharding brings its own costs: cross-shard queries, rebalancing, and no easy joins.",
        ],
      },
    ],
    key_points: [
      "SQL: schema, joins, strong transactions. NoSQL: several models for specific access patterns.",
      "BASE relaxes ACID: basically available, soft state, eventually consistent.",
      "CAP: during a partition choose consistency or availability, not both.",
      "Start relational; choose a specialised store for a clear, specialised need.",
      "Sharding scales writes but makes joins and transactions across shards hard.",
    ],
    example: null,
    interview: [
      { q: "What does the CAP theorem say?", a: "In a distributed system, when a network partition occurs you must choose between consistency and availability. You cannot guarantee both. Partition tolerance is a given for networks, so the real choice is CP or AP behaviour during a partition." },
      { q: "When would you choose a document database over a relational one?", a: "When records are self-contained, variable in shape, and mostly read and written as a whole, and you do not need many joins across them. A product catalogue with differing attributes per item is a typical fit." },
      { q: "What does eventual consistency mean?", a: "If no new updates are made, all replicas will eventually hold the same value. In the meantime, reads may return stale data." },
    ],
    quiz: [
      { id: "v1", question: "A system keeps answering requests during a network partition but may return stale data. In CAP terms it favours...", options: ["Consistency", "Availability", "Durability", "Isolation"], answer: 1, why: "Staying responsive at the cost of possibly stale answers is availability (an AP system)." },
      { id: "v2", question: "Which store is the usual fit for a fast cache of sessions looked up by id?", options: ["A graph database", "A key-value store", "A relational database with many joins", "A data warehouse"], answer: 1, why: "A key-value store such as Redis answers lookups by key extremely quickly." },
      { id: "v3", question: "What does the E in BASE stand for?", options: ["Exclusive", "Eventually consistent", "Encrypted", "Elastic"], answer: 1, why: "BASE: Basically Available, Soft state, Eventually consistent." },
      { id: "v4", question: "You have structured business data with relationships and you must never lose a payment. A sensible default is...", options: ["A relational database", "A key-value cache only", "A graph database", "Plain text files"], answer: 0, why: "Relational databases give schemas, joins and strong ACID transactions, which suit this case." },
    ],
    related: ["transactions-acid", "isolation-and-locks", "er-model"],
  },
];
