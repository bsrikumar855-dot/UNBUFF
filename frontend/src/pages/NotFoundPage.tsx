import React from "react";
import { Link } from "react-router-dom";
import { buttonClasses } from "@/lib/buttonClasses";

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <h2 className="mb-2 text-3xl font-bold text-ink-primary">404 — Page Not Found</h2>
      <p className="mb-6 text-ink-secondary">
        The requested path does not exist in UNBLUFF.
      </p>
      <Link to="/" className={buttonClasses("secondary")}>
        Return to Home
      </Link>
    </div>
  );
};
