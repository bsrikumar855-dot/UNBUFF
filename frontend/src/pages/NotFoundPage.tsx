import React from "react";
import { Link } from "react-router-dom";
import { buttonClasses } from "@/lib/buttonClasses";

export const NotFoundPage: React.FC = () => {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center px-4 py-16 sm:px-8">
      <p className="eyebrow text-redline">404</p>
      <h2 className="serif mt-3 text-display font-medium text-ink-primary">
        404 — Page Not Found
      </h2>
      <p className="mb-8 mt-4 max-w-md text-ink-secondary">
        The requested path does not exist in UNBLUFF.
      </p>
      <Link to="/" className={buttonClasses("secondary")}>
        Return to Home
      </Link>
    </div>
  );
};
