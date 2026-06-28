"use client";

import { useEffect, useState } from "react";

export default function KeysPage() {
  const [keys, setKeys] = useState([]);

  async function fetchKeys() {
    const res = await fetch("http://localhost:3000/api/keys");
    const data = await res.json();
    setKeys(data);
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">VPN Keys</h1>

      <div className="space-y-4">
        {keys.map((key) => (
          <div key={key.id} className="border p-4 rounded">
            <p><b>Name:</b> {key.key_name}</p>
            <p><b>Status:</b> {key.status}</p>
            <p><b>Used:</b> {key.is_used ? "Yes" : "No"}</p>
            <p><b>Order:</b> {key.order_id || "Available"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}