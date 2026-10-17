import React from "react";
import { useRoles } from "@/hooks/useRoles";
import { CardRadioGroup } from "@/components/ui/CardRadioGroup";
import { ErrorState } from "@/components/ui/ErrorState";

interface RoleSelectorProps {
  value: string | null;
  onChange: (roleId: string) => void;
}

function RoleSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-md border border-line bg-surface-100" />
      ))}
    </div>
  );
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({ value, onChange }) => {
  const { roles, isLoading, error, retry } = useRoles();

  if (isLoading) return <RoleSkeleton />;
  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (!roles || roles.length === 0) {
    return <p className="text-sm text-ink-muted">No roles are available right now.</p>;
  }

  return (
    <CardRadioGroup
      ariaLabel="Target role"
      value={value}
      onChange={onChange}
      options={roles.map((role) => ({
        value: role.id,
        title: role.name,
        description: role.description,
      }))}
    />
  );
};
