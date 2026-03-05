import Spinner from "./Spinner";

type PageLoadingProps = {
  label?: string;
};

export default function PageLoading({ label = "Loading…" }: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <Spinner />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
