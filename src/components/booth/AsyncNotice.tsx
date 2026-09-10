import { Button } from "@/components/ui/button";

export const ACTION_ERROR = "Не удалось выполнить действие. Повторите попытку.";

export function AsyncNotice({ message, error = false, onRetry }: {
  message: string;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div role={error ? "alert" : "status"} className="rounded-md border border-fg-subtle/30 bg-bg-subtle px-3 py-2 text-sm text-fg">
      <p>{message}</p>
      {onRetry && <Button type="button" variant="ghost" onClick={onRetry}>Повторить</Button>}
    </div>
  );
}
