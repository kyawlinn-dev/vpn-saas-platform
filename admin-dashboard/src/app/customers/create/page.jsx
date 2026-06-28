"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateCustomerPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    reseller_id: "",
    full_name: "",
    telegram_username: "",
    phone: "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("http://localhost:3000/api/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          reseller_id: form.reseller_id || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create customer");
      }

      router.push("/customers");
      router.refresh();
    } catch (err) {
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Create Customer</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full border rounded px-3 py-2 bg-transparent"
          placeholder="Full name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          required
        />

        <input
          className="w-full border rounded px-3 py-2 bg-transparent"
          placeholder="Telegram username"
          value={form.telegram_username}
          onChange={(e) =>
            setForm({ ...form, telegram_username: e.target.value })
          }
        />

        <input
          className="w-full border rounded px-3 py-2 bg-transparent"
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <textarea
          className="w-full border rounded px-3 py-2 bg-transparent"
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        {error && <p className="text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="border rounded px-4 py-2 hover:bg-neutral-100 hover:text-black disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Customer"}
        </button>
      </form>
    </div>
  );
}