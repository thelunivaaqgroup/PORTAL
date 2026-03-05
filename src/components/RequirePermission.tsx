import type { ReactNode } from "react";
import type { Permission } from "../config/permissions";
import { usePermissions } from "../context/usePermissions";
import { Card, CardBody } from "./Card";
import Alert from "./Alert";

type RequirePermissionProps = {
  permission: Permission;
  children: ReactNode;
};

export default function RequirePermission({
  permission,
  children,
}: RequirePermissionProps) {
  const { has } = usePermissions();

  if (!has(permission)) {
    return (
      <div className="py-16 flex justify-center">
        <Card className="max-w-md w-full">
          <CardBody className="text-center space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">
              Not authorized
            </h2>
            <Alert variant="error">
              You do not have permission to access this page. Contact your
              administrator if you believe this is an error.
            </Alert>
          </CardBody>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
