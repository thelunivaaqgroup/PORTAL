import { useState, type FormEvent } from "react";
import { useDemoData } from "../hooks/useDemoData";
import DemoTable from "../components/DemoTable";
import PageHeader from "../../../components/PageHeader";
import Button from "../../../components/Button";
import Modal from "../../../components/Modal";
import Input from "../../../components/Input";
import Can from "../../../components/Can";
import { useToast } from "../../../context/useToast";

export default function DemoListPage() {
  const { items, addItem, removeItem } = useDemoData();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addItem(name.trim(), description.trim());
    toast("success", `"${name.trim()}" created`);
    setName("");
    setDescription("");
    setCreateOpen(false);
  }

  function handleDelete(id: string) {
    const item = items.find((i) => i.id === id);
    removeItem(id);
    toast("success", `"${item?.name ?? "Item"}" deleted`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demo Items"
        subtitle="A reference feature module showing list/create/delete patterns."
        action={
          <Can permission="demo:create">
            <Button onClick={() => setCreateOpen(true)}>New Item</Button>
          </Can>
        }
      />

      <DemoTable items={items} onDelete={handleDelete} />

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            New Item
          </h3>
          <Input
            label="Name"
            placeholder="Item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Description"
            placeholder="Short description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
