import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  shortcut?: string;
  pressed: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
};

/** An icon button that is on or off, such as a tool or bold. */
export function ToggleButton({ label, shortcut, pressed, onClick, className, children }: Props) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      className={cn("aria-pressed:bg-accent-subtle aria-pressed:text-accent", className)}
    >
      {children}
    </Button>
  );
}
