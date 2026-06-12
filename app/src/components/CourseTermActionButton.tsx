import { forwardRef } from "react";
import { courseTermActionLabel } from "../lib/courseTermActionLabels";

type CourseTermActionButtonProps = {
  action: string;
  courseName: string;
  termIso: string;
  labelExtras?: string[];
  className?: string;
  title?: string;
  inactive?: boolean;
  busy?: boolean;
  onClick: () => void;
};

const CourseTermActionButton = forwardRef<HTMLButtonElement, CourseTermActionButtonProps>(
  function CourseTermActionButton(
    {
      action,
      courseName,
      termIso,
      labelExtras = [],
      className,
      title,
      inactive,
      busy,
      onClick,
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        className={className}
        aria-label={courseTermActionLabel(courseName, action, termIso, labelExtras)}
        aria-busy={busy || undefined}
        aria-disabled={inactive || undefined}
        title={title}
        onClick={() => {
          if (inactive) return;
          onClick();
        }}
      >
        {action}
      </button>
    );
  },
);

export default CourseTermActionButton;
