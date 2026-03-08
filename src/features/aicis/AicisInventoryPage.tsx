import { useState, useRef } from "react";
import { FlaskConical } from "lucide-react";
import { useAicisActive, useAicisImport } from "./hooks/useAicisApi";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import { Card, CardBody } from "../../components/Card";
import { SkeletonLine } from "../../components/Skeleton";
import Can from "../../components/Can";
import { useToast } from "../../context/useToast";

export default function AicisInventoryPage() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useAicisActive("AU");
  const importMutation = useAicisImport();

  const [versionName, setVersionName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const snapshot = data?.snapshot ?? null;
  const hasActive = data?.active ?? false;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file) {
      // Auto-fill version name from filename (without .xlsx extension)
      const defaultName = file.name.replace(/\.xlsx$/i, "");
      setVersionName(defaultName);
    }
  }

  function handleImport() {
    if (!selectedFile) return;

    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("regionCode", "AU");
    if (versionName.trim()) {
      fd.append("versionName", versionName.trim());
    }

    importMutation.mutate(fd, {
      onSuccess: (res) => {
        toast(
          "success",
          `AICIS snapshot imported: ${res.snapshot.rowCount.toLocaleString()} chemicals from "${res.snapshot.versionName}"`,
        );
        setSelectedFile(null);
        setVersionName("");
        if (fileRef.current) fileRef.current.value = "";
        refetch();
      },
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Import failed"),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AICIS Inventory (Australia)"
        subtitle="Australian Industrial Chemicals Introduction Scheme — official chemical inventory"
        icon={FlaskConical}
      />

      {/* Active Snapshot Card */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Active Snapshot</h3>
            {hasActive && <Badge variant="success">ACTIVE</Badge>}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-3/4" />
            </div>
          ) : !snapshot ? (
            <p className="text-sm text-gray-500">
              No AICIS inventory snapshot has been imported yet. Upload the official Excel file below to activate compliance checking.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Version" value={snapshot.versionName} />
              <Field label="Region" value={snapshot.regionCode} />
              <Field label="Chemical Count" value={snapshot.chemicalCount.toLocaleString()} />
              <Field label="Row Count" value={snapshot.rowCount.toLocaleString()} />
              <Field label="Source File" value={snapshot.sourceFileName} />
              <Field label="SHA-256" value={snapshot.fileSha256.slice(0, 16) + "..."} />
              <Field
                label="Imported At"
                value={new Date(snapshot.importedAt).toLocaleString()}
              />
              <Field
                label="Imported By"
                value={snapshot.importedBy?.fullName ?? "—"}
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Upload Section (permission-gated) */}
      <Can permission="aicis:import">
        <Card>
          <CardBody className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {hasActive ? "Replace Snapshot" : "Import AICIS Inventory"}
            </h3>
            <p className="text-xs text-gray-500">
              Upload the official AICIS Excel file (.xlsx). A new snapshot will be created and set as the active inventory for Australia. The previous snapshot will be deactivated but not deleted.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Excel File (.xlsx) <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  ref={fileRef}
                  accept=".xlsx"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onChange={handleFileChange}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Version Name
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="Auto-filled from filename"
                />
              </div>
            </div>

            <Button
              onClick={handleImport}
              disabled={!selectedFile || importMutation.isPending}
            >
              {importMutation.isPending ? "Importing..." : "Upload & Import"}
            </Button>
          </CardBody>
        </Card>
      </Can>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}:</span>{" "}
      <span className="text-gray-900">{value}</span>
    </div>
  );
}
