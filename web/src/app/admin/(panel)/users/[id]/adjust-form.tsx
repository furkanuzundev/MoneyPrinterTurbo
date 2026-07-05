"use client";

import { useActionState } from "react";
import { adjustCreditsAction, type AdjustState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdjustCreditsForm({ userId }: { userId: string }) {
  const action = adjustCreditsAction.bind(null, userId);
  const [state, formAction, pending] = useActionState<AdjustState, FormData>(
    action,
    {},
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="delta" className="text-xs text-muted-foreground">
          Kredi (± tam sayı)
        </label>
        <Input id="delta" name="delta" type="number" step={1} required className="w-28" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="note" className="text-xs text-muted-foreground">
          Not (opsiyonel)
        </label>
        <Input id="note" name="note" className="w-64" maxLength={200} />
      </div>
      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Uygulanıyor…" : "Uygula"}
      </Button>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-muted-foreground">Uygulandı.</p> : null}
    </form>
  );
}
