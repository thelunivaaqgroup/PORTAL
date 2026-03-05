import { useState } from "react";
import Button from "./Button";

type PageErrorProps = {
  title?: string;
  message?: string;
  details?: string;
  onRetry?: () => void;
  onReload?: boolean;
};

export default function PageError({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  details,
  onRetry,
  onReload,
}: PageErrorProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-600">{message}</p>
      <div className="flex gap-3">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {onReload && (
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </Button>
        )}
      </div>
      {details && (
        <div className="w-full max-w-md">
          <button
            onClick={() => setShowDetails((p) => !p)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
          {showDetails && (
            <pre className="mt-2 overflow-auto rounded-md bg-gray-100 p-3 text-left text-xs text-gray-700">
              {details}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
