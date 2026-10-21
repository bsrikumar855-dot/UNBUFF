/**
 * True when the student's message is about their résumé or ATS, so the mentor should read the saved résumé.
 * Unicode-aware on purpose: \b treats "é" as a non-letter, so "résumé" at the end of a message would not match.
 */
export const wantsResume = (message: string): boolean => /(?<![\p{L}\p{N}])(?:r[eé]sum[eé]s?|cv|ats|curriculum vitae|latex)(?![\p{L}\p{N}])/iu.test(message);
