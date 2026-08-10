import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
}

export function SubmitButton({ pendingText, icon, children }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-amber-500 px-4 py-2 font-medium text-emerald-950 transition-colors hover:bg-amber-400"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="size-4 animate-spin rounded-full border-2 border-emerald-950/30 border-t-emerald-950" />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </Button>
  );
}
