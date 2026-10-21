import type { DbmsTopicContent, PatternContent } from "../model.js";
import { PATTERNS_1 } from "./patterns1.js";
import { PATTERNS_2 } from "./patterns2.js";
import { DBMS_1 } from "./dbms1.js";
import { DBMS_2 } from "./dbms2.js";
import { PATTERNS_3 } from "./patterns3.js";

export const PATTERNS: PatternContent[] = [...PATTERNS_1, ...PATTERNS_2, ...PATTERNS_3];
export const DBMS_TOPICS: DbmsTopicContent[] = [...DBMS_1, ...DBMS_2];
