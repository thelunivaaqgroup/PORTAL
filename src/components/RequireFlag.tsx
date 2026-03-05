import type { ReactNode } from "react";
import type { FeatureFlag } from "../config/flags";
import { useFlag } from "../context/useFlag";
import { Card, CardBody } from "./Card";
import Alert from "./Alert";

type RequireFlagProps = {
  flag: FeatureFlag;
  children: ReactNode;
};

export default function RequireFlag({ flag, children }: RequireFlagProps) {
  const enabled = useFlag(flag);

  if (!enabled) {
    return (
      <div className="py-16 flex justify-center">
        <Card className="max-w-md w-full">
          <CardBody className="text-center space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">
              Feature disabled
            </h2>
            <Alert variant="info">
              This feature is not currently available. Check back later.
            </Alert>
          </CardBody>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
