import React from "react";
import { Link } from "react-router-dom";
import {
  ContactLine,
  LegalDoc,
  LegalList,
  LegalSection,
} from "@/components/legal/LegalDoc";
import { routes } from "@/lib/routes";

/** What UNBLUFF keeps about a student, why, who else handles it, and how a student controls it. Written from how the app actually works. */
const PrivacyPage: React.FC = () => (
  <LegalDoc
    title="Privacy"
    updated="10 November 2026"
    intro="What we keep about you, why, who else handles it, and how you control it. Short version: your résumé, answers and reports are private to your account, and you can download or delete them at any time."
  >
    <LegalSection title="What we keep">
      <LegalList
        items={[
          <>
            <strong>Your account:</strong> your email address and a password (the password
            is handled by Google Firebase Authentication; we never see it).
          </>,
          <>
            <strong>What you give us:</strong> résumé text, your answers to audit
            questions, claims and reports, your résumé editor content, placement goals and
            plan, DSA practice notes and progress, code you write in the workspace, AI
            mentor conversations and the short “memories” the mentor keeps, and your
            profile (name, college, graduation year, target role).
          </>,
          <>
            <strong>If you connect them:</strong> public GitHub information
            (contributions, public repositories and public activity; never private
            repositories) and the numbers you type or look up for LeetCode. The GitHub
            access token is stored encrypted. You can disconnect at any time, which
            deletes the saved data.
          </>,
        ]}
      />
    </LegalSection>

    <LegalSection title="Why we use it">
      <p>
        To run the features you ask for: extracting and testing claims from your résumé,
        planning your preparation, running and judging your code, and answering your
        questions. We do not sell your data and we do not use it for advertising.
      </p>
    </LegalSection>

    <LegalSection title="Who else handles it">
      <LegalList
        items={[
          <>
            <strong>Google Firebase / Cloud Firestore</strong>: sign-in, and storage of
            everything above.
          </>,
          <>
            <strong>Google Gemini API</strong>: the text of your résumé, answers and
            mentor messages is sent to the model to produce questions, grades and replies.
            Do not paste anything you are not comfortable sending to an AI service.
          </>,
          <>
            <strong>Our hosting provider</strong>: runs the server that processes your
            requests.
          </>,
          <>
            <strong>GitHub and LeetCode</strong>: contacted only if you connect them, to
            read public data.
          </>,
          <>
            <strong>Freehire</strong>: public job listings are read live; your résumé is
            not sent there.
          </>,
        ]}
      />
    </LegalSection>

    <LegalSection title="How long we keep it">
      <p>
        Audits (including the résumé text) that you have not touched for a year are
        deleted automatically. You can delete a single audit from{" "}
        <Link className="text-redline underline underline-offset-4" to={routes.sessions}>
          My sessions
        </Link>{" "}
        at any time.
      </p>
    </LegalSection>

    <LegalSection title="Your controls">
      <LegalList
        items={[
          <>
            In{" "}
            <Link
              className="text-redline underline underline-offset-4"
              to={routes.settings}
            >
              Settings
            </Link>
            : download everything we hold about you as a file, change your password, edit
            your profile, disconnect GitHub or LeetCode, and delete all of the data you
            have stored with us.
          </>,
          <>
            Deleting your data in Settings removes it from our database. Your sign-in
            record (email and password) is held by Firebase Authentication; write to us to
            have that removed as well. Deleted data may remain in routine backups for a
            short period. You can also ask us to correct your data or withdraw consent by
            writing to us.
          </>,
        ]}
      />
    </LegalSection>

    <LegalSection title="Security">
      <p>
        Each student&apos;s data is private to their own account and is checked on the
        server on every request. Connections use HTTPS and the database is not reachable
        from browsers. No system is perfectly secure; if we learn of a breach affecting
        your data we will tell you and the authorities as the law requires.
      </p>
    </LegalSection>

    <LegalSection title="Children">
      <p>
        UNBLUFF is for students aged 18 and over. If you are younger, please do not create
        an account.
      </p>
    </LegalSection>

    <LegalSection title="Contact">
      <p>
        Questions or requests about your data: <ContactLine />
      </p>
    </LegalSection>
  </LegalDoc>
);

export default PrivacyPage;
