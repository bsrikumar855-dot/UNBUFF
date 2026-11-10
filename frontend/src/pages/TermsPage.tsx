import React from "react";
import { Link } from "react-router-dom";
import {
  ContactLine,
  LegalDoc,
  LegalList,
  LegalSection,
} from "@/components/legal/LegalDoc";
import { routes } from "@/lib/routes";

/** The rules for using UNBLUFF. Plain language; to be confirmed by a lawyer before a public launch. */
const TermsPage: React.FC = () => (
  <LegalDoc
    title="Terms of use"
    updated="10 November 2026"
    intro="Plain rules for using UNBLUFF. By creating an account you agree to them and to our Privacy page."
  >
    <LegalSection title="What UNBLUFF is">
      <p>
        UNBLUFF is a study tool that helps students prepare for placements: it tests the
        claims on a résumé, plans practice, and gives feedback. It is a{" "}
        <strong>study aid, not a promise</strong>: nothing here predicts or guarantees a
        job, an interview or a score, and results can be wrong.
      </p>
    </LegalSection>

    <LegalSection title="Your account">
      <LegalList
        items={[
          "You must be 18 or older, and give a real email address you control.",
          "Keep your password to yourself. You are responsible for what happens under your account.",
          "One person per account.",
        ]}
      />
    </LegalSection>

    <LegalSection title="Your content">
      <p>
        You keep ownership of what you put in (résumé, answers, code, notes). You give us
        permission to store and process it, including sending it to an AI service, only to
        run UNBLUFF for you (see{" "}
        <Link className="text-redline underline underline-offset-4" to="/privacy">
          Privacy
        </Link>
        ). Only upload things you have the right to share, and nothing that belongs to
        someone else without their permission.
      </p>
    </LegalSection>

    <LegalSection title="Fair use">
      <LegalList
        items={[
          "Do not try to break, overload or get around the service, its limits or its security.",
          "Do not use the code runner for anything but solving practice problems, and do not try to read other students' data.",
          "Do not copy the practice problems or other content out in bulk.",
        ]}
      />
    </LegalSection>

    <LegalSection title="AI and accuracy">
      <p>
        The AI mentor and graders can make mistakes. Check important facts yourself.
        Practice results that are not judged by a verified service are shown as such and
        are not counted as proof of skill.
      </p>
    </LegalSection>

    <LegalSection title="Availability and changes">
      <p>
        The service is provided as is and may change, be interrupted or be withdrawn. We
        will try to give notice of changes that affect your data. You can delete your data
        at any time in Settings.
      </p>
    </LegalSection>

    <LegalSection title="Liability">
      <p>
        To the extent the law allows, we are not liable for indirect or consequential
        loss, or for decisions you make based on UNBLUFF&apos;s output. Nothing here
        limits rights you have that cannot be limited by law.
      </p>
    </LegalSection>

    <LegalSection title="Contact">
      <p>
        Questions: <ContactLine />. See also{" "}
        <Link className="text-redline underline underline-offset-4" to={routes.settings}>
          Settings
        </Link>{" "}
        for your data controls.
      </p>
    </LegalSection>
  </LegalDoc>
);

export default TermsPage;
