"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateKeyPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    key_name: "",
    access_url: "",
  });

  async function handleSubmit(e) {
    e.preventDefault();

    await fetch("http://localhost:3000/api/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    router.push("/keys");
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Add VPN Key</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          placeholder="Key name"
          className="w-full border px-3 py-2"
          value={form.key_name}
          onChange={(e) =>
            setForm({ ...form, key_name: e.target.value })
          }
        />

        <textarea
          placeholder="Access URL"
          className="w-full border px-3 py-2"
          value={form.access_url}
          onChange={(e) =>
            setForm({ ...form, access_url: e.target.value })
          }
        />

        <button className="border px-4 py-2">
          Add Key
        </button>
      </form>
    </div>
  );
}