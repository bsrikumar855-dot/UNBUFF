import type { DbmsTopicContent } from "../model.js";

/** Design, keys and querying. */
export const DBMS_1: DbmsTopicContent[] = [
  {
    id: "er-model",
    name: "ER modelling and turning it into tables",
    group: "Design",
    summary: "Describe the things your system keeps facts about and how they relate, then translate that picture into tables.",
    minutes: 12,
    sections: [
      {
        heading: "Entities, attributes and relationships",
        body: [
          "An entity is a thing you store facts about: a Student, a Course, an Order. Its attributes are those facts: a student has a name and an email. A relationship connects entities: a student enrolls in a course.",
          "A strong entity has an identifying attribute of its own (a student id). A weak entity cannot be identified alone and depends on another entity: an order line is only meaningful as \"line 2 of order 17\", so its identity combines the order's key with its own position.",
          "Attributes come in kinds. A composite attribute splits into parts (an address into street and city). A multivalued attribute can hold several values (a person's phone numbers). A derived attribute is computed from others (age from date of birth) and usually is not stored.",
        ],
      },
      {
        heading: "Cardinality and participation",
        body: [
          "Cardinality says how many of one side can relate to the other. One-to-one: one person has one passport. One-to-many: one department has many employees. Many-to-many: a student takes many courses and a course has many students.",
          "Participation says whether taking part is optional. Total participation means every entity must be in the relationship (every employee must belong to a department); partial means some may not (not every employee manages a team). In a diagram, total participation is drawn with a double line.",
        ],
      },
      {
        heading: "From the diagram to tables",
        body: [
          "Each strong entity becomes a table, with its identifying attribute as the primary key. A one-to-many relationship is stored as a foreign key on the \"many\" side: an employee row holds its department id.",
          "A many-to-many relationship needs its own table, often called a junction or bridge table, holding a foreign key to each side. Its primary key is usually the pair, and attributes of the relationship itself (the grade for an enrollment) live here.",
          "A one-to-one relationship is a foreign key with a UNIQUE constraint, or the two entities may simply be merged. A multivalued attribute becomes a separate table (person_id, phone). A weak entity's table uses a composite key made of its owner's key plus its own partial key.",
        ],
      },
    ],
    key_points: [
      "Entities become tables, attributes become columns, relationships become foreign keys or junction tables.",
      "The foreign key for a one-to-many relationship goes on the many side.",
      "A many-to-many relationship always needs a third table.",
      "A weak entity borrows part of its key from the entity it depends on.",
      "Derived attributes are usually computed, not stored, so they cannot go stale.",
    ],
    example: {
      title: "Many-to-many with a junction table",
      setup: `CREATE TABLE student(id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE course(id INTEGER PRIMARY KEY, title TEXT);
CREATE TABLE enrollment(
  student_id INTEGER REFERENCES student(id),
  course_id INTEGER REFERENCES course(id),
  grade TEXT,
  PRIMARY KEY (student_id, course_id)
);
INSERT INTO student VALUES (1, 'Asha'), (2, 'Ravi');
INSERT INTO course VALUES (10, 'Databases'), (20, 'Algorithms');
INSERT INTO enrollment VALUES (1, 10, 'A'), (1, 20, 'B'), (2, 10, 'B');`,
      query: `SELECT s.name, c.title, e.grade
FROM enrollment e
JOIN student s ON s.id = e.student_id
JOIN course c ON c.id = e.course_id
ORDER BY s.name, c.title;`,
      explanation: "Neither student nor course can hold the relationship: a student takes many courses and a course has many students. The enrollment table holds one row per pair, with the grade, which belongs to the pair and to neither side alone.",
      columns: ["name", "title", "grade"],
      rows: [["Asha", "Algorithms", "B"], ["Asha", "Databases", "A"], ["Ravi", "Databases", "B"]],
    },
    interview: [
      { q: "How do you represent a many-to-many relationship in a relational database?", a: "With a junction table that has a foreign key to each entity. The pair of keys is usually its primary key, and any attribute that belongs to the relationship, such as a grade or a quantity, is stored there." },
      { q: "What is the difference between a strong and a weak entity?", a: "A strong entity has a key of its own. A weak entity cannot be identified without an owner entity, so its table's key combines the owner's key with a partial key of its own, for example (order_id, line_number)." },
      { q: "What is the difference between cardinality and participation?", a: "Cardinality is how many instances can be related (1:1, 1:N, M:N). Participation is whether being related is mandatory (total) or optional (partial)." },
    ],
    quiz: [
      { id: "er1", question: "A department has many employees and each employee belongs to one department. Where does the foreign key go?", options: ["In the department table", "In the employee table", "In a third table", "Nowhere, it is not needed"], answer: 1, why: "In a one-to-many relationship the foreign key lives on the many side: each employee row stores its department id." },
      { id: "er2", question: "Which design correctly stores a many-to-many relationship between Student and Course?", options: ["A course_id column in the student table", "A student_id column in the course table", "A separate enrollment table with student_id and course_id", "Two copies of each table"], answer: 2, why: "Either single column would limit one side to one partner. A junction table holds one row per pair." },
      { id: "er3", question: "Which attribute is a good candidate to leave unstored because it is derived?", options: ["Date of birth", "Age", "Email address", "Student id"], answer: 1, why: "Age can be computed from the date of birth and would go stale if stored." },
      { id: "er4", question: "What identifies a row of a weak entity such as an order line?", options: ["Its own attributes alone", "A random number", "The owner's key combined with its own partial key", "Nothing, weak entities have no key"], answer: 2, why: "A weak entity depends on its owner, so its key is the owner's key plus a partial key like the line number." },
    ],
    related: ["keys-constraints", "normalization", "joins"],
  },
  {
    id: "keys-constraints",
    name: "Keys and constraints",
    group: "Design",
    summary: "How a database identifies a row and refuses bad data: super, candidate, primary and foreign keys, and the constraints that guard them.",
    minutes: 10,
    sections: [
      {
        heading: "The family of keys",
        body: [
          "A super key is any set of columns that uniquely identifies a row. It may contain extra columns: (id, name) is a super key if id alone is unique.",
          "A candidate key is a minimal super key: remove any column and it stops being unique. A table can have several. The one you pick as the main identifier is the primary key; the others are alternate keys, usually protected with UNIQUE.",
          "A foreign key is a column (or columns) whose values must match a primary or candidate key in another table. It is how relationships are stored and how the database stops you creating an order for a customer who does not exist.",
          "A composite key uses more than one column together, as in (student_id, course_id). A surrogate key is an artificial identifier such as an auto-incrementing number; a natural key comes from the data itself, like an email.",
        ],
      },
      {
        heading: "Constraints",
        body: [
          "PRIMARY KEY means unique and not null. UNIQUE allows no duplicates (most databases allow several NULLs, because NULL is not equal to anything). NOT NULL forbids missing values. CHECK enforces a rule such as balance >= 0. DEFAULT supplies a value when none is given.",
          "FOREIGN KEY adds referential integrity, and you choose what happens when the parent row is deleted or its key changes: RESTRICT or NO ACTION refuses, CASCADE deletes or updates the children too, SET NULL clears the reference, SET DEFAULT resets it.",
          "Constraints belong in the database, not only in application code. Every program that touches the data, now and later, is held to the same rules.",
        ],
      },
    ],
    key_points: [
      "Every candidate key is a super key, but not every super key is a candidate key.",
      "The primary key is the chosen candidate key: unique and never null.",
      "A foreign key must match an existing key, or be NULL if allowed.",
      "ON DELETE CASCADE removes dependent rows; RESTRICT refuses the delete.",
      "NULL is not equal to NULL, so UNIQUE usually allows several NULLs.",
    ],
    example: {
      title: "Which columns could be a key?",
      setup: `CREATE TABLE employee(
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  dept TEXT
);
INSERT INTO employee VALUES
  (1, 'a@x.com', 'Asha', 'Eng'),
  (2, 'b@x.com', 'Ravi', 'Eng'),
  (3, 'c@x.com', 'Meena', 'Ops'),
  (4, 'd@x.com', 'Asha', 'Ops');`,
      query: `SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT email) AS distinct_email,
       COUNT(DISTINCT name) AS distinct_name,
       COUNT(DISTINCT dept) AS distinct_dept
FROM employee;`,
      explanation: "A column can only be a candidate key if it has as many distinct values as there are rows. Here email qualifies (4 of 4). Name does not (two people are called Asha) and neither does dept. Remember the data can only disprove a key; the meaning of the column decides whether it will stay unique tomorrow.",
      columns: ["total_rows", "distinct_email", "distinct_name", "distinct_dept"],
      rows: [[4, 4, 3, 2]],
    },
    interview: [
      { q: "What is the difference between a primary key and a unique key?", a: "Both enforce uniqueness. A table has one primary key and it can never be NULL. A table can have many unique constraints, and in most databases they allow NULL (often several)." },
      { q: "What is a candidate key?", a: "A minimal set of columns that uniquely identifies every row. A table may have several; one is chosen as the primary key and the rest become alternate keys." },
      { q: "What does ON DELETE CASCADE do?", a: "When a parent row is deleted, the database automatically deletes the child rows that reference it, so no orphan rows remain." },
    ],
    quiz: [
      { id: "k1", question: "A table has id (unique) and email (unique). The set (id, email) is a...", options: ["Candidate key", "Super key but not a candidate key", "Foreign key", "Not a key at all"], answer: 1, why: "It uniquely identifies rows, so it is a super key, but it is not minimal: either column alone would do, so it is not a candidate key." },
      { id: "k2", question: "Which statement about a primary key is true?", options: ["It may contain NULL", "A table can have two primary keys", "It must be unique and not null", "It must be a single column"], answer: 2, why: "A primary key is unique and non-null. A table has exactly one, though it can span several columns." },
      { id: "k3", question: "You delete a customer who has orders and the foreign key says ON DELETE RESTRICT. What happens?", options: ["The orders are deleted too", "The delete is refused", "The orders keep a dangling customer id", "The customer id in the orders becomes 0"], answer: 1, why: "RESTRICT refuses the delete while child rows exist." },
      { id: "k4", question: "Why can a UNIQUE column in most databases hold several NULLs?", options: ["NULL is a special number", "NULL is not equal to any value, including another NULL", "The database ignores the constraint for NULL by mistake", "NULL means zero"], answer: 1, why: "NULL means unknown, and two unknowns are not known to be equal, so they do not violate uniqueness." },
    ],
    related: ["er-model", "normalization", "sql-basics"],
  },
  {
    id: "sql-basics",
    name: "SQL basics: SELECT, WHERE, ORDER BY and NULL",
    group: "SQL",
    summary: "The shape of a query, the order a database actually evaluates it in, and why NULL needs its own rules.",
    minutes: 12,
    sections: [
      {
        heading: "The shape of a query",
        body: [
          "SELECT chooses the columns, FROM names the table, WHERE keeps only matching rows, ORDER BY sorts, and LIMIT cuts the result short. DISTINCT removes duplicate rows. Aliases (AS) rename columns or tables to keep queries readable.",
          "You write SELECT first, but the database thinks in a different order: FROM and JOIN to pick the rows, WHERE to filter them, GROUP BY to form groups, HAVING to filter groups, then SELECT to compute columns, then DISTINCT, ORDER BY and finally LIMIT. This is why a column alias defined in SELECT cannot be used in WHERE, but can be used in ORDER BY.",
          "Operators you need: comparison (=, <>, <, >=), AND / OR / NOT (use parentheses; AND binds tighter than OR), IN (a, b, c), BETWEEN low AND high (inclusive), and LIKE with % (any text) and _ (one character).",
        ],
      },
      {
        heading: "NULL is not a value, it is \"unknown\"",
        body: [
          "Comparing anything with NULL gives unknown, not true or false, and WHERE keeps only rows where the condition is true. So price = NULL never matches anything: write price IS NULL, and IS NOT NULL for the opposite.",
          "NULL poisons arithmetic and comparisons: 5 + NULL is NULL. Aggregates such as SUM, AVG and COUNT(column) skip NULLs, while COUNT(*) counts every row. COALESCE(x, 0) substitutes a default.",
          "NOT IN with a list or subquery that contains a NULL returns no rows at all, a classic trap: every comparison against the NULL is unknown. Prefer NOT EXISTS.",
        ],
      },
    ],
    key_points: [
      "Logical order: FROM, WHERE, GROUP BY, HAVING, SELECT, DISTINCT, ORDER BY, LIMIT.",
      "Use IS NULL, never = NULL.",
      "COUNT(*) counts rows; COUNT(col) counts non-NULL values.",
      "WHERE filters rows before grouping; HAVING filters groups after.",
      "AND binds tighter than OR, so add parentheses.",
    ],
    example: {
      title: "Filter, sort and limit",
      setup: `CREATE TABLE product(id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL, stock INTEGER);
INSERT INTO product VALUES
  (1, 'Pen', 'Stationery', 10, 100),
  (2, 'Notebook', 'Stationery', 45, 40),
  (3, 'Mouse', 'Electronics', 499, 15),
  (4, 'Keyboard', 'Electronics', 899, 8),
  (5, 'Bag', 'Accessories', 650, NULL);`,
      query: `SELECT name, price
FROM product
WHERE category = 'Electronics' OR price < 50
ORDER BY price DESC
LIMIT 3;`,
      explanation: "Four products match (two electronics, plus the two cheap stationery items). They are sorted by price, highest first, and LIMIT 3 keeps the top three, so the Pen drops out. The Bag has a NULL stock; a condition such as stock < 10 would not match it, because NULL < 10 is unknown.",
      columns: ["name", "price"],
      rows: [["Keyboard", 899], ["Mouse", 499], ["Notebook", 45]],
    },
    interview: [
      { q: "What is the difference between WHERE and HAVING?", a: "WHERE filters individual rows before grouping and cannot use aggregates. HAVING filters whole groups after GROUP BY and can use aggregates such as COUNT(*) > 5." },
      { q: "Why does WHERE x = NULL return nothing?", a: "Any comparison with NULL is unknown, and WHERE keeps only rows where the condition is true. Use x IS NULL." },
      { q: "What is the difference between COUNT(*) and COUNT(column)?", a: "COUNT(*) counts all rows. COUNT(column) counts only the rows where that column is not NULL." },
    ],
    quiz: [
      { id: "s1", question: "A table has 10 rows and 3 of them have a NULL salary. What does SELECT COUNT(salary) return?", options: ["10", "7", "3", "0"], answer: 1, why: "COUNT(column) ignores NULLs, so it counts the 7 rows that have a salary. COUNT(*) would return 10." },
      { id: "s2", question: "Which query finds products with no stock figure recorded?", options: ["WHERE stock = NULL", "WHERE stock = 0", "WHERE stock IS NULL", "WHERE stock == NULL"], answer: 2, why: "Only IS NULL tests for a missing value. = NULL is always unknown." },
      { id: "s3", question: "Which clause is evaluated first?", options: ["SELECT", "ORDER BY", "FROM", "WHERE"], answer: 2, why: "The database first decides which rows to read (FROM and joins), then filters (WHERE), and only later computes SELECT expressions." },
      { id: "s4", question: "What does SELECT * FROM t WHERE a = 1 OR b = 2 AND c = 3 mean?", options: ["(a = 1 OR b = 2) AND c = 3", "a = 1 OR (b = 2 AND c = 3)", "a = 1 AND b = 2 AND c = 3", "It is a syntax error"], answer: 1, why: "AND binds tighter than OR, so the AND pair is grouped first. Use parentheses to say what you mean." },
    ],
    related: ["joins", "group-by-window", "keys-constraints"],
  },
  {
    id: "joins",
    name: "Joins",
    group: "SQL",
    summary: "Combining rows from several tables: inner, left, right, full, self and cross joins, and what each does to rows that have no match.",
    minutes: 14,
    sections: [
      {
        heading: "The join types",
        body: [
          "INNER JOIN keeps only pairs of rows that satisfy the join condition. Rows with no partner on the other side disappear.",
          "LEFT JOIN keeps every row of the left table; where there is no match the right-hand columns are NULL. RIGHT JOIN is the mirror image, and FULL OUTER JOIN keeps unmatched rows from both sides (not available in every database, such as older MySQL).",
          "CROSS JOIN pairs every row with every row: n × m results, rarely what you want unless generating combinations. A self join joins a table to itself using two aliases, for example to find each employee's manager.",
        ],
      },
      {
        heading: "Where you put the condition matters",
        body: [
          "For an inner join, a condition in ON or in WHERE gives the same result. For a LEFT JOIN it does not: a filter on the right-hand table in WHERE removes the NULL rows and quietly turns the join into an inner join. Put such conditions in ON to keep the unmatched left rows.",
          "To find rows with no match (customers who never ordered), LEFT JOIN and test the right-hand key IS NULL, or use NOT EXISTS.",
          "Joining on a column that is not unique multiplies rows: one customer with three orders appears three times. Aggregate before joining, or after, deliberately, and watch the row count.",
        ],
      },
    ],
    key_points: [
      "INNER keeps matches only; LEFT keeps every left row and fills gaps with NULL.",
      "A WHERE filter on the right table of a LEFT JOIN turns it into an inner join; use ON instead.",
      "Find \"no match\" with LEFT JOIN ... WHERE right.key IS NULL, or NOT EXISTS.",
      "A join on a non-unique column multiplies rows.",
      "A self join needs two different aliases.",
    ],
    example: {
      title: "LEFT JOIN keeps customers with no orders",
      setup: `CREATE TABLE customer(id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, amount INTEGER);
INSERT INTO customer VALUES (1, 'Asha'), (2, 'Ravi'), (3, 'Meena');
INSERT INTO orders VALUES (1, 1, 250), (2, 1, 100), (3, 2, 75);`,
      query: `SELECT c.name, COUNT(o.id) AS orders, COALESCE(SUM(o.amount), 0) AS total
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id
ORDER BY c.name;`,
      explanation: "Meena never ordered. An inner join would drop her; the LEFT JOIN keeps her row with NULL order columns, COUNT(o.id) counts 0 because it skips NULLs, and COALESCE turns the NULL total into 0.",
      columns: ["name", "orders", "total"],
      rows: [["Asha", 2, 350], ["Meena", 0, 0], ["Ravi", 1, 75]],
    },
    interview: [
      { q: "What is the difference between INNER JOIN and LEFT JOIN?", a: "INNER JOIN returns only rows that have a match on both sides. LEFT JOIN returns every row of the left table, with NULLs in the right-hand columns where there is no match." },
      { q: "How would you find customers who have never placed an order?", a: "LEFT JOIN orders and keep rows where the order key IS NULL, or use WHERE NOT EXISTS (SELECT 1 FROM orders WHERE customer_id = customer.id). Avoid NOT IN if the subquery can return NULL." },
      { q: "Why can a join return more rows than either table?", a: "If the join key is not unique on one side, each row matches several rows on the other, so rows are multiplied. A cross join does this to the extreme." },
    ],
    quiz: [
      { id: "j1", question: "Table A has 3 rows, table B has 4. A CROSS JOIN returns how many rows?", options: ["3", "4", "7", "12"], answer: 3, why: "A cross join pairs every row of A with every row of B: 3 × 4 = 12." },
      { id: "j2", question: "You LEFT JOIN orders to customers and add WHERE orders.status = 'paid'. What happens to customers with no orders?", options: ["They are kept with NULLs", "They disappear", "They are kept with status 'paid'", "The query fails"], answer: 1, why: "Their right-hand status is NULL, and NULL = 'paid' is unknown, so WHERE removes them. Put the condition in ON to keep them." },
      { id: "j3", question: "Which join returns rows from both tables even when there is no match on either side?", options: ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL OUTER JOIN"], answer: 3, why: "FULL OUTER JOIN keeps unmatched rows from both tables." },
      { id: "j4", question: "To list each employee next to their manager, where both are in the employee table, you use a...", options: ["Cross join", "Self join with two aliases", "Union", "Subquery in GROUP BY"], answer: 1, why: "Join the table to itself: employee e JOIN employee m ON e.manager_id = m.id." },
    ],
    related: ["sql-basics", "group-by-window", "subqueries-cte"],
  },
  {
    id: "group-by-window",
    name: "GROUP BY, aggregates and window functions",
    group: "SQL",
    summary: "Collapse rows into groups with aggregates, or keep every row and compute alongside it with window functions.",
    minutes: 14,
    sections: [
      {
        heading: "Grouping",
        body: [
          "GROUP BY gathers rows that share the same value in the grouped columns and returns one row per group. Aggregate functions summarise each group: COUNT, SUM, AVG, MIN, MAX.",
          "Every column in SELECT must either be in GROUP BY or be inside an aggregate. HAVING filters the groups after aggregation, for example HAVING COUNT(*) > 5; WHERE filters rows before.",
        ],
      },
      {
        heading: "Window functions",
        body: [
          "A window function computes across a set of related rows but does not collapse them: each input row stays in the output. OVER (PARTITION BY dept ORDER BY salary DESC) defines the window: partition splits the rows into independent groups, order sorts within each.",
          "Ranking: ROW_NUMBER gives 1, 2, 3 with no ties; RANK gives ties the same number and then skips (1, 2, 2, 4); DENSE_RANK gives ties the same number without skipping (1, 2, 2, 3).",
          "Aggregates work as windows too: SUM(x) OVER (PARTITION BY dept) is each department's total on every row, and SUM(x) OVER (ORDER BY day) is a running total. LAG and LEAD read the previous or next row, which is how you compute day-over-day change.",
          "The classic use: top N per group. Rank within each partition in a subquery or CTE, then keep rank <= N.",
        ],
      },
    ],
    key_points: [
      "GROUP BY reduces rows to one per group; window functions keep every row.",
      "Non-aggregated SELECT columns must appear in GROUP BY.",
      "RANK skips after ties; DENSE_RANK does not; ROW_NUMBER never ties.",
      "PARTITION BY restarts the window for each group.",
      "Top N per group: rank in a CTE, then filter on the rank.",
    ],
    example: {
      title: "Rank within a department and show the department total",
      setup: `CREATE TABLE emp(id INTEGER PRIMARY KEY, name TEXT, dept TEXT, salary INTEGER);
INSERT INTO emp VALUES
  (1, 'Asha', 'Eng', 120),
  (2, 'Ravi', 'Eng', 100),
  (3, 'Meena', 'Ops', 90),
  (4, 'Karan', 'Ops', 95),
  (5, 'Divya', 'Eng', 100);`,
      query: `SELECT name, dept, salary,
       RANK() OVER (PARTITION BY dept ORDER BY salary DESC) AS rank_in_dept,
       SUM(salary) OVER (PARTITION BY dept) AS dept_total
FROM emp
ORDER BY dept, rank_in_dept, name;`,
      explanation: "Every employee stays in the output (a GROUP BY would have collapsed them). Divya and Ravi tie at 100, so both are rank 2 in Engineering. The department total is repeated on each row of its partition.",
      columns: ["name", "dept", "salary", "rank_in_dept", "dept_total"],
      rows: [["Asha", "Eng", 120, 1, 320], ["Divya", "Eng", 100, 2, 320], ["Ravi", "Eng", 100, 2, 320], ["Karan", "Ops", 95, 1, 185], ["Meena", "Ops", 90, 2, 185]],
    },
    interview: [
      { q: "What is the difference between an aggregate used with GROUP BY and a window function?", a: "GROUP BY collapses each group to a single row. A window function computes over a window of related rows but returns a value for every input row, so you can show detail and summary together." },
      { q: "How do you get the top 2 earners in each department?", a: "Rank with ROW_NUMBER() or DENSE_RANK() OVER (PARTITION BY dept ORDER BY salary DESC) in a CTE or subquery, then filter WHERE rank <= 2 in the outer query." },
      { q: "What is the difference between RANK and DENSE_RANK?", a: "Both give tied rows the same number. RANK then skips numbers (1, 2, 2, 4); DENSE_RANK does not (1, 2, 2, 3)." },
    ],
    quiz: [
      { id: "g1", question: "SELECT dept, name, COUNT(*) FROM emp GROUP BY dept fails in strict SQL. Why?", options: ["COUNT cannot be used with GROUP BY", "name is neither grouped nor aggregated", "dept must be quoted", "GROUP BY needs ORDER BY"], answer: 1, why: "Each group has many names, so the database cannot pick one. Group by it or aggregate it." },
      { id: "g2", question: "Scores 100, 90, 90, 80 ranked with RANK() give...", options: ["1, 2, 3, 4", "1, 2, 2, 3", "1, 2, 2, 4", "1, 1, 2, 3"], answer: 2, why: "RANK gives ties the same rank and then skips, so the next rank is 4. DENSE_RANK would give 1, 2, 2, 3." },
      { id: "g3", question: "Which filters groups after aggregation?", options: ["WHERE", "HAVING", "ORDER BY", "LIMIT"], answer: 1, why: "HAVING runs after GROUP BY and can use aggregates. WHERE runs before grouping." },
      { id: "g4", question: "Which expression gives a running total of amount by date?", options: ["SUM(amount) GROUP BY date", "SUM(amount) OVER (ORDER BY date)", "COUNT(amount) OVER (PARTITION BY date)", "MAX(amount) OVER ()"], answer: 1, why: "A SUM window ordered by date accumulates as the window grows row by row." },
    ],
    related: ["joins", "subqueries-cte", "sql-basics"],
  },
  {
    id: "subqueries-cte",
    name: "Subqueries and CTEs",
    group: "SQL",
    summary: "Queries inside queries: scalar, row-set and correlated subqueries, EXISTS, and WITH clauses that make long queries readable.",
    minutes: 11,
    sections: [
      {
        heading: "Kinds of subquery",
        body: [
          "A scalar subquery returns one value and can be used wherever a value fits: WHERE salary > (SELECT AVG(salary) FROM emp). A multi-row subquery returns a list for IN or ANY. A subquery in FROM acts as a temporary table (a derived table).",
          "A correlated subquery refers to the outer row, so it is evaluated once per outer row in principle: WHERE salary > (SELECT AVG(salary) FROM emp e2 WHERE e2.dept = e1.dept). Many optimisers rewrite it into a join, but it can be slow on large tables.",
          "EXISTS asks only whether any row is returned, and stops at the first one. It is the safe way to test for presence or absence; NOT EXISTS is safer than NOT IN when NULLs are possible.",
        ],
      },
      {
        heading: "Common table expressions (WITH)",
        body: [
          "A CTE gives a subquery a name at the top of the statement: WITH dept_avg AS (...) SELECT ... FROM emp JOIN dept_avg .... It reads top to bottom, can be referenced several times, and breaks a complicated query into steps.",
          "Recursive CTEs call themselves: an anchor query gives the starting rows, and a recursive part keeps adding rows until nothing new is produced. They walk hierarchies such as an organisation chart or category tree.",
        ],
      },
    ],
    key_points: [
      "A subquery used with = or > must return exactly one value.",
      "A correlated subquery depends on the outer row.",
      "Prefer EXISTS / NOT EXISTS over IN / NOT IN when NULLs can appear.",
      "CTEs improve readability; they are not automatically faster.",
      "Recursive CTEs = anchor + recursive step, for hierarchies.",
    ],
    example: {
      title: "Employees paid more than their department's average",
      setup: `CREATE TABLE emp(id INTEGER PRIMARY KEY, name TEXT, dept TEXT, salary INTEGER);
INSERT INTO emp VALUES
  (1, 'Asha', 'Eng', 120),
  (2, 'Ravi', 'Eng', 100),
  (3, 'Meena', 'Ops', 90),
  (4, 'Karan', 'Ops', 95),
  (5, 'Divya', 'Eng', 100);`,
      query: `WITH dept_avg AS (
  SELECT dept, AVG(salary) AS avg_salary
  FROM emp
  GROUP BY dept
)
SELECT e.name, e.dept, e.salary, ROUND(d.avg_salary, 1) AS dept_avg
FROM emp e
JOIN dept_avg d ON d.dept = e.dept
WHERE e.salary > d.avg_salary
ORDER BY e.name;`,
      explanation: "The CTE computes each department's average once, then the main query compares every employee with it. Engineering averages 106.7, so only Asha (120) is above it; Operations averages 92.5, so only Karan (95) is.",
      columns: ["name", "dept", "salary", "dept_avg"],
      rows: [["Asha", "Eng", 120, 106.7], ["Karan", "Ops", 95, 92.5]],
    },
    interview: [
      { q: "What is a correlated subquery?", a: "A subquery that references columns of the outer query, so its result depends on the current outer row. Conceptually it runs once per outer row." },
      { q: "Why prefer NOT EXISTS to NOT IN?", a: "If the NOT IN list contains a NULL, every comparison is unknown and the query returns no rows. NOT EXISTS does not have that problem." },
      { q: "What is a CTE and when would you use one?", a: "A named temporary result defined with WITH at the start of a statement. Use it to split a complex query into readable steps, to reuse a result, or (recursively) to walk a hierarchy." },
    ],
    quiz: [
      { id: "c1", question: "Which subquery can follow the operator > in WHERE salary > (...)?", options: ["One that returns a single value", "One that returns many rows", "Only a correlated one", "Any query at all"], answer: 0, why: "A comparison operator needs one value. A multi-row result needs IN, ANY or ALL." },
      { id: "c2", question: "NOT IN (SELECT x FROM t) returns no rows at all when...", options: ["t is empty", "The subquery returns a NULL", "x is indexed", "t has duplicates"], answer: 1, why: "Comparing against a NULL gives unknown for every row. NOT EXISTS avoids this." },
      { id: "c3", question: "A recursive CTE is made of...", options: ["Two unrelated queries", "An anchor query and a recursive step", "A loop and a counter", "A trigger and a view"], answer: 1, why: "The anchor produces the first rows; the recursive part refers to the CTE itself and keeps adding rows until none are new." },
      { id: "c4", question: "Which is true of a correlated subquery?", options: ["It cannot use the outer table", "It is evaluated once, before the outer query", "It depends on the current outer row", "It must use GROUP BY"], answer: 2, why: "It refers to the outer row, so its result can differ for each outer row." },
    ],
    related: ["joins", "group-by-window", "sql-basics"],
  },
];
