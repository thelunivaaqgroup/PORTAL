import { Link } from "react-router-dom";
import Button from "../components/Button";
import { Card, CardBody } from "../components/Card";
import Badge from "../components/Badge";

export default function Landing() {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Welcome to Portal
        </h1>
        <p className="text-base text-gray-600">
          Your central hub for everything.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">
                Fast
              </h3>
              <Badge variant="success">Live</Badge>
            </div>
            <p className="text-sm text-gray-500">
              Built on modern tooling for instant feedback.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">
                Secure
              </h3>
              <Badge variant="neutral">Planned</Badge>
            </div>
            <p className="text-sm text-gray-500">
              Authentication and role-based access built in.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">
                Scalable
              </h3>
              <Badge variant="warning">Soon</Badge>
            </div>
            <p className="text-sm text-gray-500">
              Modular architecture ready to grow with you.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="flex justify-center gap-3">
        <Link to="/login">
          <Button>Get started</Button>
        </Link>
        <Link to="/dashboard">
          <Button variant="secondary">View dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
