import * as React from "react";
import { Button, type ButtonProps } from "./button";

export interface ActionButtonProps extends Omit<ButtonProps, "size"> {
  loadingText?: string;
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ loadingText, loading, children, className, ...props }, ref) => (
    <Button
      ref={ref}
      size="sm"
      loading={loading}
      className={`whitespace-nowrap ${className ?? ""}`}
      {...props}
    >
      {loading && loadingText ? loadingText : children}
    </Button>
  )
);
ActionButton.displayName = "ActionButton";

export { ActionButton };
